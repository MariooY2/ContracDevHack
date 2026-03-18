// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";
import "../src/MorphoLeverageHelper.sol";

contract DeployMorphoLeverageHelper is Script {
    address constant MORPHO_BLUE = 0xBBBBBbbBBb9cC5e90e3b3Af64bdAF62C37EEFFCb;

    // LiFi Diamond on Base mainnet
    address constant LIFI_DIAMOND = 0x1231DEB6f5749EF6cE6943a275A1D3E7486F4EaE;

    function run() external {
        uint256 deployerPrivateKey = vm.envUint("STAGENET_PRIVATE_KEY");
        address deployer = vm.addr(deployerPrivateKey);

        console.log("=== Deploying MorphoLeverageHelper on Base Mainnet ===");
        console.log("Deployer:", deployer);
        console.log("Morpho Blue:", MORPHO_BLUE);

        vm.startBroadcast(deployerPrivateKey);

        MorphoLeverageHelper helper = new MorphoLeverageHelper(MORPHO_BLUE);

        // Approve LiFi Diamond as swap target
        helper.setSwapTarget(LIFI_DIAMOND, true);
        console.log("Approved LiFi Diamond:", LIFI_DIAMOND);

        vm.stopBroadcast();

        console.log("\n=== Deployment Successful! ===");
        console.log("MorphoLeverageHelper:", address(helper));
        console.log("\nUpdate frontend/lib/leverageContract.ts:");
        console.log("  LEVERAGE_HELPER:", address(helper));
    }
}
