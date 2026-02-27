// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "forge-std/Script.sol";

interface IERC20 {
    function approve(address spender, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
}

interface INonfungiblePositionManager {
    struct MintParams {
        address token0;
        address token1;
        uint24 fee;
        int24 tickLower;
        int24 tickUpper;
        uint256 amount0Desired;
        uint256 amount1Desired;
        uint256 amount0Min;
        uint256 amount1Min;
        address recipient;
        uint256 deadline;
    }

    function mint(MintParams calldata params)
        external
        payable
        returns (uint256 tokenId, uint128 liquidity, uint256 amount0, uint256 amount1);
}

contract AddLiquidity is Script {
    address constant WETH   = 0x4200000000000000000000000000000000000006;
    address constant WSTETH = 0xc1CBa3fCea344f92D9239c08C0568f6F2F0ee452;
    address constant NPM    = 0x03a520b32C04BF3bEEf7BEb72E919cf822Ed34f1;
    uint24  constant FEE    = 100; // 0.01%

    function run() external {
        uint256 pk = vm.envUint("STAGENET_PRIVATE_KEY");
        address deployer = vm.addr(pk);
        vm.startBroadcast(pk);

        uint256 wethBal   = IERC20(WETH).balanceOf(deployer);
        uint256 wstethBal = IERC20(WSTETH).balanceOf(deployer);

        console.log("WETH balance:", wethBal);
        console.log("wstETH balance:", wstethBal);

        // Use 10 WETH and 10 wstETH for liquidity
        uint256 wethAmount   = 10 ether;
        uint256 wstethAmount = 10 ether;

        require(wethBal >= wethAmount, "Not enough WETH");
        require(wstethBal >= wstethAmount, "Not enough wstETH");

        // Approve
        IERC20(WETH).approve(NPM, wethAmount);
        IERC20(WSTETH).approve(NPM, wstethAmount);

        // token0 = WETH (0x4200...), token1 = wstETH (0xc1CB...)
        // Current tick = -2038, tick spacing = 1
        // Wide range: -10000 to +5000 (covers massive price swings)
        int24 tickLower = -10000;
        int24 tickUpper = 5000;

        INonfungiblePositionManager.MintParams memory params = INonfungiblePositionManager.MintParams({
            token0: WETH,
            token1: WSTETH,
            fee: FEE,
            tickLower: tickLower,
            tickUpper: tickUpper,
            amount0Desired: wethAmount,
            amount1Desired: wstethAmount,
            amount0Min: 0,
            amount1Min: 0,
            recipient: deployer,
            deadline: block.timestamp + 600
        });

        (uint256 tokenId, uint128 liquidity, uint256 amount0, uint256 amount1) = INonfungiblePositionManager(NPM).mint(params);

        console.log("Position token ID:", tokenId);
        console.log("Liquidity:", uint256(liquidity));
        console.log("WETH used:", amount0);
        console.log("wstETH used:", amount1);

        vm.stopBroadcast();
    }
}
