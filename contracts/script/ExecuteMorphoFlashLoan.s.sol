// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";
import "../src/MorphoFlashLoan.sol";
import "../src/interfaces/IMorpho.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract ExecuteMorphoFlashLoan is Script {
    function run() external {
        address helper = vm.envAddress("MORPHO_FLASH_LOAN_HELPER");
        address morpho = vm.envAddress("MORPHO_BLUE");
        address wsteth = vm.envAddress("BASE_WSTETH");

        uint256 deployerPrivateKey = vm.envUint("BASE_PRIVATE_KEY");
        address user = vm.addr(deployerPrivateKey);

        console.log("=== Executing Morpho Flash Loan Leverage ===");
        console.log("User:", user);
        console.log("Helper Contract:", helper);
        console.log("Morpho:", morpho);
        console.log("wstETH:", wsteth);

        MorphoFlashLoanLeverageHelper leverageHelper = MorphoFlashLoanLeverageHelper(helper);

        // Check current position before
        console.log("\n=== Position Before ===");
        (uint256 collateralBefore, uint256 debtBefore, uint256 hfBefore) = leverageHelper.getUserPosition(user);
        console.log("Collateral:", collateralBefore / 1e18, "wstETH");
        console.log("Debt:", debtBefore / 1e18, "WETH");
        console.log("Health Factor:", hfBefore / 1e18);

        // Check wstETH balance
        uint256 wstethBalance = IERC20(wsteth).balanceOf(user);
        console.log("\nwstETH Balance:", wstethBalance / 1e18);

        require(wstethBalance >= 1 ether, "Insufficient wstETH balance");

        // Simulation
        uint256 targetLeverage = 2e18; // 2x
        uint256 depositAmount = 1 ether; // 1 wstETH

        console.log("\n=== Simulating Leverage ===");
        console.log("Target Leverage:", targetLeverage / 1e18, "x");
        console.log("Deposit Amount:", depositAmount / 1e18, "wstETH");

        (
            uint256 flashAmount,
            uint256 totalCollateral,
            uint256 totalDebt,
            uint256 estimatedHF
        ) = leverageHelper.simulateLeverage(targetLeverage, depositAmount);

        console.log("\nSimulation Results:");
        console.log("Flash WETH Amount:", flashAmount / 1e18);
        console.log("Total Collateral:", totalCollateral / 1e18, "wstETH");
        console.log("Total Debt:", totalDebt / 1e18, "WETH");
        console.log("Estimated Health Factor:", estimatedHF / 1e18);

        require(estimatedHF >= 1e18, "Estimated health factor too low");

        vm.startBroadcast(deployerPrivateKey);

        console.log("\n=== Step 1: Authorize Helper on Morpho ===");
        // Check if already authorized
        bool isAuthorized = leverageHelper.hasAuthorization(user);
        console.log("Currently Authorized:", isAuthorized);

        if (!isAuthorized) {
            console.log("Setting authorization...");
            IMorpho(morpho).setAuthorization(helper, true);
            console.log("Authorization granted!");
        } else {
            console.log("Already authorized, skipping...");
        }

        console.log("\n=== Step 2: Approve wstETH ===");
        uint256 currentAllowance = IERC20(wsteth).allowance(user, helper);
        console.log("Current Allowance:", currentAllowance / 1e18);

        if (currentAllowance < depositAmount) {
            console.log("Approving wstETH...");
            IERC20(wsteth).approve(helper, type(uint256).max);
            console.log("Approval granted!");
        } else {
            console.log("Sufficient allowance, skipping...");
        }

        console.log("\n=== Step 3: Execute Leverage ===");

        leverageHelper.executeLeverage(
            targetLeverage,
            depositAmount
        );
        console.log("Leverage executed successfully!");

        vm.stopBroadcast();

        // Check position after
        console.log("\n=== Position After ===");
        (uint256 collateralAfter, uint256 debtAfter, uint256 hfAfter) = leverageHelper.getUserPosition(user);
        console.log("Collateral:", collateralAfter / 1e18, "wstETH");
        console.log("Debt:", debtAfter / 1e18, "WETH");
        console.log("Health Factor:", hfAfter / 1e18);

        uint256 actualLeverage = collateralAfter > debtAfter
            ? (collateralAfter * 1e18) / (collateralAfter - debtAfter)
            : 0;
        console.log("Actual Leverage:", actualLeverage / 1e18, "x");

        console.log("\n=== Execution Complete! ===");
    }
}
