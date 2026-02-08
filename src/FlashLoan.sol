// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

// Import Aave interfaces
import "./interfaces/IAavePool.sol";
import "./interfaces/IFlashLoanReceiver.sol";
import "./interfaces/IVariableDebtToken.sol";
import "./interfaces/IAaveProtocolDataProvider.sol";

/**
 * @title FlashLoanLeverageHelper
 * @notice Enables instant leveraged positions on Aave V3 using flash loans
 * @dev CRITICAL: Users must approve delegation BEFORE executing leverage
 *
 * How it works:
 * 1. User calls approveDelegation(asset) to allow contract to borrow on their behalf
 * 2. User approves tokens to this contract
 * 3. User calls executeLeverage(asset, targetLeverage, userDeposit)
 * 4. Contract flash loans additional funds (mode=2, creates debt on user)
 * 5. Contract supplies all funds as collateral on behalf of user
 * 6. User ends up with leveraged position (collateral + debt on Aave)
 */

contract FlashLoanLeverageHelper is IFlashLoanReceiver, ReentrancyGuard {
    using SafeERC20 for IERC20;

    // Constants
    address public immutable POOL;
    address public immutable DATA_PROVIDER;
    address public immutable owner;
    uint256 public constant MIN_HEALTH_FACTOR = 1e18; // 1 in 18 decimals
    uint256 public constant MAX_LEVERAGE = 100e18; // 100x max leverage
    uint256 public constant PRECISION = 1e18;
    uint256 public constant BPS_BASE = 10000;

    // State
    mapping(address => bool) public authorizedCallers;
    bool public paused;

    // Events
    event LeverageExecuted(
        address indexed user,
        address indexed asset,
        uint256 totalCollateral,
        uint256 totalDebt,
        uint256 leverage,
        uint256 healthFactor
    );

    event DelegationApproved(
        address indexed user,
        address indexed asset,
        uint256 amount
    );

    event PositionUnwound(
        address indexed user,
        address indexed asset,
        uint256 debtRepaid,
        uint256 collateralWithdrawn,
        uint256 returnedToUser
    );

    event AuthorizedCallerUpdated(address indexed caller, bool authorized);
    event EmergencyPause(bool paused);
    event EmergencyWithdraw(address indexed token, uint256 amount);

    // Custom errors
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

    constructor(address _pool, address _dataProvider) {
        if (_pool == address(0) || _dataProvider == address(0))
            revert InvalidParameters();
        POOL = _pool;
        DATA_PROVIDER = _dataProvider;
        owner = msg.sender;
        authorizedCallers[msg.sender] = true;
    }

    /**
     * @notice STEP 1: User must call this FIRST to approve delegation
     * @dev Approves this contract to incur debt on behalf of the user
     * @param asset The asset to approve delegation for
     * @param amount The amount to approve (use type(uint256).max for unlimited)
     */
    function approveDelegation(address asset, uint256 amount) external {
        if (asset == address(0)) revert InvalidParameters();
        if (amount == 0) revert ZeroValue();

        (, , address variableDebtTokenAddress) = IAaveProtocolDataProvider(
            DATA_PROVIDER
        ).getReserveTokensAddresses(asset);

        if (variableDebtTokenAddress == address(0)) revert InvalidParameters();

        IVariableDebtToken(variableDebtTokenAddress).approveDelegation(
            address(this),
            amount
        );

        emit DelegationApproved(msg.sender, asset, amount);
    }

    /**
     * @notice Check if user has approved sufficient delegation
     * @param user The user address
     * @param asset The asset address
     * @param amount The amount to check
     * @return bool True if sufficient delegation is approved
     */
    function hasSufficientDelegation(
        address user,
        address asset,
        uint256 amount
    ) public view returns (bool) {
        (, , address variableDebtTokenAddress) = IAaveProtocolDataProvider(
            DATA_PROVIDER
        ).getReserveTokensAddresses(asset);

        if (variableDebtTokenAddress == address(0)) return false;

        uint256 allowance = IVariableDebtToken(variableDebtTokenAddress)
            .borrowAllowance(user, address(this));

        return allowance >= amount;
    }

    /**
     * @notice STEP 2: Execute leveraged position using flash loan
     * @dev User must have called approveDelegation() first and approved tokens
     * @param asset The asset to leverage (e.g., USDC)
     * @param targetLeverage Target leverage in 18 decimals (e.g., 3e18 = 3x)
     * @param userDeposit Amount user deposits upfront (must approve to this contract)
     */
    function executeLeverage(
        address asset,
        uint256 targetLeverage,
        uint256 userDeposit
    ) external whenNotPaused nonReentrant {
        // Input validation
        if (asset == address(0)) revert InvalidParameters();
        if (targetLeverage <= PRECISION || targetLeverage > MAX_LEVERAGE)
            revert InvalidParameters();
        if (userDeposit == 0) revert InvalidParameters();

        // Calculate flash loan amount: flashAmount = userDeposit * (targetLeverage - 1)
        uint256 flashAmount = (userDeposit * (targetLeverage - PRECISION)) /
            PRECISION;

        if (flashAmount == 0) revert InvalidParameters();

        // Get actual flash loan premium from Aave
        uint128 premiumBps = IAavePool(POOL).FLASHLOAN_PREMIUM_TOTAL();
        uint256 expectedPremium = (flashAmount * premiumBps) / BPS_BASE;

        // Check delegation approval BEFORE pulling funds
        uint256 totalDebt = flashAmount + expectedPremium;
        if (!hasSufficientDelegation(msg.sender, asset, totalDebt)) {
            revert InsufficientDelegation();
        }

        // Check user has approved and pull tokens
        IERC20 token = IERC20(asset);
        if (token.allowance(msg.sender, address(this)) < userDeposit)
            revert InvalidParameters();

        token.safeTransferFrom(msg.sender, address(this), userDeposit);

        // Prepare flash loan
        address[] memory assets = new address[](1);
        assets[0] = asset;

        uint256[] memory amounts = new uint256[](1);
        amounts[0] = flashAmount;

        // Mode 2 = Variable rate debt (will create debt on onBehalfOf)
        uint256[] memory modes = new uint256[](1);
        modes[0] = 2;

        bytes memory params = abi.encode(
            uint8(0), // opType 0 = leverage
            msg.sender,
            userDeposit,
            targetLeverage,
            expectedPremium
        );

        // Execute flash loan
        // The pool will:
        // 1. Send flashAmount to this contract
        // 2. Call executeOperation
        // 3. Create debt of flashAmount + premium on msg.sender (onBehalfOf)
        IAavePool(POOL).flashLoan(
            address(this),
            assets,
            amounts,
            modes,
            msg.sender, // onBehalfOf - debt will be assigned to user
            params,
            0
        );

        // Validate final position
        _validateFinalPosition(msg.sender, asset, targetLeverage);
    }

    /**
     * @notice Unwind a leveraged position using flash loan
     * @dev User must approve their aToken spending to this contract first
     * @param asset The asset to deleverage (e.g., wstETH)
     */
    function executeDeleverage(
        address asset
    ) external whenNotPaused nonReentrant {
        if (asset == address(0)) revert InvalidParameters();

        // Get user's current debt
        (, , address variableDebtTokenAddress) = IAaveProtocolDataProvider(
            DATA_PROVIDER
        ).getReserveTokensAddresses(asset);

        uint256 debtAmount = IERC20(variableDebtTokenAddress).balanceOf(msg.sender);
        if (debtAmount == 0) revert InvalidParameters();

        // Get aToken address
        (address aTokenAddress, , ) = IAaveProtocolDataProvider(DATA_PROVIDER)
            .getReserveTokensAddresses(asset);

        // Flash loan the debt amount (mode 0 = must repay in same tx)
        address[] memory assets = new address[](1);
        assets[0] = asset;

        uint256[] memory amounts = new uint256[](1);
        amounts[0] = debtAmount;

        uint256[] memory modes = new uint256[](1);
        modes[0] = 0; // Must repay

        bytes memory params = abi.encode(
            uint8(1), // opType 1 = deleverage
            msg.sender,
            aTokenAddress
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

        // Send any remaining tokens back to user
        uint256 remaining = IERC20(asset).balanceOf(address(this));
        if (remaining > 0) {
            IERC20(asset).safeTransfer(msg.sender, remaining);
        }

        emit PositionUnwound(
            msg.sender,
            asset,
            debtAmount,
            remaining + debtAmount, // approximate collateral withdrawn
            remaining
        );
    }

    /**
     * @notice Aave flash loan callback (called by Aave Pool)
     * @dev This is called after the flash loan funds are sent to this contract
     */
    function executeOperation(
        address[] calldata assets,
        uint256[] calldata amounts,
        uint256[] calldata premiums,
        address initiator,
        bytes calldata params
    ) external override returns (bool) {
        // Security: only pool may call
        if (msg.sender != POOL) revert InvalidCaller();
        if (initiator != address(this)) revert InvalidCaller();
        if (assets.length == 0 || amounts.length == 0)
            revert InvalidParameters();

        // Decode operation type
        uint8 opType = abi.decode(params, (uint8));

        if (opType == 0) {
            // === LEVERAGE ===
            (
                ,
                address user,
                uint256 userDeposit,
                ,
                uint256 expectedPremium
            ) = abi.decode(params, (uint8, address, uint256, uint256, uint256));

            if (premiums[0] != expectedPremium) {
                expectedPremium = premiums[0];
            }

            uint256 totalCollateral = amounts[0] + userDeposit;
            IERC20(assets[0]).forceApprove(POOL, totalCollateral);
            IAavePool(POOL).supply(assets[0], totalCollateral, user, 0);

            // mode=2: debt is auto-created on user, no explicit repay needed
        } else if (opType == 1) {
            // === DELEVERAGE ===
            (
                ,
                address user,
                address aTokenAddress
            ) = abi.decode(params, (uint8, address, address));

            // 1. Repay user's debt with flash loaned funds
            IERC20(assets[0]).forceApprove(POOL, amounts[0]);
            IAavePool(POOL).repay(assets[0], amounts[0], 2, user);

            // 2. Pull user's aTokens (user must have approved this contract)
            uint256 aTokenBalance = IERC20(aTokenAddress).balanceOf(user);
            IERC20(aTokenAddress).safeTransferFrom(user, address(this), aTokenBalance);

            // 3. Withdraw all collateral
            IAavePool(POOL).withdraw(assets[0], type(uint256).max, address(this));

            // 4. Approve pool to pull flash loan repayment (amount + premium)
            uint256 amountOwed = amounts[0] + premiums[0];
            IERC20(assets[0]).forceApprove(POOL, amountOwed);
        } else {
            revert InvalidParameters();
        }

        return true;
    }

    /**
     * @notice Validate final position meets safety requirements
     */
    function _validateFinalPosition(
        address user,
        address asset,
        uint256 targetLeverage
    ) private {
        (
            uint256 totalCollateralBase,
            uint256 totalDebtBase,
            ,
            ,
            ,
            uint256 healthFactor
        ) = IAavePool(POOL).getUserAccountData(user);

        // Check health factor meets minimum
        if (healthFactor < MIN_HEALTH_FACTOR) revert UnsafeLeverage();

        // Validate we have both collateral and debt
        if (totalCollateralBase == 0) revert UnsafeLeverage();
        if (totalDebtBase == 0) revert UnsafeLeverage();
        if (totalCollateralBase <= totalDebtBase) revert UnsafeLeverage();

        // Calculate actual leverage
        uint256 actualLeverage = (totalCollateralBase * PRECISION) /
            (totalCollateralBase - totalDebtBase);

        emit LeverageExecuted(
            user,
            asset,
            totalCollateralBase,
            totalDebtBase,
            actualLeverage,
            healthFactor
        );
    }

    /**
     * @notice Calculate maximum safe leverage for an asset
     * @param asset The asset address
     * @return Maximum safe leverage in PRECISION units (1e18)
     */
    function getMaxSafeLeverage(address asset) external view returns (uint256) {
        if (asset == address(0)) revert InvalidParameters();

        (uint256 configuration, , , , , , , , , , , , , , ) = IAavePool(POOL)
            .getReserveData(asset);

        // Extract LTV from configuration (lower 16 bits, in basis points)
        uint256 ltv = configuration & 0xFFFF;

        if (ltv == 0) return PRECISION; // No borrowing allowed

        // Apply 90% safety margin to LTV
        uint256 safeLtv = (ltv * 90) / 100;

        // Prevent division by zero
        if (safeLtv >= BPS_BASE) return MAX_LEVERAGE;

        // Max leverage = 1 / (1 - safeLTV/10000)
        uint256 maxLeverage = (BPS_BASE * PRECISION) / (BPS_BASE - safeLtv);

        return maxLeverage > MAX_LEVERAGE ? MAX_LEVERAGE : maxLeverage;
    }

    /**
     * @notice Simulate leverage position before execution
     * @dev Returns expected values - actual may vary slightly
     * @param asset The asset to leverage
     * @param targetLeverage Target leverage in 18 decimals
     * @param userDeposit Amount user will deposit
     * @return flashAmount Amount that will be flash loaned
     * @return premium Flash loan fee
     * @return totalCollateral Total collateral that will be supplied
     * @return totalDebt Total debt that will be created on user
     * @return estimatedHealthFactor Estimated health factor after execution
     */
    function simulateLeverage(
        address asset,
        uint256 targetLeverage,
        uint256 userDeposit
    )
        external
        view
        returns (
            uint256 flashAmount,
            uint256 premium,
            uint256 totalCollateral,
            uint256 totalDebt,
            uint256 estimatedHealthFactor
        )
    {
        if (asset == address(0)) revert InvalidParameters();
        if (targetLeverage <= PRECISION || userDeposit == 0)
            revert InvalidParameters();

        // Calculate flash loan amount
        flashAmount = (userDeposit * (targetLeverage - PRECISION)) / PRECISION;

        // Get actual premium rate
        uint128 premiumBps = IAavePool(POOL).FLASHLOAN_PREMIUM_TOTAL();
        premium = (flashAmount * premiumBps) / BPS_BASE;

        // Total collateral supplied
        totalCollateral = flashAmount + userDeposit;

        // Total debt = flash loan + premium
        totalDebt = flashAmount + premium;

        // Get liquidation threshold for health factor estimation
        (uint256 configuration, , , , , , , , , , , , , , ) = IAavePool(POOL)
            .getReserveData(asset);

        // Liquidation threshold is bits 16-31 (in basis points)
        uint256 liquidationThreshold = (configuration >> 16) & 0xFFFF;

        // Health Factor = (Collateral * LiqThreshold / 10000) / Debt
        // Expressed in 1e18 precision
        if (totalDebt == 0) {
            estimatedHealthFactor = type(uint256).max;
        } else {
            estimatedHealthFactor =
                (totalCollateral * liquidationThreshold * PRECISION) /
                (totalDebt * BPS_BASE);
        }
    }

    /**
     * @notice Get current flash loan premium rate
     * @return Premium in basis points (e.g., 5 = 0.05%)
     */
    function getFlashLoanPremium() external view returns (uint128) {
        return IAavePool(POOL).FLASHLOAN_PREMIUM_TOTAL();
    }

    /**
     * @notice Get user's current position on Aave
     * @param user User address
     * @return totalCollateralBase Total collateral in base currency
     * @return totalDebtBase Total debt in base currency
     * @return availableBorrowsBase Available borrowing power
     * @return currentLiquidationThreshold Current liquidation threshold
     * @return ltv Loan to value
     * @return healthFactor Current health factor
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

    /**
     * @notice Allow contract to receive ETH
     */
    receive() external payable {}
}
