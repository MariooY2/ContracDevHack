// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";
import "../src/FlashLoan.sol";

contract ExecuteFlashLoan is Script {
    // Aave V3 on ETH Mainnet
    address constant AAVE_DATA_PROVIDER = 0x0a16f2FCC0D44FaE41cc54e079281D84A363bECD;
    address constant WSTETH = 0x7f39C581F595B53c5cb19bD0b3f8dA6c935E2Ca0;
    address constant WETH = 0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2;

    function run() external {
        uint256 deployerPrivateKey = vm.envUint("STAGENET_PRIVATE_KEY");
        address helperAddress = vm.envAddress("FLASH_LOAN_HELPER");

        console.log("Using deployed helper at:", helperAddress);

        vm.startBroadcast(deployerPrivateKey);

        FlashLoanLeverageHelper helper = FlashLoanLeverageHelper(payable(helperAddress));

        // Step 1: Approve credit delegation on WETH variable debt token
        (, , address wethDebtToken) = IAaveProtocolDataProvider(AAVE_DATA_PROVIDER)
            .getReserveTokensAddresses(WETH);
        IVariableDebtToken(wethDebtToken).approveDelegation(
            helperAddress,
            type(uint256).max
        );
        console.log("WETH credit delegation approved on:", wethDebtToken);

        // Step 2: Approve wstETH transfer to helper
        uint256 userDeposit = 1 ether; // 1 wstETH
        IERC20(WSTETH).approve(helperAddress, type(uint256).max);
        console.log("wstETH approved");

        // Step 3: Execute 2x leverage (wstETH collateral / WETH debt)
        uint256 targetLeverage = 2e18; // 2x
        uint256 minWstethOut = 0; // no slippage protection for script
        helper.executeLeverage(targetLeverage, userDeposit, minWstethOut);

        console.log("2x cross-asset leverage on 1 wstETH executed successfully!");

        vm.stopBroadcast();
    }
}
