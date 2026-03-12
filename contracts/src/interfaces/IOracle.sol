// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title Morpho Oracle interface
/// @notice Returns the price of collateral token in loan token terms (36 decimals)
interface IOracle {
    function price() external view returns (uint256);
}
