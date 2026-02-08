// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title IAaveProtocolDataProvider
 * @notice Interface for Aave Protocol Data Provider
 * @dev Provides helper functions to fetch reserve data and user positions
 */
interface IAaveProtocolDataProvider {
    /**
     * @notice Returns the token addresses for a given reserve
     * @param asset Address of the underlying asset
     * @return aTokenAddress Address of the aToken (interest-bearing)
     * @return stableDebtTokenAddress Address of the stable debt token
     * @return variableDebtTokenAddress Address of the variable debt token
     */
    function getReserveTokensAddresses(
        address asset
    )
        external
        view
        returns (
            address aTokenAddress,
            address stableDebtTokenAddress,
            address variableDebtTokenAddress
        );
}
