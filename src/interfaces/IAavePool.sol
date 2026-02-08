// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title IAavePool
 * @notice Interface for Aave V3 Pool contract
 * @dev Main entry point for interacting with Aave Protocol
 */
interface IAavePool {
    /**
     * @notice Executes a flash loan
     * @param receiverAddress Address of the contract receiving the funds
     * @param assets Array of asset addresses to flash loan
     * @param amounts Array of amounts to flash loan
     * @param interestRateModes Mode of debt (0=no debt, 1=stable, 2=variable)
     * @param onBehalfOf Address that will receive the debt (for modes 1,2)
     * @param params Arbitrary data to pass to receiver
     * @param referralCode Referral code for integrators
     */
    function flashLoan(
        address receiverAddress,
        address[] calldata assets,
        uint256[] calldata amounts,
        uint256[] calldata interestRateModes,
        address onBehalfOf,
        bytes calldata params,
        uint16 referralCode
    ) external;

    /**
     * @notice Supplies an asset to the Aave protocol
     * @param asset Address of the asset to supply
     * @param amount Amount to supply
     * @param onBehalfOf Address that will receive the aTokens
     * @param referralCode Referral code for integrators
     */
    function supply(
        address asset,
        uint256 amount,
        address onBehalfOf,
        uint16 referralCode
    ) external;

    /**
     * @notice Returns user account data across all reserves
     * @param user Address of the user
     * @return totalCollateralBase Total collateral in base currency
     * @return totalDebtBase Total debt in base currency
     * @return availableBorrowsBase Available borrowing power
     * @return currentLiquidationThreshold Weighted average liquidation threshold
     * @return ltv Weighted average loan to value
     * @return healthFactor Current health factor
     */
    function getUserAccountData(
        address user
    )
        external
        view
        returns (
            uint256 totalCollateralBase,
            uint256 totalDebtBase,
            uint256 availableBorrowsBase,
            uint256 currentLiquidationThreshold,
            uint256 ltv,
            uint256 healthFactor
        );

    /**
     * @notice Returns the reserve data for a given asset
     * @param asset Address of the underlying asset
     * @return configuration Reserve configuration bitmap
     * @return liquidityIndex Liquidity index
     * @return currentLiquidityRate Current liquidity rate
     * @return variableBorrowIndex Variable borrow index
     * @return currentVariableBorrowRate Current variable borrow rate
     * @return currentStableBorrowRate Current stable borrow rate
     * @return lastUpdateTimestamp Timestamp of last update
     * @return id Reserve id
     * @return aTokenAddress Address of aToken
     * @return stableDebtTokenAddress Address of stable debt token
     * @return variableDebtTokenAddress Address of variable debt token
     * @return interestRateStrategyAddress Address of interest rate strategy
     * @return accruedToTreasury Amount accrued to treasury
     * @return unbacked Unbacked amount
     * @return isolationModeTotalDebt Total debt in isolation mode
     */
    function getReserveData(
        address asset
    )
        external
        view
        returns (
            uint256 configuration,
            uint128 liquidityIndex,
            uint128 currentLiquidityRate,
            uint128 variableBorrowIndex,
            uint128 currentVariableBorrowRate,
            uint128 currentStableBorrowRate,
            uint40 lastUpdateTimestamp,
            uint16 id,
            address aTokenAddress,
            address stableDebtTokenAddress,
            address variableDebtTokenAddress,
            address interestRateStrategyAddress,
            uint128 accruedToTreasury,
            uint128 unbacked,
            uint128 isolationModeTotalDebt
        );

    /**
     * @notice Repays a borrowed amount
     * @param asset Address of the underlying asset
     * @param amount Amount to repay (use uint256.max to repay all)
     * @param interestRateMode Interest rate mode (1=stable, 2=variable)
     * @param onBehalfOf Address of the user for whom to repay
     * @return Amount actually repaid
     */
    function repay(
        address asset,
        uint256 amount,
        uint256 interestRateMode,
        address onBehalfOf
    ) external returns (uint256);

    /**
     * @notice Withdraws an asset from the protocol
     * @param asset Address of the underlying asset
     * @param amount Amount to withdraw (use uint256.max to withdraw all)
     * @param to Address that will receive the withdrawn amount
     * @return Amount actually withdrawn
     */
    function withdraw(
        address asset,
        uint256 amount,
        address to
    ) external returns (uint256);

    /**
     * @notice Returns the flash loan premium rate
     * @return Premium in basis points (e.g., 9 = 0.09%)
     */
    function FLASHLOAN_PREMIUM_TOTAL() external view returns (uint128);
}
