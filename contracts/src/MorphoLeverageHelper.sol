// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts/proxy/utils/UUPSUpgradeable.sol";

import "./interfaces/IMorpho.sol";
import "./interfaces/IMorphoCallbacks.sol";

/**
 * @title MorphoLeverageHelper (UUPS Upgradeable)
 * @notice Generic leveraged position helper for ANY Morpho Blue market.
 *         Supports arbitrary DEX/aggregator swaps (LiFi, Uniswap, 1inch, etc.)
 *         Collects a 0.05% protocol fee on every swap, sent directly to feeRecipient.
 * @dev
 *   Leverage:  deposit collateral -> flash-loan loan token (free) -> swap loan->collateral
 *              via external DEX -> send 0.05% fee to feeRecipient -> supply collateral -> borrow -> repay flash
 *   Deleverage: flash-loan loan token -> repay debt -> withdraw collateral -> swap
 *               collateral->loan via external DEX -> send 0.05% fee to feeRecipient -> repay flash -> return equity
 *
 *   Fees are transferred out immediately — never held in contract. No accounting needed.
 *   Deployed behind an ERC1967 UUPS proxy for upgradeability.
 */
contract MorphoLeverageHelper is Initializable, UUPSUpgradeable, IMorphoFlashLoanCallback, ReentrancyGuard {
    using SafeERC20 for IERC20;

    // ====== STORAGE (proxy-safe) ======
    address public morpho;
    address public owner;
    address public pendingOwner;

    mapping(address => bool) public approvedSwapTargets;
    bool public paused;
    uint256 public emergencyWithdrawUnlockTime;

    /// @notice Protocol fee in basis points (5 = 0.05%)
    uint256 public feeBps;
    /// @notice Address that receives protocol fees immediately on each swap
    address public feeRecipient;

    /// @dev Guard: set to msg.sender during executeLeverage/executeDeleverage, zero otherwise.
    address private _flashLoanInitiator;

    /// @dev Reserved storage gap for future upgrades
    uint256[43] private __gap;

    // ====== CONSTANTS ======
    uint256 public constant MAX_FEE_BPS = 100; // 1% hard cap
    uint256 public constant BPS_DENOMINATOR = 10_000;

    // ====== EVENTS ======
    event LeverageExecuted(
        address indexed user,
        bytes32 indexed marketId,
        uint256 totalCollateral,
        uint256 totalDebt
    );

    event DeleverageExecuted(
        address indexed user,
        bytes32 indexed marketId,
        uint256 debtRepaid,
        uint256 collateralReturned
    );

    event SwapTargetUpdated(address indexed target, bool approved);
    event EmergencyPause(bool paused);
    event FeeUpdated(uint256 oldFeeBps, uint256 newFeeBps);
    event FeeRecipientUpdated(address indexed oldRecipient, address indexed newRecipient);
    event FeeCollected(address indexed token, address indexed recipient, uint256 amount);
    event EmergencyWithdraw(address indexed token, uint256 amount);
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);
    event OwnershipTransferStarted(address indexed previousOwner, address indexed newOwner);

    // ====== ERRORS ======
    error Unauthorized();
    error ContractPaused();
    error InvalidParameters();
    error InvalidSwapTarget();
    error SwapFailed();
    error InsufficientSwapOutput();
    error AuthorizationNotGranted();
    error NoPosition();
    error InsufficientRepayment();
    error FeeTooHigh();

    // ====== MODIFIERS ======
    modifier onlyOwner() {
        if (msg.sender != owner) revert Unauthorized();
        _;
    }

    modifier whenNotPaused() {
        if (paused) revert ContractPaused();
        _;
    }

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    /**
     * @notice Initialize the contract (called once via proxy)
     * @param _morpho Morpho Blue core address
     * @param _feeBps Initial fee in basis points (5 = 0.05%)
     * @param _feeRecipient Address that receives protocol fees
     */
    function initialize(address _morpho, uint256 _feeBps, address _feeRecipient) external initializer {
        if (_morpho == address(0) || _feeRecipient == address(0)) revert InvalidParameters();
        if (_feeBps > MAX_FEE_BPS) revert FeeTooHigh();

        morpho = _morpho;
        owner = msg.sender;
        feeBps = _feeBps;
        feeRecipient = _feeRecipient;
    }

    // ====== UUPS ======

    /// @notice Only owner can authorize upgrades
    function _authorizeUpgrade(address) internal override onlyOwner {}

    // ====== CORE FUNCTIONS ======

    /**
     * @notice Execute leveraged position on any Morpho market
     * @param marketParams The Morpho market to use
     * @param userDeposit Amount of collateral token to deposit from user
     * @param flashLoanAmount Amount of loan token to flash borrow
     * @param minCollateralFromSwap Minimum collateral received from swap (after fee, slippage protection)
     * @param swapTarget Approved DEX/aggregator address
     * @param swapCalldata Encoded swap calldata (built off-chain via LiFi/aggregator API)
     */
    function executeLeverage(
        IMorpho.MarketParams calldata marketParams,
        uint256 userDeposit,
        uint256 flashLoanAmount,
        uint256 minCollateralFromSwap,
        address swapTarget,
        bytes calldata swapCalldata
    ) external whenNotPaused nonReentrant {
        if (userDeposit == 0 || flashLoanAmount == 0 || minCollateralFromSwap == 0) revert InvalidParameters();
        if (!approvedSwapTargets[swapTarget]) revert InvalidSwapTarget();
        if (!IMorpho(morpho).isAuthorized(msg.sender, address(this))) revert AuthorizationNotGranted();

        // Measure actual received amount for fee-on-transfer token support
        uint256 balBefore = IERC20(marketParams.collateralToken).balanceOf(address(this));
        IERC20(marketParams.collateralToken).safeTransferFrom(msg.sender, address(this), userDeposit);
        uint256 actualDeposit = IERC20(marketParams.collateralToken).balanceOf(address(this)) - balBefore;

        bytes memory data = abi.encode(
            uint8(0), msg.sender, marketParams, actualDeposit,
            minCollateralFromSwap, swapTarget, swapCalldata
        );

        // Set flash loan initiator guard
        _flashLoanInitiator = msg.sender;
        IMorpho(morpho).flashLoan(marketParams.loanToken, flashLoanAmount, data);
        _flashLoanInitiator = address(0);
    }

    /**
     * @notice Fully unwind a leveraged position on any Morpho market
     * @param marketParams The Morpho market
     * @param minLoanTokenFromSwap Minimum loan tokens received from swap (after fee, slippage protection)
     * @param swapTarget Approved DEX/aggregator address
     * @param swapCalldata Encoded swap calldata
     */
    function executeDeleverage(
        IMorpho.MarketParams calldata marketParams,
        uint256 minLoanTokenFromSwap,
        address swapTarget,
        bytes calldata swapCalldata
    ) external whenNotPaused nonReentrant {
        if (!approvedSwapTargets[swapTarget]) revert InvalidSwapTarget();
        if (!IMorpho(morpho).isAuthorized(msg.sender, address(this))) revert AuthorizationNotGranted();

        bytes32 marketId = keccak256(abi.encode(marketParams));
        (, uint128 borrowShares, uint128 collateral) = IMorpho(morpho).position(marketId, msg.sender);
        if (borrowShares == 0 && collateral == 0) revert NoPosition();

        (,, uint128 totalBorrowAssets, uint128 totalBorrowShares,,) = IMorpho(morpho).market(marketId);
        uint256 debtAmount;
        if (totalBorrowShares > 0) {
            debtAmount = (uint256(borrowShares) * uint256(totalBorrowAssets) + uint256(totalBorrowShares) - 1) / uint256(totalBorrowShares);
        }
        if (debtAmount == 0) revert NoPosition();

        // 1% buffer covers interest accrued between read and repay
        uint256 flashAmount = debtAmount + debtAmount / 100 + 1;

        bytes memory data = abi.encode(
            uint8(1), msg.sender, marketParams, uint256(collateral),
            borrowShares, minLoanTokenFromSwap, swapTarget, swapCalldata
        );

        // Set flash loan initiator guard
        _flashLoanInitiator = msg.sender;
        IMorpho(morpho).flashLoan(marketParams.loanToken, flashAmount, data);
        _flashLoanInitiator = address(0);
    }

    /// @notice Morpho flash loan callback — only callable by Morpho during an active operation
    function onMorphoFlashLoan(uint256 assets, bytes calldata data) external override {
        if (msg.sender != morpho) revert Unauthorized();
        // Reject external flash loan calls — only our own executeLeverage/executeDeleverage
        if (_flashLoanInitiator == address(0)) revert Unauthorized();

        uint8 opType = abi.decode(data, (uint8));
        if (opType == 0) _handleLeverage(assets, data);
        else if (opType == 1) _handleDeleverage(assets, data);
        else revert InvalidParameters();
    }

    function _handleLeverage(uint256 flashAmount, bytes calldata data) internal {
        (
            , address user,
            IMorpho.MarketParams memory mp,
            uint256 userDeposit,
            uint256 minCollateralFromSwap,
            address swapTarget,
            bytes memory swapCalldata
        ) = abi.decode(data, (uint8, address, IMorpho.MarketParams, uint256, uint256, address, bytes));

        // 1. Swap loan token -> collateral token via external DEX (fee sent to feeRecipient)
        uint256 collateralFromSwap = _executeSwap(
            mp.loanToken, mp.collateralToken, minCollateralFromSwap, swapTarget, swapCalldata
        );

        uint256 totalCollateral = userDeposit + collateralFromSwap;

        // 2. Approve exact amounts for Morpho operations
        IERC20(mp.collateralToken).forceApprove(morpho, totalCollateral);

        // 3. Supply all collateral to Morpho on behalf of user
        IMorpho(morpho).supplyCollateral(mp, totalCollateral, user, "");

        // 4. Borrow loan tokens on behalf of user to repay flash loan
        (uint256 borrowed,) = IMorpho(morpho).borrow(mp, flashAmount, 0, user, address(this));
        if (borrowed < flashAmount) revert InsufficientRepayment();

        // 5. Approve exact flash loan repayment for Morpho pullback
        IERC20(mp.loanToken).forceApprove(morpho, flashAmount);

        emit LeverageExecuted(user, keccak256(abi.encode(mp)), totalCollateral, flashAmount);
    }

    function _handleDeleverage(uint256 flashAmount, bytes calldata data) internal {
        (
            , address user,
            IMorpho.MarketParams memory mp,
            , // collateralAmount snapshot (stale — re-read below)
            , // borrowShares snapshot (stale — re-read below)
            uint256 minLoanTokenFromSwap,
            address swapTarget,
            bytes memory swapCalldata
        ) = abi.decode(data, (uint8, address, IMorpho.MarketParams, uint256, uint128, uint256, address, bytes));

        // 1. Approve exact flash loan amount for debt repayment
        IERC20(mp.loanToken).forceApprove(morpho, flashAmount);

        // 2. Re-read live borrow shares to avoid stale snapshot after partial liquidation
        bytes32 mId = keccak256(abi.encode(mp));
        (, uint128 liveShares, uint128 currentCollateral) = IMorpho(morpho).position(mId, user);

        // 3. Repay all debt using live shares
        (uint256 assetsRepaid,) = IMorpho(morpho).repay(mp, 0, liveShares, user, "");

        // 4. Withdraw all collateral
        IMorpho(morpho).withdrawCollateral(mp, uint256(currentCollateral), user, address(this));

        // 5. Swap collateral -> loan token via external DEX (fee sent to feeRecipient)
        _executeSwap(mp.collateralToken, mp.loanToken, minLoanTokenFromSwap, swapTarget, swapCalldata);

        // 6. Verify flash loan can be repaid
        uint256 loanBalance = IERC20(mp.loanToken).balanceOf(address(this));
        if (loanBalance < flashAmount) revert InsufficientRepayment();

        // 7. Approve exact amount for Morpho flash loan pullback
        IERC20(mp.loanToken).forceApprove(morpho, flashAmount);

        // 8. Return remaining collateral to user (no fee accounting needed — fees already sent out)
        uint256 remainingCollateral = IERC20(mp.collateralToken).balanceOf(address(this));
        if (remainingCollateral > 0) {
            IERC20(mp.collateralToken).safeTransfer(user, remainingCollateral);
        }

        // 9. Return surplus loan tokens to user (no fee accounting needed — fees already sent out)
        uint256 surplus = loanBalance > flashAmount ? loanBalance - flashAmount : 0;
        if (surplus > 0) {
            IERC20(mp.loanToken).safeTransfer(user, surplus);
        }

        emit DeleverageExecuted(user, keccak256(abi.encode(mp)), assetsRepaid, remainingCollateral);
    }

    /**
     * @notice Execute a swap via an approved external DEX/aggregator
     * @dev Approves exact balance, executes calldata, resets approval, sends fee to feeRecipient, checks min output
     */
    function _executeSwap(
        address tokenIn,
        address tokenOut,
        uint256 minAmountOut,
        address swapTarget,
        bytes memory swapCalldata
    ) internal returns (uint256 amountOut) {
        uint256 balanceBefore = IERC20(tokenOut).balanceOf(address(this));

        // Approve swap target for tokenIn balance
        uint256 tokenInBalance = IERC20(tokenIn).balanceOf(address(this));
        IERC20(tokenIn).forceApprove(swapTarget, tokenInBalance);

        // Execute swap
        (bool success,) = swapTarget.call(swapCalldata);
        if (!success) revert SwapFailed();

        // Reset approval
        IERC20(tokenIn).forceApprove(swapTarget, 0);

        // Verify tokenIn was consumed (prevents no-op calldata attacks)
        uint256 tokenInAfter = IERC20(tokenIn).balanceOf(address(this));
        if (tokenInAfter >= tokenInBalance) revert SwapFailed();

        // Calculate gross output
        uint256 grossOut = IERC20(tokenOut).balanceOf(address(this)) - balanceBefore;

        // Deduct protocol fee and send directly to feeRecipient
        uint256 fee = (grossOut * feeBps) / BPS_DENOMINATOR;
        if (fee > 0) {
            IERC20(tokenOut).safeTransfer(feeRecipient, fee);
            emit FeeCollected(tokenOut, feeRecipient, fee);
        }

        amountOut = grossOut - fee;
        if (amountOut < minAmountOut) revert InsufficientSwapOutput();
    }

    // ====== VIEW FUNCTIONS ======

    function hasAuthorization(address user) external view returns (bool) {
        return IMorpho(morpho).isAuthorized(user, address(this));
    }

    function getUserPosition(bytes32 marketId, address user)
        external view returns (uint256 collateral, uint256 debt)
    {
        (, uint128 borrowShares, uint128 col) = IMorpho(morpho).position(marketId, user);
        collateral = uint256(col);
        if (borrowShares > 0) {
            (,, uint128 totalBorrowAssets, uint128 totalBorrowShares,,) = IMorpho(morpho).market(marketId);
            if (totalBorrowShares > 0) {
                debt = (uint256(borrowShares) * uint256(totalBorrowAssets)) / uint256(totalBorrowShares);
            }
        }
    }

    /// @notice Get implementation version for upgrade tracking
    function version() external pure returns (string memory) {
        return "1.0.0";
    }

    // ====== ADMIN FUNCTIONS ======

    function setSwapTarget(address target, bool approved) external onlyOwner {
        approvedSwapTargets[target] = approved;
        emit SwapTargetUpdated(target, approved);
    }

    function setFeeBps(uint256 _feeBps) external onlyOwner {
        if (_feeBps > MAX_FEE_BPS) revert FeeTooHigh();
        emit FeeUpdated(feeBps, _feeBps);
        feeBps = _feeBps;
    }

    function setFeeRecipient(address _feeRecipient) external onlyOwner {
        if (_feeRecipient == address(0)) revert InvalidParameters();
        emit FeeRecipientUpdated(feeRecipient, _feeRecipient);
        feeRecipient = _feeRecipient;
    }

    function setPaused(bool _paused) external onlyOwner {
        paused = _paused;
        emit EmergencyPause(_paused);
    }

    // Two-step ownership transfer
    function transferOwnership(address newOwner) external onlyOwner {
        if (newOwner == address(0)) revert InvalidParameters();
        pendingOwner = newOwner;
        emit OwnershipTransferStarted(owner, newOwner);
    }

    function acceptOwnership() external {
        if (msg.sender != pendingOwner) revert Unauthorized();
        emit OwnershipTransferred(owner, pendingOwner);
        owner = pendingOwner;
        pendingOwner = address(0);
    }

    function requestEmergencyWithdraw() external onlyOwner {
        emergencyWithdrawUnlockTime = block.timestamp + 2 days;
    }

    function emergencyWithdraw(address token) external onlyOwner {
        if (block.timestamp < emergencyWithdrawUnlockTime) revert Unauthorized();
        emergencyWithdrawUnlockTime = 0;
        uint256 balance = IERC20(token).balanceOf(address(this));
        if (balance > 0) {
            IERC20(token).safeTransfer(owner, balance);
            emit EmergencyWithdraw(token, balance);
        }
    }
}
