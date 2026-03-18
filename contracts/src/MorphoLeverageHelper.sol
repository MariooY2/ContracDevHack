// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

import "./interfaces/IMorpho.sol";
import "./interfaces/IMorphoCallbacks.sol";

/**
 * @title MorphoLeverageHelper
 * @notice Generic leveraged position helper for ANY Morpho Blue market.
 *         Supports arbitrary DEX/aggregator swaps (LiFi, Uniswap, 1inch, etc.)
 * @dev
 *   Leverage:  deposit collateral → flash-loan loan token (free) → swap loan→collateral
 *              via external DEX → supply all collateral → borrow loan token → repay flash
 *   Deleverage: flash-loan loan token → repay debt → withdraw collateral → swap
 *               collateral→loan via external DEX → repay flash → return equity
 */
contract MorphoLeverageHelper is IMorphoFlashLoanCallback, ReentrancyGuard {
    using SafeERC20 for IERC20;

    address public immutable MORPHO;
    address public immutable owner;

    mapping(address => bool) public approvedSwapTargets;
    bool public paused;
    uint256 public emergencyWithdrawUnlockTime;

    // Events
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
    event EmergencyWithdraw(address indexed token, uint256 amount);

    // Errors
    error Unauthorized();
    error ContractPaused();
    error InvalidParameters();
    error InvalidSwapTarget();
    error SwapFailed();
    error InsufficientSwapOutput();
    error AuthorizationNotGranted();
    error NoPosition();
    error InsufficientRepayment();

    modifier onlyOwner() {
        if (msg.sender != owner) revert Unauthorized();
        _;
    }

    modifier whenNotPaused() {
        if (paused) revert ContractPaused();
        _;
    }

    constructor(address _morpho) {
        if (_morpho == address(0)) revert InvalidParameters();
        MORPHO = _morpho;
        owner = msg.sender;
    }

    /**
     * @notice Execute leveraged position on any Morpho market
     * @param marketParams The Morpho market to use
     * @param userDeposit Amount of collateral token to deposit from user
     * @param flashLoanAmount Amount of loan token to flash borrow
     * @param minCollateralFromSwap Minimum collateral received from swap (slippage protection)
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
        if (!IMorpho(MORPHO).isAuthorized(msg.sender, address(this))) revert AuthorizationNotGranted();

        // Pull collateral from user
        IERC20(marketParams.collateralToken).safeTransferFrom(msg.sender, address(this), userDeposit);

        bytes memory data = abi.encode(
            uint8(0), msg.sender, marketParams, userDeposit,
            minCollateralFromSwap, swapTarget, swapCalldata
        );

        IMorpho(MORPHO).flashLoan(marketParams.loanToken, flashLoanAmount, data);
    }

    /**
     * @notice Fully unwind a leveraged position on any Morpho market
     * @param marketParams The Morpho market
     * @param minLoanTokenFromSwap Minimum loan tokens received from swap (slippage protection)
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
        if (!IMorpho(MORPHO).isAuthorized(msg.sender, address(this))) revert AuthorizationNotGranted();

        bytes32 marketId = keccak256(abi.encode(marketParams));
        (, uint128 borrowShares, uint128 collateral) = IMorpho(MORPHO).position(marketId, msg.sender);
        if (borrowShares == 0 && collateral == 0) revert NoPosition();

        (,, uint128 totalBorrowAssets, uint128 totalBorrowShares,,) = IMorpho(MORPHO).market(marketId);
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

        IMorpho(MORPHO).flashLoan(marketParams.loanToken, flashAmount, data);
    }

    /// @notice Morpho flash loan callback — only callable by Morpho
    function onMorphoFlashLoan(uint256 assets, bytes calldata data) external override {
        if (msg.sender != MORPHO) revert Unauthorized();
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

        // Approve Morpho for token operations (idempotent after first call per token)
        IERC20(mp.loanToken).forceApprove(MORPHO, type(uint256).max);
        IERC20(mp.collateralToken).forceApprove(MORPHO, type(uint256).max);

        // 1. Swap loan token → collateral token via external DEX
        uint256 collateralFromSwap = _executeSwap(
            mp.loanToken, mp.collateralToken, minCollateralFromSwap, swapTarget, swapCalldata
        );

        uint256 totalCollateral = userDeposit + collateralFromSwap;

        // 2. Supply all collateral to Morpho on behalf of user
        IMorpho(MORPHO).supplyCollateral(mp, totalCollateral, user, "");

        // 3. Borrow loan tokens on behalf of user to repay flash loan
        (uint256 borrowed,) = IMorpho(MORPHO).borrow(mp, flashAmount, 0, user, address(this));
        if (borrowed < flashAmount) revert InsufficientRepayment();

        // Morpho pulls flashAmount after callback returns (approved above)
        emit LeverageExecuted(user, keccak256(abi.encode(mp)), totalCollateral, flashAmount);
    }

    function _handleDeleverage(uint256 flashAmount, bytes calldata data) internal {
        (
            , address user,
            IMorpho.MarketParams memory mp,
            , // collateralAmount snapshot (stale — re-read below)
            uint128 borrowShares,
            uint256 minLoanTokenFromSwap,
            address swapTarget,
            bytes memory swapCalldata
        ) = abi.decode(data, (uint8, address, IMorpho.MarketParams, uint256, uint128, uint256, address, bytes));

        // Approve Morpho for loan token (repay + flash loan pullback)
        IERC20(mp.loanToken).forceApprove(MORPHO, type(uint256).max);

        // 1. Repay all debt using exact shares
        (uint256 assetsRepaid,) = IMorpho(MORPHO).repay(mp, 0, borrowShares, user, "");

        // 2. Re-read live collateral (avoids stale snapshot if partially liquidated)
        bytes32 mId = keccak256(abi.encode(mp));
        (,, uint128 currentCollateral) = IMorpho(MORPHO).position(mId, user);
        IMorpho(MORPHO).withdrawCollateral(mp, uint256(currentCollateral), user, address(this));

        // 3. Swap collateral → loan token via external DEX
        _executeSwap(mp.collateralToken, mp.loanToken, minLoanTokenFromSwap, swapTarget, swapCalldata);

        // 4. Verify flash loan can be repaid
        uint256 loanBalance = IERC20(mp.loanToken).balanceOf(address(this));
        if (loanBalance < flashAmount) revert InsufficientRepayment();

        // 5. Return remaining collateral to user
        uint256 remainingCollateral = IERC20(mp.collateralToken).balanceOf(address(this));
        if (remainingCollateral > 0) {
            IERC20(mp.collateralToken).safeTransfer(user, remainingCollateral);
        }

        // 6. Return surplus loan tokens to user
        uint256 surplus = loanBalance > flashAmount ? loanBalance - flashAmount : 0;
        if (surplus > 0) {
            IERC20(mp.loanToken).safeTransfer(user, surplus);
        }

        emit DeleverageExecuted(user, keccak256(abi.encode(mp)), assetsRepaid, remainingCollateral);
    }

    /**
     * @notice Execute a swap via an approved external DEX/aggregator
     * @dev Approves exact balance, executes calldata, resets approval, checks min output
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

        amountOut = IERC20(tokenOut).balanceOf(address(this)) - balanceBefore;
        if (amountOut < minAmountOut) revert InsufficientSwapOutput();
    }

    // ====== VIEW FUNCTIONS ======

    function hasAuthorization(address user) external view returns (bool) {
        return IMorpho(MORPHO).isAuthorized(user, address(this));
    }

    function getUserPosition(bytes32 marketId, address user)
        external view returns (uint256 collateral, uint256 debt)
    {
        (, uint128 borrowShares, uint128 col) = IMorpho(MORPHO).position(marketId, user);
        collateral = uint256(col);
        if (borrowShares > 0) {
            (,, uint128 totalBorrowAssets, uint128 totalBorrowShares,,) = IMorpho(MORPHO).market(marketId);
            if (totalBorrowShares > 0) {
                debt = (uint256(borrowShares) * uint256(totalBorrowAssets)) / uint256(totalBorrowShares);
            }
        }
    }

    // ====== ADMIN FUNCTIONS ======

    function setSwapTarget(address target, bool approved) external onlyOwner {
        approvedSwapTargets[target] = approved;
        emit SwapTargetUpdated(target, approved);
    }

    function setPaused(bool _paused) external onlyOwner {
        paused = _paused;
        emit EmergencyPause(_paused);
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
