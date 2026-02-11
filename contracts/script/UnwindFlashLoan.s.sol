// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";
import "../src/FlashLoan.sol";

contract UnwindFlashLoan is Script {
    // Aave V3 on ETH Mainnet
    address constant AAVE_DATA_PROVIDER = 0x0a16f2FCC0D44FaE41cc54e079281D84A363bECD;
    address constant WSTETH = 0x7f39C581F595B53c5cb19bD0b3f8dA6c935E2Ca0;

    function run() external {
        uint256 deployerPrivateKey = vm.envUint("STAGENET_PRIVATE_KEY");
        address helperAddress = vm.envAddress("FLASH_LOAN_HELPER");
        address deployer = vm.addr(deployerPrivateKey);

        console.log("Using deployed helper at:", helperAddress);

        vm.startBroadcast(deployerPrivateKey);

        FlashLoanLeverageHelper helper = FlashLoanLeverageHelper(payable(helperAddress));

        // Step 1: Get aToken address for wstETH
        (address aTokenAddress, , ) = IAaveProtocolDataProvider(AAVE_DATA_PROVIDER)
            .getReserveTokensAddresses(WSTETH);
        console.log("aWstETH token:", aTokenAddress);

        // Step 2: Check current position
        uint256 aTokenBalance = IERC20(aTokenAddress).balanceOf(deployer);
        console.log("aToken balance:", aTokenBalance);

        // Step 3: Approve aToken spending so helper can withdraw collateral
        IERC20(aTokenAddress).approve(helperAddress, type(uint256).max);
        console.log("aToken approved");

        // Step 4: Unwind the position
        helper.executeDeleverage(WSTETH);
        console.log("Position unwound successfully!");

        // Step 5: Log final state
        uint256 wstethBalance = IERC20(WSTETH).balanceOf(deployer);
        console.log("wstETH returned to wallet:", wstethBalance);

        vm.stopBroadcast();
    }
}
