// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";
import "../src/MorphoFlashLoan.sol";
import "../src/interfaces/IMorpho.sol";

contract DeployMorphoFlashLoan is Script {
    // Base network addresses
    address constant MORPHO_BLUE = 0xBBBBBbbBBb9cC5e90e3b3Af64bdAF62C37EEFFCb;
    bytes32 constant MARKET_ID = 0x3a4048c64ba1b375330d376b1ce40e4047d03b47ab4d48af484edec9fec801ba;
    address constant LIFI_DIAMOND = 0x1231DEB6f5749EF6cE6943a275A1D3E7486F4EaE; // LiFi Diamond proxy
    address constant WETH = 0x4200000000000000000000000000000000000006;
    address constant WSTETH = 0xc1CBa3fCea344f92D9239c08C0568f6F2F0ee452;
    // Aerodrome Router v2 on Base (fallback for direct swaps on fork)
    address constant AERODROME_ROUTER = 0xcF77a3Ba9A5CA399B7c97c74d54e5b1Beb874E43;

    function run() external {
        uint256 deployerPrivateKey = vm.envUint("STAGENET_PRIVATE_KEY");
        address deployer = vm.addr(deployerPrivateKey);

        console.log("=== Deploying MorphoFlashLoanLeverageHelper on Base ===");
        console.log("Deployer:", deployer);
        console.log("Morpho Blue:", MORPHO_BLUE);
        console.log("Market ID:", vm.toString(MARKET_ID));
        console.log("LiFi Diamond:", LIFI_DIAMOND);
        console.log("WETH:", WETH);
        console.log("wstETH:", WSTETH);

        // Fetch market params from Morpho
        IMorpho morpho = IMorpho(MORPHO_BLUE);

        console.log("\n=== Fetching Market Parameters ===");
        IMorpho.MarketParams memory params = morpho.idToMarketParams(MARKET_ID);

        console.log("Loan Token:", params.loanToken);
        console.log("Collateral Token:", params.collateralToken);
        console.log("Oracle:", params.oracle);
        console.log("IRM:", params.irm);
        console.log("LLTV:", params.lltv);

        // Verify market params
        require(params.loanToken == WETH, "Market loan token must be WETH");
        require(params.collateralToken == WSTETH, "Market collateral token must be wstETH");
        require(params.lltv > 0, "Market LLTV must be set");

        console.log("\n=== Deploying Contract ===");

        vm.startBroadcast(deployerPrivateKey);

        MorphoFlashLoanLeverageHelper helper = new MorphoFlashLoanLeverageHelper(
            MORPHO_BLUE,
            MARKET_ID,
            params,
            LIFI_DIAMOND,
            WETH,
            WSTETH,
            AERODROME_ROUTER
        );

        vm.stopBroadcast();

        console.log("\n=== Deployment Successful! ===");
        console.log("MorphoFlashLoanLeverageHelper deployed at:", address(helper));
        console.log("\nAdd this to your .env file:");
        console.log("MORPHO_FLASH_LOAN_HELPER=", address(helper));
        console.log("\nMax safe leverage:", helper.getMaxSafeLeverage() / 1e18, "x");
    }
}
