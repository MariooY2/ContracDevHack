// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";
import "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";
import "../src/MorphoLeverageHelper.sol";

/**
 * @title Deploy VOLT MorphoLeverageHelper (UUPS Proxy)
 * @notice Deploys implementation + proxy, initializes with 0.05% fee, whitelists LiFi Diamond
 *
 * Usage:
 *   forge script script/Deploy.s.sol \
 *     --rpc-url <RPC_URL> \
 *     --private-key <PRIVATE_KEY> \
 *     --broadcast \
 *     --verify
 */
contract Deploy is Script {
    // Morpho Blue (same address on all chains)
    address constant MORPHO_BLUE = 0xBBBBBbbBBb9cC5e90e3b3Af64bdAF62C37EEFFCb;

    // LiFi Diamond (same address on all chains)
    address constant LIFI_DIAMOND = 0x1231DEB6f5749EF6cE6943a275A1D3E7486F4EaE;

    // 0.05% fee = 5 basis points
    uint256 constant FEE_BPS = 5;

    function run() external {
        uint256 deployerKey = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(deployerKey);
        address feeRecipient = vm.envOr("FEE_RECIPIENT", deployer);

        console.log("========================================");
        console.log("  VOLT Protocol - MorphoLeverageHelper");
        console.log("========================================");
        console.log("Deployer:    ", deployer);
        console.log("Morpho Blue: ", MORPHO_BLUE);
        console.log("LiFi Diamond:", LIFI_DIAMOND);
        console.log("Fee:          0.05% (5 bps)");
        console.log("Fee Recipient:", feeRecipient);
        console.log("");

        vm.startBroadcast(deployerKey);

        // 1. Deploy implementation
        MorphoLeverageHelper implementation = new MorphoLeverageHelper();
        console.log("Implementation:", address(implementation));

        // 2. Deploy UUPS proxy with initialize calldata
        bytes memory initData = abi.encodeWithSelector(
            MorphoLeverageHelper.initialize.selector,
            MORPHO_BLUE,
            FEE_BPS,
            feeRecipient
        );

        ERC1967Proxy proxy = new ERC1967Proxy(
            address(implementation),
            initData
        );
        console.log("Proxy:         ", address(proxy));

        // 3. Whitelist LiFi Diamond as approved swap target
        MorphoLeverageHelper helper = MorphoLeverageHelper(address(proxy));
        helper.setSwapTarget(LIFI_DIAMOND, true);
        console.log("LiFi approved:  true");

        vm.stopBroadcast();

        // Summary
        console.log("");
        console.log("========================================");
        console.log("  Deployment Complete!");
        console.log("========================================");
        console.log("");
        console.log("Update frontend with PROXY address:");
        console.log("  frontend/lib/leverageContract.ts  -> LEVERAGE_HELPER:", address(proxy));
        console.log("  frontend/lib/contracts.ts         -> leverageHelper: ", address(proxy));
        console.log("");
        console.log("Verify on explorer:");
        console.log("  Implementation:", address(implementation));
        console.log("  Proxy:         ", address(proxy));
    }
}
