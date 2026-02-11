// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";
import "../src/FlashLoan.sol";

contract ExecuteFlashLoan is Script {
    // Aave V3 on ETH Mainnet
    address constant AAVE_DATA_PROVIDER = 0x0a16f2FCC0D44FaE41cc54e079281D84A363bECD;
    address constant WSTETH = 0x7f39C581F595B53c5cb19bD0b3f8dA6c935E2Ca0;

    function run() external {
        uint256 deployerPrivateKey = vm.envUint("STAGENET_PRIVATE_KEY");
        address helperAddress = vm.envAddress("FLASH_LOAN_HELPER");

        console.log("Using deployed helper at:", helperAddress);

        vm.startBroadcast(deployerPrivateKey);

        FlashLoanLeverageHelper helper = FlashLoanLeverageHelper(payable(helperAddress));

        // Step 1: Approve credit delegation (user -> helper) on the variable debt token
        (, , address variableDebtToken) = IAaveProtocolDataProvider(AAVE_DATA_PROVIDER)
            .getReserveTokensAddresses(WSTETH);
        IVariableDebtToken(variableDebtToken).approveDelegation(
            helperAddress,
            type(uint256).max
        );
        console.log("Credit delegation approved on:", variableDebtToken);

        // Step 2: Approve wstETH transfer to helper
        uint256 userDeposit = 1 ether; // 1 wstETH
        IERC20(WSTETH).approve(helperAddress, type(uint256).max);
        console.log("wstETH approved");

        // Step 3: Execute 2x leverage
        uint256 targetLeverage = 2e18; // 2x
        helper.executeLeverage(WSTETH, targetLeverage, userDeposit);

        console.log("2x leverage on 1 wstETH executed successfully!");

        vm.stopBroadcast();
    }
}
