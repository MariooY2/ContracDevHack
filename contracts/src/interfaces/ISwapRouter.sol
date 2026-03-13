// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title Uniswap V3 SwapRouter02 interface (subset)
/// @dev SwapRouter02 on Base does NOT include deadline in the struct.
///      Deadline protection is handled via multicall wrapping if needed.
///      For flash loan callbacks this is unnecessary since execution is atomic.
interface ISwapRouter {
    struct ExactInputSingleParams {
        address tokenIn;
        address tokenOut;
        uint24 fee;
        address recipient;
        uint256 amountIn;
        uint256 amountOutMinimum;
        uint160 sqrtPriceLimitX96;
    }

    function exactInputSingle(
        ExactInputSingleParams calldata params
    ) external payable returns (uint256 amountOut);
}
