// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title IMorpho
/// @notice Interface for Morpho Blue lending protocol
/// @dev Morpho Blue uses market-based isolated lending with MarketParams structs
interface IMorpho {
    /// @notice Market parameters that define an isolated lending market
    /// @param loanToken The address of the token being borrowed
    /// @param collateralToken The address of the token used as collateral
    /// @param oracle The address of the price oracle for this market
    /// @param irm The address of the interest rate model
    /// @param lltv The loan-to-value ratio (liquidation threshold) in 18 decimals
    struct MarketParams {
        address loanToken;
        address collateralToken;
        address oracle;
        address irm;
        uint256 lltv;
    }

    /// @notice User position data for a specific market
    /// @param supplyShares The amount of supply shares owned
    /// @param borrowShares The amount of borrow shares owed
    /// @param collateral The amount of collateral deposited
    struct Position {
        uint256 supplyShares;
        uint128 borrowShares;
        uint128 collateral;
    }

    /// @notice Flash loan callback data
    /// @param token The address of the token being flash loaned
    /// @param assets The amount of assets flash loaned
    /// @param data Arbitrary data passed to the callback
    function flashLoan(address token, uint256 assets, bytes calldata data) external;

    /// @notice Supply collateral to a market on behalf of a user
    /// @param marketParams The market parameters
    /// @param assets The amount of collateral to supply
    /// @param onBehalf The address to credit the collateral to
    /// @param data Arbitrary callback data
    function supplyCollateral(
        MarketParams calldata marketParams,
        uint256 assets,
        address onBehalf,
        bytes calldata data
    ) external;

    /// @notice Borrow assets from a market
    /// @param marketParams The market parameters
    /// @param assets The amount to borrow (0 if using shares)
    /// @param shares The shares to borrow (0 if using assets)
    /// @param onBehalf The address to assign the debt to
    /// @param receiver The address to receive the borrowed assets
    /// @return assetsBorrowed The actual amount of assets borrowed
    /// @return sharesBorrowed The actual amount of shares borrowed
    function borrow(
        MarketParams calldata marketParams,
        uint256 assets,
        uint256 shares,
        address onBehalf,
        address receiver
    ) external returns (uint256 assetsBorrowed, uint256 sharesBorrowed);

    /// @notice Repay borrowed assets
    /// @param marketParams The market parameters
    /// @param assets The amount to repay (0 if using shares)
    /// @param shares The shares to repay (0 if using assets)
    /// @param onBehalf The address whose debt to repay
    /// @param data Arbitrary callback data
    /// @return assetsRepaid The actual amount of assets repaid
    /// @return sharesRepaid The actual amount of shares repaid
    function repay(
        MarketParams calldata marketParams,
        uint256 assets,
        uint256 shares,
        address onBehalf,
        bytes calldata data
    ) external returns (uint256 assetsRepaid, uint256 sharesRepaid);

    /// @notice Withdraw collateral from a market
    /// @param marketParams The market parameters
    /// @param assets The amount of collateral to withdraw
    /// @param onBehalf The address to withdraw collateral from
    /// @param receiver The address to receive the withdrawn collateral
    /// @return assetsWithdrawn The actual amount withdrawn
    function withdrawCollateral(
        MarketParams calldata marketParams,
        uint256 assets,
        address onBehalf,
        address receiver
    ) external returns (uint256 assetsWithdrawn);

    /// @notice Authorize or deauthorize an address to manage positions on behalf of the caller
    /// @param authorized The address to authorize or deauthorize
    /// @param isAuthorized True to authorize, false to deauthorize
    function setAuthorization(address authorized, bool isAuthorized) external;

    /// @notice Check if an address is authorized to manage positions
    /// @param authorizer The address that granted authorization
    /// @param authorized The address that was authorized
    /// @return True if authorized, false otherwise
    function isAuthorized(address authorizer, address authorized) external view returns (bool);

    /// @notice Get the position of a user in a market
    /// @param id The market ID (keccak256 of MarketParams)
    /// @param user The user address
    /// @return supplyShares The supply shares
    /// @return borrowShares The borrow shares
    /// @return collateral The collateral amount
    function position(bytes32 id, address user)
        external
        view
        returns (uint256 supplyShares, uint128 borrowShares, uint128 collateral);

    /// @notice Get market parameters from a market ID
    /// @param id The market ID
    /// @return The MarketParams struct
    function idToMarketParams(bytes32 id) external view returns (MarketParams memory);

    /// @notice Get market data
    /// @param id The market ID
    function market(bytes32 id) external view returns (
        uint128 totalSupplyAssets,
        uint128 totalSupplyShares,
        uint128 totalBorrowAssets,
        uint128 totalBorrowShares,
        uint128 lastUpdate,
        uint128 fee
    );

    /// @notice Accrue interest for a market
    /// @param marketParams The market parameters
    function accrueInterest(MarketParams calldata marketParams) external;

    /// @notice Get the market ID for given market parameters
    /// @param marketParams The market parameters
    /// @return The market ID (keccak256 of params)
    function id(MarketParams memory marketParams) external pure returns (bytes32);
}
