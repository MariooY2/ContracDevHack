// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title IMorphoFlashLoanCallback
/// @notice Interface for Morpho Blue flash loan callbacks
/// @dev Contracts receiving flash loans from Morpho must implement this interface
interface IMorphoFlashLoanCallback {
    /// @notice Callback function called by Morpho during a flash loan
    /// @dev This function is called after the flash loan assets are transferred to the receiver
    ///      The receiver must approve Morpho to pull back the loaned assets + any premium
    /// @param assets The amount of assets that were flash loaned
    /// @param data Arbitrary data passed from the flash loan initiator
    /// @dev Unlike Aave, this callback does NOT return a boolean value
    ///      Morpho will revert the entire transaction if repayment fails
    function onMorphoFlashLoan(uint256 assets, bytes calldata data) external;
}

/// @title IMorphoSupplyCollateralCallback
/// @notice Interface for supply collateral callbacks
interface IMorphoSupplyCollateralCallback {
    /// @notice Callback for supply collateral operations
    /// @param assets The amount of collateral assets supplied
    /// @param data Arbitrary callback data
    function onMorphoSupplyCollateral(uint256 assets, bytes calldata data) external;
}

/// @title IMorphoRepayCallback
/// @notice Interface for repay callbacks
interface IMorphoRepayCallback {
    /// @notice Callback for repay operations
    /// @param assets The amount of assets repaid
    /// @param data Arbitrary callback data
    function onMorphoRepay(uint256 assets, bytes calldata data) external;
}
