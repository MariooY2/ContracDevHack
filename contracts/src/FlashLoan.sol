// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

import "./interfaces/IAavePool.sol";
import "./interfaces/IFlashLoanReceiver.sol";
import "./interfaces/IVariableDebtToken.sol";
import "./interfaces/IAaveProtocolDataProvider.sol";
import "./interfaces/ISwapRouter.sol";

interface IWstETH {
    function stEthPerToken() external view returns (uint256);
}

/**
 * @title FlashLoanLeverageHelper
 * @notice Cross-asset leveraged staking: wstETH collateral / WETH debt via Aave V3 flash loans
 * @dev
 *   Leverage:  deposit wstETH -> flash-loan WETH (mode 2, creates debt) -> swap WETH->wstETH -> supply all wstETH
 *   Deleverage: flash-loan WETH (mode 0) -> repay debt -> withdraw wstETH -> swap wstETH->WETH -> repay flash loan -> return remaining wstETH
 */
contract FlashLoanLeverageHelper is IFlashLoanReceiver, ReentrancyGuard {
    using SafeERC20 for IERC20;

    // Immutables
    address public immutable POOL;
    address public immutable DATA_PROVIDER;
    address public immutable SWAP_ROUTER;
    address public immutable WETH;
    address public immutable WSTETH;
    address public immutable owner;

    // Constants
    uint24 public constant DEFAULT_POOL_FEE = 100; // 0.01% Uniswap V3 fee tier (wstETH/WETH)
    uint256 public constant MIN_HEALTH_FACTOR = 1e18; // 1.0 in 18 decimals
    uint256 public constant MAX_LEVERAGE = 100e18;
    uint256 public constant PRECISION = 1e18;
    uint256 public constant BPS_BASE = 10000;

    // State
    mapping(address => bool) public authorizedCallers;
    bool public paused;

    // Events
    event LeverageExecuted(
        address indexed user,
        uint256 totalCollateralBase,
        uint256 totalDebtBase,
        uint256 leverage,
        uint256 healthFactor
    );

    event PositionUnwound(
        address indexed user,
        uint256 debtRepaidWeth,
        uint256 collateralWithdrawnWsteth,
        uint256 returnedToUserWsteth
    );

    event DelegationApproved(address indexed user, uint256 amount);
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
    error DelegationNotApproved();
    error InsufficientDelegation();

    modifier onlyOwner() {
        if (msg.sender != owner) revert Unauthorized();
        _;
    }

    modifier whenNotPaused() {
        if (paused) revert ContractPaused();
        _;
    }

    constructor(
        address _pool,
        address _dataProvider,
        address _swapRouter,
        address _weth,
        address _wsteth
    ) {
        if (
            _pool == address(0) || _dataProvider == address(0) ||
            _swapRouter == address(0) || _weth == address(0) || _wsteth == address(0)
        ) revert InvalidParameters();

        POOL = _pool;
        DATA_PROVIDER = _dataProvider;
        SWAP_ROUTER = _swapRouter;
        WETH = _weth;
        WSTETH = _wsteth;
        owner = msg.sender;
        authorizedCallers[msg.sender] = true;
    }

    // ============ User-facing functions ============

    /**
     * @notice Open a leveraged wstETH position (wstETH collateral / WETH debt)
     * @param targetLeverage Desired leverage in 1e18 units (e.g. 2e18 = 2x)
     * @param userDeposit    Amount of wstETH the user deposits
     * @param minWstethOut   Minimum wstETH received from WETH->wstETH swap (slippage protection)
     */
    function executeLeverage(
        uint256 targetLeverage,
        uint256 userDeposit,
        uint256 minWstethOut
    ) external whenNotPaused nonReentrant {
        if (targetLeverage <= PRECISION || targetLeverage > MAX_LEVERAGE)
            revert InvalidParameters();
        if (userDeposit == 0) revert InvalidParameters();

        // Pull wstETH deposit from user
        IERC20(WSTETH).safeTransferFrom(msg.sender, address(this), userDeposit);

        // Calculate WETH flash loan amount
        // flashWeth = userDeposit * exchangeRate * (leverage - 1)
        // exchangeRate converts wstETH -> ETH terms
        uint256 exchangeRate = IWstETH(WSTETH).stEthPerToken();
        uint256 flashWeth = (userDeposit * exchangeRate * (targetLeverage - PRECISION)) /
            (PRECISION * PRECISION);
        if (flashWeth == 0) revert InvalidParameters();

        // Check WETH credit delegation (mode=2 creates debt, no premium)
        if (!hasSufficientDelegation(msg.sender, flashWeth))
            revert InsufficientDelegation();

        // Flash loan WETH with mode=2 (creates variable debt on user)
        address[] memory assets = new address[](1);
        assets[0] = WETH;

        uint256[] memory amounts = new uint256[](1);
        amounts[0] = flashWeth;

        uint256[] memory modes = new uint256[](1);
        modes[0] = 2; // Variable debt on onBehalfOf

        bytes memory params = abi.encode(
            uint8(0), // opType 0 = leverage
            msg.sender,
            userDeposit,
            minWstethOut
        );

        IAavePool(POOL).flashLoan(
            address(this),
            assets,
            amounts,
            modes,
            msg.sender, // onBehalfOf — WETH debt assigned to user
            params,
            0
        );

        // Validate final position
        _validateFinalPosition(msg.sender, targetLeverage);
    }

    /**
     * @notice Unwind the entire leveraged position
     * @dev User must approve their aWstETH to this contract first
     */
    function executeDeleverage() external whenNotPaused nonReentrant {
        // Get user's WETH debt
        (, , address wethDebtToken) = IAaveProtocolDataProvider(DATA_PROVIDER)
            .getReserveTokensAddresses(WETH);
        uint256 debtAmount = IERC20(wethDebtToken).balanceOf(msg.sender);
        if (debtAmount == 0) revert InvalidParameters();

        // Get aWstETH address
        (address aWstethToken, , ) = IAaveProtocolDataProvider(DATA_PROVIDER)
            .getReserveTokensAddresses(WSTETH);

        // Flash loan WETH (mode=0, must repay in same tx)
        address[] memory assets = new address[](1);
        assets[0] = WETH;

        uint256[] memory amounts = new uint256[](1);
        amounts[0] = debtAmount;

        uint256[] memory modes = new uint256[](1);
        modes[0] = 0;

        bytes memory params = abi.encode(
            uint8(1), // opType 1 = deleverage
            msg.sender,
            aWstethToken
        );

        IAavePool(POOL).flashLoan(
            address(this),
            assets,
            amounts,
            modes,
            address(this), // onBehalfOf doesn't matter for mode 0
            params,
            0
        );

        // Send remaining wstETH back to user
        uint256 remaining = IERC20(WSTETH).balanceOf(address(this));
        if (remaining > 0) {
            IERC20(WSTETH).safeTransfer(msg.sender, remaining);
        }

        // Return any leftover WETH dust
        uint256 wethDust = IERC20(WETH).balanceOf(address(this));
        if (wethDust > 0) {
            IERC20(WETH).safeTransfer(msg.sender, wethDust);
        }

        emit PositionUnwound(msg.sender, debtAmount, remaining + debtAmount, remaining);
    }

    /**
     * @notice Aave flash loan callback (called by Aave Pool)
     */
    function executeOperation(
        address[] calldata assets,
        uint256[] calldata amounts,
        uint256[] calldata premiums,
        address initiator,
        bytes calldata params
    ) external override returns (bool) {
        if (msg.sender != POOL) revert InvalidCaller();
        if (initiator != address(this)) revert InvalidCaller();
        if (assets.length == 0 || amounts.length == 0)
            revert InvalidParameters();

        uint8 opType = abi.decode(params, (uint8));

        if (opType == 0) {
            _handleLeverage(amounts, params);
        } else if (opType == 1) {
            _handleDeleverage(amounts, premiums, params);
        } else {
            revert InvalidParameters();
        }

        return true;
    }

    // ---- Internal callback handlers ----

    function _handleLeverage(
        uint256[] calldata amounts,
        bytes calldata params
    ) internal {
        (
            ,
            address user,
            uint256 userDeposit,
            uint256 minWstethOut
        ) = abi.decode(params, (uint8, address, uint256, uint256));

        uint256 flashWeth = amounts[0];

        // Swap WETH -> wstETH via Uniswap V3
        IERC20(WETH).forceApprove(SWAP_ROUTER, flashWeth);
        uint256 wstethReceived = ISwapRouter(SWAP_ROUTER).exactInputSingle(
            ISwapRouter.ExactInputSingleParams({
                tokenIn: WETH,
                tokenOut: WSTETH,
                fee: DEFAULT_POOL_FEE,
                recipient: address(this),
                deadline: block.timestamp,
                amountIn: flashWeth,
                amountOutMinimum: minWstethOut,
                sqrtPriceLimitX96: 0
            })
        );

        // Supply all wstETH (user's deposit + swapped) as collateral
        uint256 totalWsteth = userDeposit + wstethReceived;
        IERC20(WSTETH).forceApprove(POOL, totalWsteth);
        IAavePool(POOL).supply(WSTETH, totalWsteth, user, 0);

        // mode=2: WETH debt is auto-created on user, no repay needed in callback
    }

    function _handleDeleverage(
        uint256[] calldata amounts,
        uint256[] calldata premiums,
        bytes calldata params
    ) internal {
        (
            ,
            address user,
            address aWstethToken
        ) = abi.decode(params, (uint8, address, address));

        // 1. Repay user's WETH debt with flash-loaned WETH
        IERC20(WETH).forceApprove(POOL, amounts[0]);
        IAavePool(POOL).repay(WETH, amounts[0], 2, user);

        // 2. Pull user's aWstETH (user must have approved this contract)
        uint256 aBalance = IERC20(aWstethToken).balanceOf(user);
        IERC20(aWstethToken).safeTransferFrom(user, address(this), aBalance);

        // 3. Withdraw all wstETH collateral from Aave
        IAavePool(POOL).withdraw(WSTETH, type(uint256).max, address(this));

        // 4. Swap enough wstETH -> WETH to repay flash loan + premium
        uint256 amountOwed = amounts[0] + premiums[0];
        IERC20(WSTETH).forceApprove(SWAP_ROUTER, type(uint256).max);
        ISwapRouter(SWAP_ROUTER).exactOutputSingle(
            ISwapRouter.ExactOutputSingleParams({
                tokenIn: WSTETH,
                tokenOut: WETH,
                fee: DEFAULT_POOL_FEE,
                recipient: address(this),
                deadline: block.timestamp,
                amountOut: amountOwed,
                amountInMaximum: type(uint256).max,
                sqrtPriceLimitX96: 0
            })
        );

        // 5. Approve pool to pull WETH repayment (mode=0)
        IERC20(WETH).forceApprove(POOL, amountOwed);

        // Remaining wstETH stays in contract, sent to user after callback returns
    }

    // ============ View functions ============

    /**
     * @notice Simulate a leverage position (off-chain estimation)
     * @param targetLeverage Target leverage in 1e18 units
     * @param userDeposit    wstETH deposit amount
     * @return flashWethAmount       WETH that will be flash-loaned
     * @return totalCollateralWsteth Total wstETH supplied as collateral
     * @return totalDebtWeth         WETH debt created (mode=2, no premium)
     * @return estimatedHealthFactor Estimated HF in 1e18 precision
     */
    function simulateLeverage(
        uint256 targetLeverage,
        uint256 userDeposit
    )
        external
        view
        returns (
            uint256 flashWethAmount,
            uint256 totalCollateralWsteth,
            uint256 totalDebtWeth,
            uint256 estimatedHealthFactor
        )
    {
        if (targetLeverage <= PRECISION || userDeposit == 0)
            revert InvalidParameters();

        uint256 exchangeRate = IWstETH(WSTETH).stEthPerToken();

        // Flash loan in WETH = deposit * rate * (leverage - 1)
        flashWethAmount =
            (userDeposit * exchangeRate * (targetLeverage - PRECISION)) /
            (PRECISION * PRECISION);

        // Approximate swap: flashWeth -> wstETH (assumes ~1:1 vs exchange rate)
        uint256 swappedWsteth = (flashWethAmount * PRECISION) / exchangeRate;

        totalCollateralWsteth = userDeposit + swappedWsteth;
        totalDebtWeth = flashWethAmount; // mode=2 has no premium

        // Health factor = (collateral_eth * liqThreshold) / (debt_eth * 10000)
        // collateral_eth = totalWsteth * exchangeRate / 1e18
        // debt_eth = totalDebtWeth (WETH = ETH)
        (uint256 config, , , , , , , , , , , , , , ) = IAavePool(POOL)
            .getReserveData(WSTETH);
        uint256 liqThreshold = (config >> 16) & 0xFFFF; // bits 16-31, in BPS

        if (totalDebtWeth == 0) {
            estimatedHealthFactor = type(uint256).max;
        } else {
            // Result is in 1e18 precision:
            // (wsteth_amount * rate * liqThreshold) / (weth_amount * BPS_BASE)
            // dimensions: (1e18 * 1e18 * BPS) / (1e18 * BPS) = 1e18
            estimatedHealthFactor =
                (totalCollateralWsteth * exchangeRate * liqThreshold) /
                (totalDebtWeth * BPS_BASE);
        }
    }

    /**
     * @notice Maximum safe leverage (uses wstETH LTV with 90% safety margin)
     */
    function getMaxSafeLeverage() external view returns (uint256) {
        (uint256 config, , , , , , , , , , , , , , ) = IAavePool(POOL)
            .getReserveData(WSTETH);
        uint256 ltv = config & 0xFFFF;

        if (ltv == 0) return PRECISION;

        uint256 safeLtv = (ltv * 90) / 100;
        if (safeLtv >= BPS_BASE) return MAX_LEVERAGE;

        uint256 maxLev = (BPS_BASE * PRECISION) / (BPS_BASE - safeLtv);
        return maxLev > MAX_LEVERAGE ? MAX_LEVERAGE : maxLev;
    }

    /**
     * @notice Check if user has approved sufficient WETH credit delegation
     * @param user   The user address
     * @param amount The WETH amount to check delegation for
     */
    function hasSufficientDelegation(
        address user,
        uint256 amount
    ) public view returns (bool) {
        (, , address wethDebtToken) = IAaveProtocolDataProvider(DATA_PROVIDER)
            .getReserveTokensAddresses(WETH);
        if (wethDebtToken == address(0)) return false;
        uint256 allowance = IVariableDebtToken(wethDebtToken).borrowAllowance(
            user,
            address(this)
        );
        return allowance >= amount;
    }

    /**
     * @notice Get user's current Aave position
     */
    function getUserPosition(
        address user
    )
        external
        view
        returns (
            uint256 totalCollateralBase,
            uint256 totalDebtBase,
            uint256 availableBorrowsBase,
            uint256 currentLiquidationThreshold,
            uint256 ltv,
            uint256 healthFactor
        )
    {
        return IAavePool(POOL).getUserAccountData(user);
    }

    /**
     * @notice Get current flash loan premium rate
     * @return Premium in basis points (e.g., 5 = 0.05%)
     */
    function getFlashLoanPremium() external view returns (uint128) {
        return IAavePool(POOL).FLASHLOAN_PREMIUM_TOTAL();
    }

    // ============ Internal helpers ============

    function _validateFinalPosition(
        address user,
        uint256 /* targetLeverage */
    ) private {
        (
            uint256 totalCollateralBase,
            uint256 totalDebtBase,
            ,
            ,
            ,
            uint256 healthFactor
        ) = IAavePool(POOL).getUserAccountData(user);

        if (healthFactor < MIN_HEALTH_FACTOR) revert UnsafeLeverage();
        if (totalCollateralBase == 0 || totalDebtBase == 0) revert UnsafeLeverage();
        if (totalCollateralBase <= totalDebtBase) revert UnsafeLeverage();

        uint256 actualLeverage = (totalCollateralBase * PRECISION) /
            (totalCollateralBase - totalDebtBase);

        emit LeverageExecuted(
            user,
            totalCollateralBase,
            totalDebtBase,
            actualLeverage,
            healthFactor
        );
    }

    // ============ Admin Functions ============

    function setAuthorizedCaller(
        address caller,
        bool authorized
    ) external onlyOwner {
        authorizedCallers[caller] = authorized;
        emit AuthorizedCallerUpdated(caller, authorized);
    }

    function setPaused(bool _paused) external onlyOwner {
        paused = _paused;
        emit EmergencyPause(_paused);
    }

    function emergencyWithdraw(
        address token,
        uint256 amount
    ) external onlyOwner {
        IERC20 t = IERC20(token);
        if (amount == 0) amount = t.balanceOf(address(this));
        t.safeTransfer(owner, amount);
        emit EmergencyWithdraw(token, amount);
    }

    receive() external payable {}
}
