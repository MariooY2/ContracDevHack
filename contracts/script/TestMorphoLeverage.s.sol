// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";
import "../src/MorphoFlashLoan.sol";
import "../src/interfaces/IMorpho.sol";

contract TestMorphoLeverage is Script {
    address constant HELPER = 0xb4d4Adc7C0e04330C94EA78BE68eC4ECCCbd6588;
    address constant MORPHO_BLUE = 0xBBBBBbbBBb9cC5e90e3b3Af64bdAF62C37EEFFCb;
    address constant WSTETH = 0xc1CBa3fCea344f92D9239c08C0568f6F2F0ee452;
    address constant WETH = 0x4200000000000000000000000000000000000006;

    // wstETH whale on Base (Morpho Blue itself has wstETH)
    address constant WSTETH_WHALE = MORPHO_BLUE;

    function run() external {
        uint256 pk = vm.envUint("STAGENET_PRIVATE_KEY");
        address user = vm.addr(pk);

        console.log("=== Testing Morpho Leverage Execution ===");
        console.log("User:", user);
        console.log("Helper:", HELPER);
        console.log("");

        // 1. Impersonate wstETH whale (Morpho) and fund user
        console.log("1. Funding user with 1 wstETH...");
        vm.startPrank(WSTETH_WHALE);
        IERC20(WSTETH).transfer(user, 1e18);
        vm.stopPrank();

        uint256 userBalance = IERC20(WSTETH).balanceOf(user);
        console.log("   User wstETH balance:", userBalance / 1e18, "wstETH");
        require(userBalance >= 1e18, "Failed to fund user");

        vm.startBroadcast(pk);

        // 2. Approve helper to spend wstETH
        console.log("\n2. Approving helper to spend wstETH...");
        IERC20(WSTETH).approve(HELPER, 1e18);
        console.log("   Approved:", IERC20(WSTETH).allowance(user, HELPER));

        // 3. Authorize Morpho (skip if already authorized)
        console.log("\n3. Authorizing helper on Morpho...");
        bool alreadyAuthorized = IMorpho(MORPHO_BLUE).isAuthorized(user, HELPER);
        if (!alreadyAuthorized) {
            IMorpho(MORPHO_BLUE).setAuthorization(HELPER, true);
        }
        console.log("   Authorized: true");

        // 4. Use empty swap data to trigger direct Uniswap V3 pool swap (works on fork)
        console.log("\n4. Using direct Uniswap V3 pool swap (empty lifiSwapData)...");
        bytes memory lifiSwapData = hex""; // Empty = use direct pool swap
        console.log("   Swap mode: Direct Uniswap V3 Pool");

        // 5. Execute leverage
        console.log("\n5. Executing leverage (2x, 1 wstETH)...");

        try MorphoFlashLoanLeverageHelper(HELPER).executeLeverage(
            2e18,  // 2x leverage
            1e18,  // 1 wstETH deposit
            lifiSwapData
        ) {
            console.log("\n\u2705 LEVERAGE EXECUTED SUCCESSFULLY!");

            // Check position (returns collateral, debt, healthFactor)
            (uint256 collateral, uint256 debt, uint256 healthFactor) = MorphoFlashLoanLeverageHelper(HELPER).getUserPosition(user);
            console.log("\nFinal Position:");
            console.log("  Collateral:", collateral / 1e18, "wstETH");
            console.log("  Debt:", debt / 1e18, "WETH");
            console.log("  Health Factor:", healthFactor / 1e18);

            if (healthFactor < 1e18) {
                console.log("  \u26a0\ufe0f WARNING: Health factor below 1.0!");
            } else {
                console.log("  \u2705 Health factor looks good!");
            }

        } catch Error(string memory reason) {
            console.log("\n\u274c LEVERAGE FAILED:", reason);
        } catch (bytes memory lowLevelData) {
            console.log("\n\u274c LEVERAGE FAILED WITH CUSTOM ERROR");
            console.logBytes(lowLevelData);

            // Try to decode common errors
            if (lowLevelData.length == 4) {
                bytes4 errorSig = bytes4(lowLevelData);
                console.log("Error signature:", vm.toString(errorSig));

                if (errorSig == 0x90b8ec18) {
                    console.log("= TransferFailed() - Swap execution reverted");
                    console.log("");
                    console.log("Possible causes:");
                    console.log("1. Router address is incorrect");
                    console.log("2. Swap calldata is malformed");
                    console.log("3. Pool has insufficient liquidity");
                    console.log("4. WETH approval failed");
                } else if (errorSig == 0xa9ad62f8) {
                    console.log("= Contract error - check router/function selector");
                }
            }
        }

        vm.stopBroadcast();

        console.log("\n=== Test Complete ===");
    }
}
