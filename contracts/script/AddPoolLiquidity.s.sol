// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "forge-std/Script.sol";

interface IERC20 {
    function approve(address spender, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
    function transfer(address to, uint256 amount) external returns (bool);
}

interface IUniswapV3Pool {
    function mint(
        address recipient,
        int24 tickLower,
        int24 tickUpper,
        uint128 amount,
        bytes calldata data
    ) external returns (uint256 amount0, uint256 amount1);

    function slot0() external view returns (
        uint160 sqrtPriceX96,
        int24 tick,
        uint16 observationIndex,
        uint16 observationCardinality,
        uint16 observationCardinalityNext,
        uint8 feeProtocol,
        bool unlocked
    );

    function token0() external view returns (address);
    function token1() external view returns (address);
    function liquidity() external view returns (uint128);
}

/// @dev Callback for pool.mint — transfers tokens to the pool
contract MintCallback {
    address public immutable pool;
    address public immutable token0;
    address public immutable token1;
    address public immutable owner;

    constructor(address _pool, address _token0, address _token1) {
        pool = _pool;
        token0 = _token0;
        token1 = _token1;
        owner = msg.sender;
    }

    function uniswapV3MintCallback(uint256 amount0Owed, uint256 amount1Owed, bytes calldata) external {
        require(msg.sender == pool, "not pool");
        if (amount0Owed > 0) IERC20(token0).transfer(pool, amount0Owed);
        if (amount1Owed > 0) IERC20(token1).transfer(pool, amount1Owed);
    }

    function addLiquidity(int24 tickLower, int24 tickUpper, uint128 liquidityAmount) external returns (uint256, uint256) {
        require(msg.sender == owner, "not owner");
        return IUniswapV3Pool(pool).mint(address(this), tickLower, tickUpper, liquidityAmount, "");
    }
}

contract AddPoolLiquidity is Script {
    address constant WETH   = 0x4200000000000000000000000000000000000006;
    address constant WSTETH = 0xc1CBa3fCea344f92D9239c08C0568f6F2F0ee452;
    address constant POOL   = 0x20E068D76f9E90b90604500B84c7e19dCB923e7e;

    function run() external {
        uint256 pk = vm.envUint("STAGENET_PRIVATE_KEY");
        address deployer = vm.addr(pk);
        vm.startBroadcast(pk);

        // Deploy callback helper
        MintCallback cb = new MintCallback(POOL, WETH, WSTETH);

        // Send tokens to the callback contract
        // We'll send plenty — pool will only take what's needed
        uint256 wethToSend = IERC20(WETH).balanceOf(deployer);
        uint256 wstethToSend = IERC20(WSTETH).balanceOf(deployer);

        console.log("Sending WETH:", wethToSend);
        console.log("Sending wstETH:", wstethToSend);

        IERC20(WETH).transfer(address(cb), wethToSend);
        IERC20(WSTETH).transfer(address(cb), wstethToSend);

        // Current tick = -2038, tick spacing = 1
        // Concentrated range: -2100 to -1950
        int24 tickLower = -2100;
        int24 tickUpper = -1950;

        // Scaled to ~40 WETH worth: 8e21
        uint128 liquidityAmount = 8000000000000000000000; // 8e21

        (uint256 amount0, uint256 amount1) = cb.addLiquidity(tickLower, tickUpper, liquidityAmount);
        console.log("WETH used:", amount0);
        console.log("wstETH used:", amount1);

        // Get remaining tokens back — not needed, they stay in callback contract
        // but let's log pool state
        uint128 newLiquidity = IUniswapV3Pool(POOL).liquidity();
        console.log("New pool liquidity:", uint256(newLiquidity));

        vm.stopBroadcast();
    }
}
