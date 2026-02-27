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

/// @notice Uniswap V3 SwapRouter02 interface
interface ISwapRouter {
    struct ExactInputSingleParams {
        address tokenIn;
        address tokenOut;
        uint24 fee;
        address recipient;
        uint256 amountIn;
        uint256 amountOutMinimum;
        uint160 sqrtPriceLimitX96;
    }

    function exactInputSingle(ExactInputSingleParams calldata params) external payable returns (uint256 amountOut);
}

/// @notice Uniswap V3 pool interface (for price queries)
interface IUniV3Pool {
    function slot0() external view returns (
        uint160 sqrtPriceX96,
        int24 tick,
        uint16 observationIndex,
        uint16 observationCardinality,
        uint16 observationCardinalityNext,
        uint8 feeProtocol,
        bool unlocked
    );
}

/**
 * @title MorphoFlashLoanLeverageHelper
 * @notice Cross-asset leveraged staking: wstETH collateral / WETH debt via Morpho Blue flash loans
 * @dev
 *   Leverage:  deposit wstETH -> flash-loan WETH (free) -> swap WETH->wstETH via Uniswap V3 -> supply collateral -> borrow WETH -> repay flash loan
 *   Deleverage: flash-loan WETH -> repay debt -> withdraw wstETH collateral -> swap wstETH->WETH via Uniswap V3 -> repay flash loan -> return remaining wstETH
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
    address public immutable WETH;
    address public immutable WSTETH;
    address public immutable SWAP_ROUTER;        // Uniswap V3 SwapRouter02
    address public immutable UNI_POOL;           // Uniswap V3 wstETH/WETH pool
    uint24  public immutable POOL_FEE;           // Uniswap V3 fee tier (100 = 0.01%)
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
        address _weth,
        address _wsteth,
        address _swapRouter,
        address _uniPool,
        uint24 _poolFee
    ) {
        if (
            _morpho == address(0) || _marketId == bytes32(0) ||
            _weth == address(0) || _wsteth == address(0)
        ) revert InvalidParameters();

        // Verify market params match the market ID
        bytes32 computedId = keccak256(abi.encode(params));
        if (computedId != _marketId) revert InvalidParameters();

        // Verify market uses WETH as loan token and wstETH as collateral
        if (params.loanToken != _weth || params.collateralToken != _wsteth) {
            revert InvalidParameters();
        }

        MORPHO = _morpho;
        MARKET_ID = _marketId;
        LOAN_TOKEN = params.loanToken;
        COLLATERAL_TOKEN = params.collateralToken;
        ORACLE = params.oracle;
        IRM = params.irm;
        LLTV = params.lltv;
        WETH = _weth;
        WSTETH = _wsteth;
        SWAP_ROUTER = _swapRouter;
        UNI_POOL = _uniPool;
        POOL_FEE = _poolFee;

        // Approve Uniswap V3 Router for swaps
        if (_swapRouter != address(0)) {
            IERC20(_weth).forceApprove(_swapRouter, type(uint256).max);
            IERC20(_wsteth).forceApprove(_swapRouter, type(uint256).max);
        }
        owner = msg.sender;

        // Max approve WETH and wstETH to Morpho
        IERC20(_weth).forceApprove(_morpho, type(uint256).max);
        IERC20(_wsteth).forceApprove(_morpho, type(uint256).max);
    }

    /**
     * @notice Execute leveraged position opening
     * @dev User must authorize this contract via Morpho.setAuthorization() before calling
     * @param targetLeverage Desired leverage in 18 decimals (e.g. 2e18 = 2x)
     * @param userDeposit Amount of wstETH user wants to deposit
     */
    function executeLeverage(
        uint256 targetLeverage,
        uint256 userDeposit
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
            userDeposit
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
     * @notice Internal helper for Uniswap V3 exact-input swap
     */
    function _uniV3Swap(address tokenIn, address tokenOut, uint256 amountIn) internal returns (uint256) {
        return ISwapRouter(SWAP_ROUTER).exactInputSingle(
            ISwapRouter.ExactInputSingleParams({
                tokenIn: tokenIn,
                tokenOut: tokenOut,
                fee: POOL_FEE,
                recipient: address(this),
                amountIn: amountIn,
                amountOutMinimum: 0,
                sqrtPriceLimitX96: 0
            })
        );
    }


    /**
     * @notice Internal handler for leverage operation
     * @param flashWeth Amount of WETH flash loaned
     * @param params Encoded parameters
     */
    function _handleLeverage(uint256 flashWeth, bytes calldata params) internal {
        (, address user, uint256 userDeposit) =
            abi.decode(params, (uint8, address, uint256));

        // 1. Swap WETH -> wstETH via Aerodrome
        uint256 wstethBefore = IERC20(WSTETH).balanceOf(address(this));

        _uniV3Swap(WETH, WSTETH, flashWeth);

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
     *      Repays the exact debt, withdraws all collateral, and returns all equity wstETH.
     *      Uses Aerodrome for the wstETH→WETH swap with oracle-calculated exact amounts.
     */
    function executeDeleverage() external whenNotPaused nonReentrant {
        // Check user has authorized this contract
        if (!IMorpho(MORPHO).isAuthorized(msg.sender, address(this))) {
            revert AuthorizationNotGranted();
        }

        // Get user's current position
        (, uint128 borrowShares, uint128 collateral) = IMorpho(MORPHO).position(MARKET_ID, msg.sender);

        if (borrowShares == 0 && collateral == 0) revert NoDebtPosition();

        // Convert shares to assets (round UP) to ensure flash loan covers full debt
        (,, uint128 totalBorrowAssets, uint128 totalBorrowShares,,) = IMorpho(MORPHO).market(MARKET_ID);

        uint256 debtAmount;
        if (totalBorrowShares > 0) {
            debtAmount = (uint256(borrowShares) * uint256(totalBorrowAssets) + uint256(totalBorrowShares) - 1) / uint256(totalBorrowShares);
        }

        if (debtAmount == 0) revert NoDebtPosition();

        // Small buffer (0.1%) covers interest accrued between this read and repay().
        // Morpho flash loans are FREE — any surplus WETH is returned to the user.
        uint256 flashAmount = debtAmount + debtAmount / 1000 + 1;

        bytes memory params = abi.encode(
            uint8(1), // operation type: 1 = deleverage
            msg.sender,
            uint256(collateral),
            borrowShares
        );

        IMorpho(MORPHO).flashLoan(WETH, flashAmount, params);
    }

    /**
     * @notice Internal handler for deleverage operation
     * @dev Repays exact debt via shares, withdraws all collateral, swaps minimum wstETH
     *      using oracle price (ceiling division), and returns all remaining wstETH to user.
     */
    function _handleDeleverage(uint256 flashWeth, bytes calldata params) internal {
        (, address user, uint256 collateralAmount, uint128 borrowShares) =
            abi.decode(params, (uint8, address, uint256, uint128));

        // 1. Repay exact debt using shares — guarantees zero residual debt
        (uint256 assetsRepaid,) = IMorpho(MORPHO).repay(
            _marketParams(),
            0,           // assets = 0 → use shares
            borrowShares, // exact shares clears 100% of debt
            user,
            ""
        );

        // 2. Withdraw ALL wstETH collateral from user's Morpho position
        IMorpho(MORPHO).withdrawCollateral(
            _marketParams(),
            collateralAmount,
            user,
            address(this)
        );

        // 3. Swap the minimum wstETH→WETH needed to repay the flash loan
        //    wethBalance after repay = flashWeth - assetsRepaid (what's left after debt payment)
        //    deficit = assetsRepaid (we must swap exactly the debt amount worth of wstETH)
        uint256 wethBalance = IERC20(WETH).balanceOf(address(this));
        uint256 wethDeficit = flashWeth > wethBalance ? flashWeth - wethBalance : 0;

        if (wethDeficit > 0) {
            uint256 oraclePrice = IOracle(ORACLE).price(); // wstETH/WETH in 36 decimals

            // Apply 2% slippage buffer: CL pool rate is very close to oracle (~0.1% gap)
            // (ceiling division so we never under-swap)
            uint256 wstethToSwap = (wethDeficit * 1e36 * 102 + oraclePrice * 100 - 1) / (oraclePrice * 100);
            uint256 availableWsteth = IERC20(WSTETH).balanceOf(address(this));
            if (wstethToSwap > availableWsteth) wstethToSwap = availableWsteth;

            _uniV3Swap(WSTETH, WETH, wstethToSwap);

            // If still short (extreme slippage), swap ALL remaining wstETH as safety net.
            // Surplus WETH beyond flashWeth is returned to the user below.
            uint256 wethAfterFirst = IERC20(WETH).balanceOf(address(this));
            if (wethAfterFirst < flashWeth) {
                uint256 remaining = IERC20(WSTETH).balanceOf(address(this));
                if (remaining > 0) _uniV3Swap(WSTETH, WETH, remaining);
            }
        }

        // Verify flash loan is fully covered before Morpho pulls repayment
        uint256 wethFinal = IERC20(WETH).balanceOf(address(this));
        if (wethFinal < flashWeth) revert InsufficientSwapOutput();

        // 4. Swap surplus WETH back to wstETH so user receives everything in one token
        uint256 surplusWeth = wethFinal > flashWeth ? wethFinal - flashWeth : 0;
        if (surplusWeth > 0) {
            _uniV3Swap(WETH, WSTETH, surplusWeth);
        }

        // 5. Return ALL wstETH to user (equity + converted surplus)
        uint256 remainingWsteth = IERC20(WSTETH).balanceOf(address(this));
        if (remainingWsteth > 0) {
            IERC20(WSTETH).safeTransfer(user, remainingWsteth);
        }

        emit PositionUnwound(user, assetsRepaid, collateralAmount, remainingWsteth);
    }

    /**
     * @notice Estimate swap output from CL pool using slot0 sqrtPriceX96
     * @param amountIn Input amount (18 decimals)
     * @param wethToWsteth True = WETH→wstETH, False = wstETH→WETH
     * @return Estimated output amount (18 decimals)
     * @dev token0 = WETH (lower address), token1 = wstETH
     *      slot0.sqrtPriceX96 encodes price of token0 in token1 = wstETH per WETH
     */
    function _getPoolAmountOut(uint256 amountIn, bool wethToWsteth) internal view returns (uint256) {
        (uint160 sqrtPriceX96,,,,,, ) = IUniV3Pool(UNI_POOL).slot0();
        // price = sqrtPriceX96^2 / 2^192 = wstETH per WETH (token1 per token0)
        // To avoid overflow: split into two divisions by 2^96
        uint256 sqrtPrice = uint256(sqrtPriceX96);
        if (wethToWsteth) {
            // WETH → wstETH: output = amountIn * price = amountIn * sqrtPrice^2 / 2^192
            return (amountIn * sqrtPrice / (1 << 96)) * sqrtPrice / (1 << 96);
        } else {
            // wstETH → WETH: output = amountIn / price = amountIn * 2^192 / sqrtPrice^2
            return (amountIn * (1 << 96) / sqrtPrice) * (1 << 96) / sqrtPrice;
        }
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
        // Flash loan amount uses oracle price (determines how much WETH to borrow)
        flashWethAmount = (userDeposit * oraclePrice * (targetLeverage - PRECISION)) / (PRECISION * 1e36);

        // Use CL pool slot0 price to estimate wstETH received from swap
        uint256 estimatedWstethFromSwap;
        if (UNI_POOL != address(0) && flashWethAmount > 0) {
            estimatedWstethFromSwap = _getPoolAmountOut(flashWethAmount, true);
        } else {
            estimatedWstethFromSwap = (flashWethAmount * 1e36) / oraclePrice;
        }

        totalCollateralWsteth = userDeposit + estimatedWstethFromSwap;
        totalDebtWeth = flashWethAmount;

        // Health factor uses oracle price (same as Morpho liquidation engine)
        uint256 collateralValueEth = (totalCollateralWsteth * oraclePrice) / 1e36;
        uint256 lltv = LLTV;
        if (totalDebtWeth == 0) {
            estimatedHealthFactor = type(uint256).max;
        } else {
            estimatedHealthFactor = (collateralValueEth * lltv) / totalDebtWeth;
        }

        return (flashWethAmount, totalCollateralWsteth, totalDebtWeth, estimatedHealthFactor);
    }

    /**
     * @notice Get current pool exchange rates vs oracle
     * @return poolWstethPerWeth  How much wstETH you get for 1 WETH in the pool (18 decimals)
     * @return poolWethPerWsteth  How much WETH you get for 1 wstETH in the pool (18 decimals)
     * @return oracleWethPerWsteth Oracle price of wstETH in WETH (18 decimals)
     */
    function getExchangeRates()
        external
        view
        returns (
            uint256 poolWstethPerWeth,
            uint256 poolWethPerWsteth,
            uint256 oracleWethPerWsteth
        )
    {
        oracleWethPerWsteth = IOracle(ORACLE).price() / 1e18; // Scale from 1e36 to 1e18
        if (UNI_POOL != address(0)) {
            poolWstethPerWeth = _getPoolAmountOut(1e18, true);   // 1 WETH → ? wstETH
            poolWethPerWsteth = _getPoolAmountOut(1e18, false);  // 1 wstETH → ? WETH
        }
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
