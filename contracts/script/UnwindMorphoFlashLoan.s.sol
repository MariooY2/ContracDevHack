// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";
import "../src/MorphoFlashLoan.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract UnwindMorphoFlashLoan is Script {
    function run() external {
        address helper = vm.envAddress("MORPHO_FLASH_LOAN_HELPER");
        address wsteth = vm.envAddress("BASE_WSTETH");

        uint256 deployerPrivateKey = vm.envUint("BASE_PRIVATE_KEY");
        address user = vm.addr(deployerPrivateKey);

        console.log("=== Unwinding Morpho Flash Loan Position ===");
        console.log("User:", user);
        console.log("Helper Contract:", helper);

        MorphoFlashLoanLeverageHelper leverageHelper = MorphoFlashLoanLeverageHelper(helper);

        // Check position before
        console.log("\n=== Position Before ===");
        (uint256 collateralBefore, uint256 debtBefore, uint256 hfBefore) = leverageHelper.getUserPosition(user);
        console.log("Collateral:", collateralBefore / 1e18, "wstETH");
        console.log("Debt:", debtBefore / 1e18, "WETH");
        console.log("Health Factor:", hfBefore / 1e18);

        require(debtBefore > 0, "No debt to unwind");

        uint256 wstethBalanceBefore = IERC20(wsteth).balanceOf(user);
        console.log("wstETH Balance Before:", wstethBalanceBefore / 1e18);

        // Check authorization
        bool isAuthorized = leverageHelper.hasAuthorization(user);
        console.log("Authorized:", isAuthorized);
        require(isAuthorized, "User must authorize helper first");

        vm.startBroadcast(deployerPrivateKey);

        console.log("\n=== Executing Deleverage ===");
        console.log("Note: Using empty LiFi swap data for deployment test");
        console.log("Production usage requires proper LiFi swap data from frontend");

        // For testing deployment, pass empty bytes
        // In production, frontend generates proper LiFi swap data
        bytes memory emptyLifiData = "";

        // Note: No need to approve anything - authorization was granted during leverage
        leverageHelper.executeDeleverage(emptyLifiData);
        console.log("Position unwound successfully!");

        vm.stopBroadcast();

        // Check position after
        console.log("\n=== Position After ===");
        (uint256 collateralAfter, uint256 debtAfter, uint256 hfAfter) = leverageHelper.getUserPosition(user);
        console.log("Collateral:", collateralAfter / 1e18, "wstETH");
        console.log("Debt:", debtAfter / 1e18, "WETH");
        console.log("Health Factor:", hfAfter / 1e18);

        uint256 wstethBalanceAfter = IERC20(wsteth).balanceOf(user);
        console.log("\nwstETH Balance After:", wstethBalanceAfter / 1e18);
        console.log("wstETH Returned:", (wstethBalanceAfter - wstethBalanceBefore) / 1e18);

        console.log("\n=== Unwind Complete! ===");
    }
}
