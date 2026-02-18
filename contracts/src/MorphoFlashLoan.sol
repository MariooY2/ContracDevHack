// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

import "./interfaces/IMorpho.sol";
import "./interfaces/IMorphoCallbacks.sol";

interface IOracle {
    function price() external view returns (uint256);
}

interface ILiFiDiamond {
    function swapTokensGeneric(
        bytes32 transactionId,
        string calldata integrator,
        string calldata referrer,
        address payable receiver,
        uint256 minAmount,
        bytes calldata swapData
    ) external payable;
}

interface IAerodromeRouter {
    struct Route {
        address from;
        address to;
        bool stable;
        address factory;
    }

    function swapExactTokensForTokens(
        uint256 amountIn,
        uint256 amountOutMin,
        Route[] calldata routes,
        address to,
        uint256 deadline
    ) external returns (uint256[] memory amounts);

    function defaultFactory() external view returns (address);
}

/**
 * @title MorphoFlashLoanLeverageHelper
 * @notice Cross-asset leveraged staking: wstETH collateral / WETH debt via Morpho Blue flash loans
 * @dev
 *   Leverage:  deposit wstETH -> flash-loan WETH (free) -> swap WETH->wstETH -> supply collateral -> borrow WETH (creates debt on user) -> repay flash loan
 *   Deleverage: flash-loan WETH -> repay debt -> withdraw wstETH collateral -> swap wstETH->WETH -> repay flash loan -> return remaining wstETH
 * @dev Key differences from Aave:
 *   - Morpho flash loans have NO premium (free)
 *   - Uses authorization instead of credit delegation
 *   - Callback signature is onMorphoFlashLoan(uint256, bytes) with NO return value
 *   - Uses MarketParams struct instead of asset addresses
 *   - No aToken transfers - uses withdrawCollateral with onBehalf parameter
 */
