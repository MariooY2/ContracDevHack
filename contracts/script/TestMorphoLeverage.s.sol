// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";
import "../src/MorphoFlashLoan.sol";
import "../src/interfaces/IMorpho.sol";

contract TestMorphoLeverage is Script {
    address constant HELPER = 0x370cbd43975F14748A616E33B2480720C8e37F89;
    address constant MORPHO_BLUE = 0xBBBBBbbBBb9cC5e90e3b3Af64bdAF62C37EEFFCb;
    address constant WSTETH = 0xc1CBa3fCea344f92D9239c08C0568f6F2F0ee452;
    address constant WETH = 0x4200000000000000000000000000000000000006;

    MorphoFlashLoanLeverageHelper helper = MorphoFlashLoanLeverageHelper(HELPER);

    function _logPosition(address user, string memory label) internal view {
        (uint256 col, uint256 debt, uint256 hf) = helper.getUserPosition(user);
        console.log(label);
        console.log("  Collateral wstETH (raw):", col);
        console.log("  Debt WETH (raw):        ", debt);
        if (hf == type(uint256).max) {
            console.log("  Health Factor:           no debt");
        } else {
            console.log("  Health Factor (raw):    ", hf);
        }
        console.log("  wstETH wallet balance:  ", IERC20(WSTETH).balanceOf(user));
    }

    function run() external {
        uint256 pk = vm.envUint("STAGENET_PRIVATE_KEY");
        address user = vm.addr(pk);

        console.log("=== Morpho Full Cycle Test: Leverage + Deleverage ===");
        console.log("User:  ", user);
        console.log("Helper:", HELPER);

        _logPosition(user, "\n--- Initial Position ---");

        vm.startBroadcast(pk);

        // ── Step 0: Authorize new helper on Morpho if not yet done ──────────
        bool authorized = IMorpho(MORPHO_BLUE).isAuthorized(user, HELPER);
        if (!authorized) {
            console.log("\n[0] Authorizing new helper on Morpho...");
            IMorpho(MORPHO_BLUE).setAuthorization(HELPER, true);
            console.log("    Done.");
        } else {
            console.log("\n[0] Helper already authorized on Morpho.");
        }

        // ── Step 1: Close existing position if any ───────────────────────────
        (, uint256 existingDebt,) = helper.getUserPosition(user);
        if (existingDebt > 0) {
            console.log("\n[1] Closing existing leveraged position (Deleverage)...");
            try helper.executeDeleverage() {
                console.log("    Deleverage SUCCESS");
            } catch Error(string memory reason) {
                console.log("    Deleverage FAILED:", reason);
                vm.stopBroadcast();
                return;
            } catch (bytes memory lowLevelData) {
                console.log("    Deleverage FAILED with custom error:");
                console.logBytes(lowLevelData);
                if (lowLevelData.length == 4) {
                    bytes4 sig = bytes4(lowLevelData);
                    if (sig == 0x7716b743) console.log("    = InsufficientSwapOutput()");
                    else if (sig == 0x90b8ec18) console.log("    = TransferFailed()");
                }
                vm.stopBroadcast();
                return;
            }
            _logPosition(user, "\n--- After Deleverage ---");
        } else {
            console.log("\n[1] No existing position, skipping deleverage.");
        }

        // ── Step 2: Check wstETH balance for deposit ─────────────────────────
        uint256 wstethBal = IERC20(WSTETH).balanceOf(user);
        if (wstethBal < 1e18) {
            console.log("\n[!] Insufficient wstETH for new leverage test.");
            console.log("    Balance:", wstethBal);
            console.log("    Need at least 1e18 (1 wstETH). Top up wallet and re-run.");
            vm.stopBroadcast();
            return;
        }

        // ── Step 3: Approve helper ────────────────────────────────────────────
        IERC20(WSTETH).approve(HELPER, type(uint256).max);
        console.log("\n[2] wstETH approved for helper.");

        // ── Step 4: Execute 2x Leverage ──────────────────────────────────────
        console.log("\n[3] Executing 2x Leverage (1 wstETH deposit)...");
        try helper.executeLeverage(2e18, 1e18) {
            console.log("    Leverage SUCCESS");
            _logPosition(user, "\n--- After Leverage ---");
        } catch Error(string memory reason) {
            console.log("    Leverage FAILED:", reason);
            vm.stopBroadcast();
            return;
        } catch (bytes memory lowLevelData) {
            console.log("    Leverage FAILED with custom error:");
            console.logBytes(lowLevelData);
            if (lowLevelData.length == 4) {
                bytes4 sig = bytes4(lowLevelData);
                if (sig == 0x90b8ec18) console.log("    = TransferFailed()");
                else if (sig == 0x4a5541ef) console.log("    = AuthorizationNotGranted()");
                else if (sig == 0x73a2d6b1) console.log("    = InsufficientSwapOutput()");
            }
            vm.stopBroadcast();
            return;
        }

        // ── Step 5: Close the position (Deleverage) ──────────────────────────
        console.log("\n[4] Closing position (Deleverage)...");
        try helper.executeDeleverage() {
            console.log("    Deleverage SUCCESS");
            _logPosition(user, "\n--- Final Position ---");
        } catch Error(string memory reason) {
            console.log("    Deleverage FAILED:", reason);
        } catch (bytes memory lowLevelData) {
            console.log("    Deleverage FAILED with custom error:");
            console.logBytes(lowLevelData);
            if (lowLevelData.length == 4) {
                bytes4 sig = bytes4(lowLevelData);
                if (sig == 0x7716b743) console.log("    = InsufficientSwapOutput()");
                else if (sig == 0x90b8ec18) console.log("    = TransferFailed()");
            }
        }

        vm.stopBroadcast();
        console.log("\n=== Test Complete ===");
    }
}
