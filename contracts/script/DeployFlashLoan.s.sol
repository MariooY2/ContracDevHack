// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";
import "../src/FlashLoan.sol";

contract DeployFlashLoan is Script {
    // Aave V3 on ETH Mainnet
    address constant AAVE_POOL = 0x87870Bca3F3fD6335C3F4ce8392D69350B4fA4E2;
    address constant AAVE_DATA_PROVIDER = 0x0a16f2FCC0D44FaE41cc54e079281D84A363bECD;
    // Uniswap V3 SwapRouter
    address constant SWAP_ROUTER = 0xE592427A0AEce92De3Edee1F18E0157C05861564;
    // Tokens
    address constant WETH = 0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2;
    address constant WSTETH = 0x7f39C581F595B53c5cb19bD0b3f8dA6c935E2Ca0;

    function run() external {
        uint256 deployerPrivateKey = vm.envUint("STAGENET_PRIVATE_KEY");

        vm.startBroadcast(deployerPrivateKey);

        FlashLoanLeverageHelper helper = new FlashLoanLeverageHelper(
            AAVE_POOL,
            AAVE_DATA_PROVIDER,
            SWAP_ROUTER,
            WETH,
            WSTETH
        );

        console.log("FlashLoanLeverageHelper deployed at:", address(helper));
        console.log("Owner:", helper.owner());

        vm.stopBroadcast();
    }
}