contract MorphoFlashLoanLeverageHelper is IMorphoFlashLoanCallback, ReentrancyGuard {
    using SafeERC20 for IERC20;

    // Immutables
    address public immutable MORPHO;
    bytes32 public immutable MARKET_ID;
    // MarketParams stored as individual immutables (structs cannot be immutable)
    address public immutable LOAN_TOKEN;
    address public immutable COLLATERAL_TOKEN;
    address public immutable ORACLE;
    address public immutable IRM;
    uint256 public immutable LLTV;
    address public immutable LIFI_DIAMOND;
    address public immutable WETH;
    address public immutable WSTETH;
    address public immutable AERODROME_ROUTER; // Direct swap via Aerodrome (fork fallback)
    address public immutable owner;

    // Constants
    uint24 public constant DEFAULT_POOL_FEE = 100; // 0.01% Uniswap V3 fee tier (wstETH/WETH)
    uint256 public constant MIN_HEALTH_FACTOR = 1e18; // 1.0 in 18 decimals
    uint256 public constant MAX_LEVERAGE = 100e18;
    uint256 public constant PRECISION = 1e18;

    // State
    mapping(address => bool) public authorizedCallers;
    bool public paused;

    // Events
    event LeverageExecuted(
        address indexed user,
        uint256 totalCollateralWsteth,
        uint256 totalDebtWeth,
        uint256 leverage,
        uint256 healthFactor
    );

    event PositionUnwound(
        address indexed user,
        uint256 debtRepaidWeth,
        uint256 collateralWithdrawnWsteth,
        uint256 returnedToUserWsteth
    );

    event AuthorizationChecked(address indexed user, bool isAuthorized);
    event AuthorizedCallerUpdated(address indexed caller, bool authorized);
    event EmergencyPause(bool paused);
    event EmergencyWithdraw(address indexed token, uint256 amount);

    // Errors
    error Unauthorized();
    error ContractPaused();
    error InvalidParameters();
    error InsufficientDeposit();
    error UnsafeLeverage();
    error TransferFailed();
    error InvalidCaller();
    error ZeroValue();
    error AuthorizationNotGranted();
    error NoDebtPosition();
    error InsufficientSwapOutput();

    modifier onlyOwner() {
        if (msg.sender != owner) revert Unauthorized();
        _;
    }

    modifier whenNotPaused() {
        if (paused) revert ContractPaused();
        _;
    }

    /// @notice Helper function to reconstruct MarketParams struct
    function _marketParams() internal view returns (IMorpho.MarketParams memory) {
        return IMorpho.MarketParams({
            loanToken: LOAN_TOKEN,
            collateralToken: COLLATERAL_TOKEN,
            oracle: ORACLE,
            irm: IRM,
            lltv: LLTV
        });
    }

    constructor(
        address _morpho,
        bytes32 _marketId,
        IMorpho.MarketParams memory params,
        address _lifiDiamond,
        address _weth,
        address _wsteth,
        address _aerodromeRouter
    ) {
        if (
            _morpho == address(0) || _marketId == bytes32(0) ||
            _lifiDiamond == address(0) || _weth == address(0) || _wsteth == address(0)
        ) revert InvalidParameters();

        // Verify market params match the market ID
        // Compute market ID locally: keccak256(abi.encode(marketParams))
        bytes32 computedId = keccak256(abi.encode(params));
        if (computedId != _marketId) revert InvalidParameters();

        // Verify market uses WETH as loan token and wstETH as collateral
        if (params.loanToken != _weth || params.collateralToken != _wsteth) {
            revert InvalidParameters();
        }

        MORPHO = _morpho;
        MARKET_ID = _marketId;
        // Store market params as individual immutables
        LOAN_TOKEN = params.loanToken;
        COLLATERAL_TOKEN = params.collateralToken;
        ORACLE = params.oracle;
        IRM = params.irm;
        LLTV = params.lltv;
        LIFI_DIAMOND = _lifiDiamond;
        WETH = _weth;
        WSTETH = _wsteth;
        AERODROME_ROUTER = _aerodromeRouter;

        // Approve Aerodrome Router for direct swaps
        if (_aerodromeRouter != address(0)) {
            IERC20(_weth).forceApprove(_aerodromeRouter, type(uint256).max);
            IERC20(_wsteth).forceApprove(_aerodromeRouter, type(uint256).max);
        }
        owner = msg.sender;

        // Max approve WETH and wstETH to Morpho and LiFi
        IERC20(_weth).forceApprove(_morpho, type(uint256).max);
        IERC20(_wsteth).forceApprove(_morpho, type(uint256).max);
        IERC20(_weth).forceApprove(_lifiDiamond, type(uint256).max);
        IERC20(_wsteth).forceApprove(_lifiDiamond, type(uint256).max);
    }

    /**
     * @notice Execute leveraged position opening
     * @dev User must authorize this contract via Morpho.setAuthorization() before calling
     * @param targetLeverage Desired leverage in 18 decimals (e.g. 2e18 = 2x)
     * @param userDeposit Amount of wstETH user wants to deposit
     * @param lifiSwapData Encoded LiFi swap data for WETH->wstETH swap
     */
    function executeLeverage(
        uint256 targetLeverage,
        uint256 userDeposit,
        bytes calldata lifiSwapData
    ) external whenNotPaused nonReentrant {
        if (targetLeverage <= PRECISION || targetLeverage > MAX_LEVERAGE) revert InvalidParameters();
        if (userDeposit == 0) revert InsufficientDeposit();

        // Check user has authorized this contract
        if (!IMorpho(MORPHO).isAuthorized(msg.sender, address(this))) {
            revert AuthorizationNotGranted();
        }

        // Pull wstETH from user
        IERC20(WSTETH).safeTransferFrom(msg.sender, address(this), userDeposit);

        // Calculate flash loan amount using oracle price (36 decimals)
        uint256 oraclePrice = IOracle(ORACLE).price(); // wstETH/WETH price in 36 decimals
        uint256 flashWeth = (userDeposit * oraclePrice * (targetLeverage - PRECISION)) / (PRECISION * 1e36);

        if (flashWeth == 0) revert InvalidParameters();

        // Encode params for callback
        bytes memory params = abi.encode(
            uint8(0), // operation type: 0 = leverage
            msg.sender,
            userDeposit,
            lifiSwapData
        );

        // Execute flash loan (Morpho flash loans are FREE - no premium)
        IMorpho(MORPHO).flashLoan(WETH, flashWeth, params);
    }

    /**
     * @notice Morpho flash loan callback
     * @dev Called by Morpho after flash loan assets are transferred
     *      Unlike Aave, this does NOT return a boolean - reverts on failure
     * @param assets Amount of WETH flash loaned
     * @param data Encoded operation parameters
     */
    function onMorphoFlashLoan(uint256 assets, bytes calldata data) external override {
        // Verify caller is Morpho
        if (msg.sender != MORPHO) revert InvalidCaller();

        // Decode operation type
        uint8 opType = abi.decode(data, (uint8));

        if (opType == 0) {
            _handleLeverage(assets, data);
        } else if (opType == 1) {
            _handleDeleverage(assets, data);
        } else {
            revert InvalidParameters();
        }

        // NO RETURN VALUE - Morpho will pull repayment after this returns
    }

    /**
     * @notice Internal helper for Aerodrome direct swap
     */
    function _aerodromeSwap(address tokenIn, address tokenOut, uint256 amountIn) internal returns (uint256) {
        address factory = IAerodromeRouter(AERODROME_ROUTER).defaultFactory();

        IAerodromeRouter.Route[] memory routes = new IAerodromeRouter.Route[](1);
        routes[0] = IAerodromeRouter.Route({
            from: tokenIn,
            to: tokenOut,
            stable: false,  // Use volatile pool (more liquidity)
            factory: factory
        });

        uint256[] memory amounts = IAerodromeRouter(AERODROME_ROUTER).swapExactTokensForTokens(
            amountIn,
            0,              // Accept any output (slippage handled by health factor)
            routes,
            address(this),
            block.timestamp
        );

        return amounts[amounts.length - 1];
    }

    /**
     * @notice Internal handler for leverage operation
     * @param flashWeth Amount of WETH flash loaned
     * @param params Encoded parameters
     */
    function _handleLeverage(uint256 flashWeth, bytes calldata params) internal {
        (, address user, uint256 userDeposit, bytes memory lifiSwapData) =
            abi.decode(params, (uint8, address, uint256, bytes));

        // 1. Swap WETH -> wstETH via router (decode router address + calldata)
        uint256 wstethBefore = IERC20(WSTETH).balanceOf(address(this));

        if (lifiSwapData.length > 0) {
            // Mode 1: Generic router call (LiFi on mainnet)
            (address router, bytes memory swapCalldata) = abi.decode(lifiSwapData, (address, bytes));
            IERC20(WETH).forceApprove(router, flashWeth);
            (bool success, ) = router.call(swapCalldata);
            if (!success) revert TransferFailed();
        } else if (AERODROME_ROUTER != address(0)) {
            // Mode 2: Direct Aerodrome swap (works on fork)
            _aerodromeSwap(WETH, WSTETH, flashWeth);
        }

        uint256 wstethAfter = IERC20(WSTETH).balanceOf(address(this));
        uint256 wstethFromSwap = wstethAfter - wstethBefore;

        uint256 totalWsteth = userDeposit + wstethFromSwap;

        // 2. Supply ALL wstETH as collateral on behalf of user
        IMorpho(MORPHO).supplyCollateral(
            _marketParams(),
            totalWsteth,
            user,
            ""
        );

        // 3. Borrow WETH on behalf of user to repay flash loan
        //    This creates debt on the user's position
        (uint256 borrowedAssets,) = IMorpho(MORPHO).borrow(
            _marketParams(),
            flashWeth,
            0, // Use assets, not shares
            user, // Debt assigned to user
            address(this) // WETH received by this contract
        );

        // Morpho will pull flashWeth from this contract as repayment (already approved in constructor)
        // Verify we borrowed enough to repay
        if (borrowedAssets < flashWeth) revert TransferFailed();

        // Validate final position
        _validatePosition(user);
    }

    /**
     * @notice Execute position unwinding (deleverage)
     * @dev User must have authorized this contract via Morpho.setAuthorization()
     * @param lifiSwapData Encoded LiFi swap data for wstETH->WETH swap
     */
    function executeDeleverage(bytes calldata lifiSwapData) external whenNotPaused nonReentrant {
        // Check user has authorized this contract
        if (!IMorpho(MORPHO).isAuthorized(msg.sender, address(this))) {
            revert AuthorizationNotGranted();
        }

        // Get user's current position
        (, uint128 borrowShares, uint128 collateral) = IMorpho(MORPHO).position(MARKET_ID, msg.sender);

        if (borrowShares == 0 && collateral == 0) revert NoDebtPosition();

        // Convert shares to assets to get exact debt amount
        (,, uint128 totalBorrowAssets, uint128 totalBorrowShares,,) = IMorpho(MORPHO).market(MARKET_ID);

        uint256 debtAmount;
        if (totalBorrowShares > 0) {
            debtAmount = (uint256(borrowShares) * uint256(totalBorrowAssets)) / uint256(totalBorrowShares);
        } else {
            debtAmount = 0;
        }

        if (debtAmount == 0) revert NoDebtPosition();

        // Encode params for callback
        bytes memory params = abi.encode(
            uint8(1), // operation type: 1 = deleverage
            msg.sender,
            collateral,
            lifiSwapData
        );

        // Flash loan exact debt amount (Morpho flash loans are FREE)
        IMorpho(MORPHO).flashLoan(WETH, debtAmount, params);
    }

    /**
     * @notice Internal handler for deleverage operation
     * @param flashWeth Amount of WETH flash loaned (equals debt to repay)
     * @param params Encoded parameters
     */
    function _handleDeleverage(uint256 flashWeth, bytes calldata params) internal {
        (, address user, uint256 collateralAmount, bytes memory lifiSwapData) =
            abi.decode(params, (uint8, address, uint256, bytes));

        // 1. Repay user's WETH debt
        IMorpho(MORPHO).repay(
            _marketParams(),
            flashWeth,
            0, // Use assets, not shares
            user,
            ""
        );

        // 2. Withdraw ALL collateral from user's position
        //    User must have authorized this contract
        uint256 withdrawnWsteth = IMorpho(MORPHO).withdrawCollateral(
            _marketParams(),
            type(uint256).max, // Withdraw all
            user,
            address(this)
        );

        // 3. Swap wstETH -> WETH via router to repay flash loan
        uint256 wethBefore = IERC20(WETH).balanceOf(address(this));

        if (lifiSwapData.length > 0) {
            // Mode 1: Generic router call (LiFi on mainnet)
            (address router, bytes memory swapCalldata) = abi.decode(lifiSwapData, (address, bytes));
            IERC20(WSTETH).forceApprove(router, withdrawnWsteth);
            (bool success, ) = router.call(swapCalldata);
            if (!success) revert TransferFailed();
        } else if (AERODROME_ROUTER != address(0)) {
            // Mode 2: Direct Aerodrome swap (works on fork)
            _aerodromeSwap(WSTETH, WETH, withdrawnWsteth);
        }

        uint256 wethAfter = IERC20(WETH).balanceOf(address(this));
        uint256 wethReceived = wethAfter - wethBefore;


        // Verify we got enough WETH to repay flash loan
        if (wethReceived < flashWeth) revert InsufficientSwapOutput();

        // Morpho will pull flashWeth from this contract as repayment (already approved)

        // 4. Return remaining wstETH to user
        uint256 remainingWsteth = IERC20(WSTETH).balanceOf(address(this));
        if (remainingWsteth > 0) {
            IERC20(WSTETH).safeTransfer(user, remainingWsteth);
        }

        // Return any surplus WETH to user (after flash loan repayment)
        uint256 surplusWeth = wethAfter - flashWeth;
        if (surplusWeth > 0) {
            IERC20(WETH).safeTransfer(user, surplusWeth);
        }

        emit PositionUnwound(user, flashWeth, withdrawnWsteth, remainingWsteth);
    }

    /**
     * @notice Validate user's position health factor
     * @param user User address
     */
    function _validatePosition(address user) internal {
        (, uint128 borrowShares, uint128 collateral) = IMorpho(MORPHO).position(MARKET_ID, user);

        if (collateral == 0 || borrowShares == 0) revert UnsafeLeverage();

        // Calculate health factor
        uint256 healthFactor = _calculateHealthFactor(user);

        if (healthFactor < MIN_HEALTH_FACTOR) revert UnsafeLeverage();

        emit LeverageExecuted(user, collateral, borrowShares, 0, healthFactor);
    }

    /**
     * @notice Calculate health factor for a user
     * @param user User address
     * @return Health factor in 18 decimals
     */
    function _calculateHealthFactor(address user) internal view returns (uint256) {
        (, uint128 borrowShares, uint128 collateral) = IMorpho(MORPHO).position(MARKET_ID, user);

        if (borrowShares == 0) return type(uint256).max;

        // Convert shares to assets
        (,, uint128 totalBorrowAssets, uint128 totalBorrowShares,,) = IMorpho(MORPHO).market(MARKET_ID);

        uint256 debtAssets;
        if (totalBorrowShares > 0) {
            debtAssets = (uint256(borrowShares) * uint256(totalBorrowAssets)) / uint256(totalBorrowShares);
        } else {
            return type(uint256).max;
        }

        // Get exchange rate from oracle (wstETH/WETH price in 36 decimals)
        uint256 oraclePrice = IOracle(ORACLE).price();

        // Calculate collateral value in ETH terms
        uint256 collateralValueEth = (uint256(collateral) * oraclePrice) / 1e36;

        // Health Factor = (collateral * LLTV) / debt
        // Both in WETH/ETH terms
        uint256 lltv = LLTV;
        uint256 healthFactor = (collateralValueEth * lltv) / debtAssets;

        return healthFactor;
    }

    // ====== VIEW FUNCTIONS ======

    /**
     * @notice Simulate leverage execution
     * @param targetLeverage Desired leverage
     * @param userDeposit Amount to deposit
     */
    function simulateLeverage(uint256 targetLeverage, uint256 userDeposit)
        external
        view
        returns (
            uint256 flashWethAmount,
            uint256 totalCollateralWsteth,
            uint256 totalDebtWeth,
            uint256 estimatedHealthFactor
        )
    {
        if (targetLeverage <= PRECISION || userDeposit == 0) {
            return (0, 0, 0, 0);
        }

        uint256 oraclePrice = IOracle(ORACLE).price(); // wstETH/WETH price in 36 decimals
        flashWethAmount = (userDeposit * oraclePrice * (targetLeverage - PRECISION)) / (PRECISION * 1e36);

        // Estimate wstETH from swap (approximate, assumes 1:1 after accounting for oracle price)
        uint256 estimatedWstethFromSwap = (flashWethAmount * 1e36) / oraclePrice;
        totalCollateralWsteth = userDeposit + estimatedWstethFromSwap;
        totalDebtWeth = flashWethAmount;

        // Calculate health factor
        uint256 collateralValueEth = (totalCollateralWsteth * oraclePrice) / 1e36;
        uint256 lltv = LLTV;
        estimatedHealthFactor = (collateralValueEth * lltv) / totalDebtWeth;

        return (flashWethAmount, totalCollateralWsteth, totalDebtWeth, estimatedHealthFactor);
    }

    /**
     * @notice Get user's current position
     * @param user User address
     */
    function getUserPosition(address user)
        external
        view
        returns (uint256 collateralAssets, uint256 debtAssets, uint256 healthFactor)
    {
        (, uint128 borrowShares, uint128 collateral) = IMorpho(MORPHO).position(MARKET_ID, user);

        collateralAssets = uint256(collateral);

        // Convert borrow shares to assets
        if (borrowShares > 0) {
            (,, uint128 totalBorrowAssets, uint128 totalBorrowShares,,) = IMorpho(MORPHO).market(MARKET_ID);
            if (totalBorrowShares > 0) {
                debtAssets = (uint256(borrowShares) * uint256(totalBorrowAssets)) / uint256(totalBorrowShares);
            }
        }

        healthFactor = _calculateHealthFactor(user);

        return (collateralAssets, debtAssets, healthFactor);
    }

    /**
     * @notice Get maximum safe leverage based on LLTV
     * @return Max leverage in 18 decimals
     */
    function getMaxSafeLeverage() external view returns (uint256) {
        uint256 lltv = LLTV;

        // Max leverage = 1 / (1 - LLTV)
        // Leave 5% safety margin
        uint256 maxTheoretical = PRECISION * PRECISION / (PRECISION - lltv);
        uint256 maxSafe = (maxTheoretical * 95) / 100;

        return maxSafe;
    }

    /**
     * @notice Check if user has authorized this contract
     * @param user User address
     * @return True if authorized
     */
    function hasAuthorization(address user) external view returns (bool) {
        return IMorpho(MORPHO).isAuthorized(user, address(this));
    }

    // ====== ADMIN FUNCTIONS ======

    function setAuthorizedCaller(address caller, bool authorized) external onlyOwner {
        authorizedCallers[caller] = authorized;
        emit AuthorizedCallerUpdated(caller, authorized);
    }

    function setPaused(bool _paused) external onlyOwner {
        paused = _paused;
        emit EmergencyPause(_paused);
    }

    function emergencyWithdraw(address token) external onlyOwner {
        uint256 balance = IERC20(token).balanceOf(address(this));
        if (balance > 0) {
            IERC20(token).safeTransfer(owner, balance);
            emit EmergencyWithdraw(token, balance);
        }
    }
}
