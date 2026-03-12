// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title Uniswap V3 Pool interface (subset for price queries)
interface IUniV3Pool {
    function slot0()
        external
        view
        returns (
            uint160 sqrtPriceX96,
            int24 tick,
            uint16 observationIndex,
            uint16 observationCardinality,
            uint16 observationCardinalityNext,
            uint8 feeProtocol,
            bool unlocked
        );
}
