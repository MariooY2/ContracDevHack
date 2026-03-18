// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import "../src/MorphoLeverageHelper.sol";
import "../src/interfaces/IMorpho.sol";

/**
 * @title MorphoLeverageHelper Fork Test
 * @notice Tests against real Base mainnet via fork
 *         Uses real Morpho Blue, Uniswap V3 SwapRouter02, wstETH/WETH market
 */
contract MorphoLeverageHelperTest is Test {
    // Base mainnet addresses
    address constant MORPHO = 0xBBBBBbbBBb9cC5e90e3b3Af64bdAF62C37EEFFCb;
    address constant WETH = 0x4200000000000000000000000000000000000006;
    address constant WSTETH = 0xc1CBa3fCea344f92D9239c08C0568f6F2F0ee452;
    address constant ORACLE = 0x4A11590e5326138B514E08A9B52202D42077Ca65;
    address constant IRM = 0x46415998764C29aB2a25CbeA6254146D50D22687;
    uint256 constant LLTV = 945000000000000000; // 94.5%

    // Uniswap V3 SwapRouter02 on Base (no deadline field in struct)
    address constant SWAP_ROUTER = 0x2626664c2603336E57B271c5C0b26F421741e481;

    // Uniswap V3 pool for price estimation
    address constant UNI_POOL = 0x20E068D76f9E90b90604500B84c7e19dCB923e7e;

    MorphoLeverageHelper helper;
    IMorpho.MarketParams mp;
    bytes32 marketId;

    address user1;
    address user2;
    address user3;

    function setUp() public {
        // Fork Base mainnet
        vm.createSelectFork("https://mainnet.base.org");

        helper = new MorphoLeverageHelper(MORPHO);

        // Approve Uniswap V3 SwapRouter as swap target
        helper.setSwapTarget(SWAP_ROUTER, true);

        mp = IMorpho.MarketParams({
            loanToken: WETH,
            collateralToken: WSTETH,
            oracle: ORACLE,
            irm: IRM,
            lltv: LLTV
        });
        marketId = keccak256(abi.encode(mp));

        // Setup test users
        user1 = makeAddr("user1");
        user2 = makeAddr("user2");
        user3 = makeAddr("user3");

        // Fund users with wstETH (deal directly)
        deal(WSTETH, user1, 10 ether);
        deal(WSTETH, user2, 5 ether);
        deal(WSTETH, user3, 20 ether);
    }

    // ═══════════════════════════════════════════════════════════
    // Helper: build Uniswap V3 SwapRouter02 exactInputSingle calldata
    // SwapRouter02 struct has NO deadline field
    // ═══════════════════════════════════════════════════════════
    function _buildSwapCalldata(
        address tokenIn,
        address tokenOut,
        uint256 amountIn,
        uint256 amountOutMinimum
    ) internal view returns (bytes memory) {
        // SwapRouter02 ExactInputSingleParams (no deadline)
        return abi.encodeWithSelector(
            bytes4(0x04e45aaf), // exactInputSingle selector on SwapRouter02
            tokenIn,
            tokenOut,
            uint24(100), // 0.01% fee
            address(helper), // recipient = our contract
            amountIn,
            amountOutMinimum,
            uint160(0) // sqrtPriceLimitX96
        );
    }

    // Get pool price estimate (1 WETH → ? wstETH)
    function _getWstethPerWeth() internal view returns (uint256) {
        (uint160 sqrtPriceX96,,,,,,) = IUniV3Pool(UNI_POOL).slot0();
        uint256 sqrtPrice = uint256(sqrtPriceX96);
        return (1e18 * sqrtPrice / (1 << 96)) * sqrtPrice / (1 << 96);
    }

    // Get pool price estimate (1 wstETH → ? WETH)
    function _getWethPerWsteth() internal view returns (uint256) {
        (uint160 sqrtPriceX96,,,,,,) = IUniV3Pool(UNI_POOL).slot0();
        uint256 sqrtPrice = uint256(sqrtPriceX96);
        return (1e18 * (1 << 96) / sqrtPrice) * (1 << 96) / sqrtPrice;
    }

    // ═══════════════════════════════════════════════════════════
    // TEST: Basic leverage 2x
    // ═══════════════════════════════════════════════════════════
    function test_leverage2x() public {
        uint256 deposit = 1 ether;
        uint256 wethPerWsteth = _getWethPerWsteth();
        // For 2x: flash = deposit * (2-1) * price = deposit * wethPerWsteth / 1e18
        uint256 flashAmount = (deposit * wethPerWsteth) / 1e18;

        // Expected collateral from swap (with 1% slippage tolerance)
        uint256 expectedCollateral = _getWstethPerWeth() * flashAmount / 1e18;
        uint256 minCollateral = expectedCollateral * 99 / 100;

        bytes memory swapData = _buildSwapCalldata(WETH, WSTETH, flashAmount, minCollateral);

        // User approves and authorizes
        vm.startPrank(user1);
        IERC20(WSTETH).approve(address(helper), deposit);
        IMorpho(MORPHO).setAuthorization(address(helper), true);

        helper.executeLeverage(mp, deposit, flashAmount, minCollateral, SWAP_ROUTER, swapData);
        vm.stopPrank();

        // Verify position
        (uint256 collateral, uint256 debt) = helper.getUserPosition(marketId, user1);
        assertGt(collateral, deposit, "Should have more collateral than deposit");
        assertGt(debt, 0, "Should have debt");

        emit log_named_uint("Collateral (wstETH)", collateral);
        emit log_named_uint("Debt (WETH)", debt);
        emit log_named_uint("Effective leverage (x100)", collateral * wethPerWsteth * 100 / 1e18 / (collateral * wethPerWsteth / 1e18 - debt));
    }

    // ═══════════════════════════════════════════════════════════
    // TEST: High leverage 5x
    // ═══════════════════════════════════════════════════════════
    function test_leverage5x() public {
        uint256 deposit = 1 ether;
        uint256 wethPerWsteth = _getWethPerWsteth();
        // For 5x: flash = deposit * (5-1) * price
        uint256 flashAmount = (deposit * 4 * wethPerWsteth) / 1e18;

        uint256 expectedCollateral = _getWstethPerWeth() * flashAmount / 1e18;
        uint256 minCollateral = expectedCollateral * 99 / 100;

        bytes memory swapData = _buildSwapCalldata(WETH, WSTETH, flashAmount, minCollateral);

        vm.startPrank(user1);
        IERC20(WSTETH).approve(address(helper), deposit);
        IMorpho(MORPHO).setAuthorization(address(helper), true);

        helper.executeLeverage(mp, deposit, flashAmount, minCollateral, SWAP_ROUTER, swapData);
        vm.stopPrank();

        (uint256 collateral, uint256 debt) = helper.getUserPosition(marketId, user1);
        assertGt(collateral, deposit * 4, "5x should have ~5x collateral");
        emit log_named_uint("5x Collateral", collateral);
        emit log_named_uint("5x Debt", debt);
    }

    // ═══════════════════════════════════════════════════════════
    // TEST: Multiple users with different positions
    // ═══════════════════════════════════════════════════════════
    function test_multiplePositions() public {
        uint256 wethPerWsteth = _getWethPerWsteth();

        // User 1: 2x leverage, 1 wstETH
        {
            uint256 deposit = 1 ether;
            uint256 flashAmount = (deposit * wethPerWsteth) / 1e18;
            uint256 expectedCollateral = _getWstethPerWeth() * flashAmount / 1e18;
            uint256 minCollateral = expectedCollateral * 99 / 100;
            bytes memory swapData = _buildSwapCalldata(WETH, WSTETH, flashAmount, minCollateral);

            vm.startPrank(user1);
            IERC20(WSTETH).approve(address(helper), deposit);
            IMorpho(MORPHO).setAuthorization(address(helper), true);
            helper.executeLeverage(mp, deposit, flashAmount, minCollateral, SWAP_ROUTER, swapData);
            vm.stopPrank();
        }

        // User 2: 3x leverage, 2 wstETH
        {
            uint256 deposit = 2 ether;
            uint256 flashAmount = (deposit * 2 * wethPerWsteth) / 1e18; // 3x = 2 additional
            uint256 expectedCollateral = _getWstethPerWeth() * flashAmount / 1e18;
            uint256 minCollateral = expectedCollateral * 99 / 100;
            bytes memory swapData = _buildSwapCalldata(WETH, WSTETH, flashAmount, minCollateral);

            vm.startPrank(user2);
            IERC20(WSTETH).approve(address(helper), deposit);
            IMorpho(MORPHO).setAuthorization(address(helper), true);
            helper.executeLeverage(mp, deposit, flashAmount, minCollateral, SWAP_ROUTER, swapData);
            vm.stopPrank();
        }

        // User 3: 3x leverage, 1 wstETH
        {
            uint256 deposit = 1 ether;
            uint256 flashAmount = (deposit * 2 * wethPerWsteth) / 1e18; // 3x = 2 additional
            uint256 expectedCollateral = _getWstethPerWeth() * flashAmount / 1e18;
            uint256 minCollateral = expectedCollateral * 99 / 100;
            bytes memory swapData = _buildSwapCalldata(WETH, WSTETH, flashAmount, minCollateral);

            vm.startPrank(user3);
            IERC20(WSTETH).approve(address(helper), deposit);
            IMorpho(MORPHO).setAuthorization(address(helper), true);
            helper.executeLeverage(mp, deposit, flashAmount, minCollateral, SWAP_ROUTER, swapData);
            vm.stopPrank();
        }

        // Verify all three positions exist independently
        (uint256 c1, uint256 d1) = helper.getUserPosition(marketId, user1);
        (uint256 c2, uint256 d2) = helper.getUserPosition(marketId, user2);
        (uint256 c3, uint256 d3) = helper.getUserPosition(marketId, user3);

        assertGt(c1, 0, "User1 should have collateral");
        assertGt(c2, 0, "User2 should have collateral");
        assertGt(c3, 0, "User3 should have collateral");
        assertGt(d1, 0, "User1 should have debt");
        assertGt(d2, 0, "User2 should have debt");
        assertGt(d3, 0, "User3 should have debt");

        // User 2 should have more collateral than user 1 (larger deposit + more leverage)
        assertGt(c2, c1, "User2 should have more collateral than user1");
        // User 3 should have more collateral than user 1 (same deposit, more leverage)
        assertGt(c3, c1, "User3 should have more collateral than user1");

        emit log_named_uint("User1 collateral", c1);
        emit log_named_uint("User1 debt", d1);
        emit log_named_uint("User2 collateral", c2);
        emit log_named_uint("User2 debt", d2);
        emit log_named_uint("User3 collateral", c3);
        emit log_named_uint("User3 debt", d3);
    }

    // ═══════════════════════════════════════════════════════════
    // TEST: Leverage then full deleverage
    // ═══════════════════════════════════════════════════════════
    function test_leverageThenDeleverage() public {
        uint256 deposit = 2 ether;
        uint256 wethPerWsteth = _getWethPerWsteth();
        uint256 flashAmount = (deposit * 2 * wethPerWsteth) / 1e18; // 3x

        uint256 expectedCollateral = _getWstethPerWeth() * flashAmount / 1e18;
        uint256 minCollateral = expectedCollateral * 99 / 100;
        bytes memory swapData = _buildSwapCalldata(WETH, WSTETH, flashAmount, minCollateral);

        // Leverage up
        vm.startPrank(user1);
        IERC20(WSTETH).approve(address(helper), deposit);
        IMorpho(MORPHO).setAuthorization(address(helper), true);
        helper.executeLeverage(mp, deposit, flashAmount, minCollateral, SWAP_ROUTER, swapData);

        uint256 wstethBefore = IERC20(WSTETH).balanceOf(user1);
        (uint256 collateral, uint256 debt) = helper.getUserPosition(marketId, user1);

        emit log_named_uint("Position collateral", collateral);
        emit log_named_uint("Position debt", debt);

        // Build deleverage swap: collateral→WETH
        // Need to swap enough wstETH to cover the debt + buffer
        uint256 wstethToSwap = (debt * 1e18 * 103) / (wethPerWsteth * 100); // 3% buffer
        if (wstethToSwap > collateral) wstethToSwap = collateral;

        uint256 minWethFromSwap = debt * 98 / 100; // 2% slippage
        bytes memory deleverageSwap = _buildSwapCalldata(WSTETH, WETH, wstethToSwap, minWethFromSwap);

        helper.executeDeleverage(mp, minWethFromSwap, SWAP_ROUTER, deleverageSwap);
        vm.stopPrank();

        // Position should be fully closed
        (uint256 c, uint256 d) = helper.getUserPosition(marketId, user1);
        assertEq(c, 0, "Collateral should be 0 after deleverage");
        assertEq(d, 0, "Debt should be 0 after deleverage");

        // User should have received remaining wstETH (equity)
        uint256 wstethAfter = IERC20(WSTETH).balanceOf(user1);
        assertGt(wstethAfter, wstethBefore, "User should receive equity back");
        emit log_named_uint("Returned wstETH", wstethAfter - wstethBefore);
    }

    // ═══════════════════════════════════════════════════════════
    // TEST: Slippage protection — revert if minOutput not met
    // ═══════════════════════════════════════════════════════════
    function test_revertOnExcessiveSlippage() public {
        uint256 deposit = 1 ether;
        uint256 wethPerWsteth = _getWethPerWsteth();
        uint256 flashAmount = (deposit * wethPerWsteth) / 1e18;

        // Set absurdly high minimum (more than what swap could ever return)
        uint256 absurdMinimum = flashAmount * 10; // Impossible output
        bytes memory swapData = _buildSwapCalldata(WETH, WSTETH, flashAmount, absurdMinimum);

        vm.startPrank(user1);
        IERC20(WSTETH).approve(address(helper), deposit);
        IMorpho(MORPHO).setAuthorization(address(helper), true);

        // Should revert because the swap router enforces amountOutMinimum
        vm.expectRevert();
        helper.executeLeverage(mp, deposit, flashAmount, absurdMinimum, SWAP_ROUTER, swapData);
        vm.stopPrank();
    }

    // ═══════════════════════════════════════════════════════════
    // TEST: Unapproved swap target reverts
    // ═══════════════════════════════════════════════════════════
    function test_revertUnapprovedSwapTarget() public {
        address fakeRouter = makeAddr("fakeRouter");

        vm.startPrank(user1);
        IERC20(WSTETH).approve(address(helper), 1 ether);
        IMorpho(MORPHO).setAuthorization(address(helper), true);

        vm.expectRevert(MorphoLeverageHelper.InvalidSwapTarget.selector);
        helper.executeLeverage(mp, 1 ether, 1 ether, 1, fakeRouter, "");
        vm.stopPrank();
    }

    // ═══════════════════════════════════════════════════════════
    // TEST: No authorization reverts
    // ═══════════════════════════════════════════════════════════
    function test_revertNoAuthorization() public {
        vm.startPrank(user1);
        IERC20(WSTETH).approve(address(helper), 1 ether);
        // NOT calling setAuthorization

        vm.expectRevert(MorphoLeverageHelper.AuthorizationNotGranted.selector);
        helper.executeLeverage(mp, 1 ether, 1 ether, 1, SWAP_ROUTER, "");
        vm.stopPrank();
    }

    // ═══════════════════════════════════════════════════════════
    // TEST: Pause prevents operations
    // ═══════════════════════════════════════════════════════════
    function test_pausePreventsLeverage() public {
        helper.setPaused(true);

        vm.startPrank(user1);
        IERC20(WSTETH).approve(address(helper), 1 ether);
        IMorpho(MORPHO).setAuthorization(address(helper), true);

        vm.expectRevert(MorphoLeverageHelper.ContractPaused.selector);
        helper.executeLeverage(mp, 1 ether, 1 ether, 1, SWAP_ROUTER, "");
        vm.stopPrank();
    }
}

interface IUniV3Pool {
    function slot0() external view returns (
        uint160 sqrtPriceX96, int24 tick, uint16 observationIndex,
        uint16 observationCardinality, uint16 observationCardinalityNext,
        uint8 feeProtocol, bool unlocked
    );
}
