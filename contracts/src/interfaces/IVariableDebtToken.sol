// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title IVariableDebtToken
 * @notice Interface for Aave V3 Variable Debt Token
 * @dev Represents variable rate debt positions in Aave protocol
 */
interface IVariableDebtToken {
    /**
     * @notice Approves a delegatee to borrow on behalf of the caller
     * @dev Allows another address to incur debt on your behalf
     * @param delegatee Address being approved to borrow
     * @param amount Amount of debt the delegatee is approved for
     */
    function approveDelegation(address delegatee, uint256 amount) external;

    /**
     * @notice Returns the borrow allowance of a user
     * @param fromUser User who delegated borrowing rights
     * @param toUser User who received borrowing rights
     * @return Approved amount that toUser can borrow on behalf of fromUser
     */
    function borrowAllowance(
        address fromUser,
        address toUser
    ) external view returns (uint256);
}
