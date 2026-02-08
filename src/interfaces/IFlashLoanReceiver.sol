// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title IFlashLoanReceiver
 * @notice Interface that flash loan receivers must implement
 * @dev Contracts receiving flash loans must implement this interface
 */
interface IFlashLoanReceiver {
    /**
     * @notice Executes an operation after receiving flash loan
     * @dev Called by Aave Pool after sending flash loan funds
     * @param assets Array of asset addresses that were flash loaned
     * @param amounts Array of amounts that were flash loaned
     * @param premiums Array of premium amounts (fees) to pay
     * @param initiator Address that initiated the flash loan
     * @param params Arbitrary packed params passed from the initiator
     * @return bool True if execution was successful
     */
    function executeOperation(
        address[] calldata assets,
        uint256[] calldata amounts,
        uint256[] calldata premiums,
        address initiator,
        bytes calldata params
    ) external returns (bool);
}
