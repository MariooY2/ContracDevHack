# wstETH Leverage Platform

A decentralized leverage trading platform built on Aave V3, enabling users to achieve up to 2x leverage on wstETH positions using flash loans.

## Overview

This platform allows users to amplify their wstETH exposure without requiring additional capital upfront. By utilizing Aave V3's flash loan functionality, users can:

- **Leverage Up**: Execute 2x leveraged positions on wstETH in a single transaction
- **Monitor Risk**: Real-time risk assessment based on wstETH/ETH premium/discount
- **Unwind Safely**: Close leveraged positions and return to base asset

## Features

- ⚡ Flash loan-based leverage (no upfront capital needed)
- 📊 Real-time depeg risk monitoring with visual charts
- 🎯 User-friendly leverage recommendations (Safe & Steady, Balanced, Maximum Returns)
- 🔐 Non-custodial (contracts interact directly with Aave V3)
- 🎨 Brutalist terminal-style UI
- 📱 Wallet integration (MetaMask, WalletConnect, etc.)

## Architecture

### Smart Contracts (Foundry)
- **FlashLoanLeverageHelper**: Core contract handling flash loan execution, leverage, and deleveraging
- **Aave V3 Integration**: Utilizes credit delegation and flash loans on Ethereum mainnet

### Frontend (Next.js)
- React + TypeScript + TailwindCSS
- Wagmi + Viem for web3 interactions
- Real-time position tracking and risk assessment

## Tech Stack

**Smart Contracts:**
- Solidity ^0.8.20
- Foundry (forge, cast)
- OpenZeppelin Contracts
- Aave V3 Protocol

**Frontend:**
- Next.js 15
- React 19
- TypeScript
- Wagmi v2
- Viem
- TailwindCSS
- Recharts

## Prerequisites

- Node.js 18+
- Foundry ([installation guide](https://book.getfoundry.sh/getting-started/installation))
- A wallet with ETH on contract.dev network

## Installation

### 1. Clone the repository

```bash
git clone <repository-url>
cd forge-contracts
```

### 2. Install Foundry dependencies

```bash
forge install
```

### 3. Install Frontend dependencies

```bash
cd frontend
npm install
# or
yarn install
```

### 4. Configure environment variables

Create a `.env` file in the root directory:

```bash
# Wallet Configuration
STAGENET_PRIVATE_KEY=<your-private-key>
STAGENET_RPC_URL=https://rpc.contract.dev/<your-api-key>

# Deployed Contracts
FLASH_LOAN_HELPER=0x932326f46bC4ba386b31B462560f20b5Db5315EB

# Network Configuration
CHAIN_ID=13957

# Morpho API
MORPHO_API_URL=https://blue-api.morpho.org/graphql
```

Create a `frontend/.env.local` file:

```bash
NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID=<your-walletconnect-project-id>
NEXT_PUBLIC_RPC_URL=https://rpc.contract.dev/<your-api-key>
NEXT_PUBLIC_CHAIN_ID=13957
NEXT_PUBLIC_LEVERAGE_HELPER_ADDRESS=0x932326f46bC4ba386b31B462560f20b5Db5315EB
NEXT_PUBLIC_WSTETH_ADDRESS=0x7f39C581F595B53c5cb19bD0b3f8dA6c935E2Ca0
```

## Usage

### Smart Contract Scripts

#### Deploy Flash Loan Helper (if needed)

```bash
forge script script/DeployFlashLoan.s.sol --rpc-url $STAGENET_RPC_URL --broadcast
```

#### Execute Leverage Position

Create a 2x leveraged position with 1 wstETH:

```bash
forge script script/ExecuteFlashLoan.s.sol --rpc-url $STAGENET_RPC_URL --broadcast
```

Or using cast:

```bash
# 1. Approve credit delegation
cast send <VARIABLE_DEBT_TOKEN> "approveDelegation(address,uint256)" \
  0x932326f46bC4ba386b31B462560f20b5Db5315EB \
  115792089237316195423570985008687907853269984665640564039457584007913129639935 \
  --rpc-url $STAGENET_RPC_URL --private-key $STAGENET_PRIVATE_KEY

# 2. Approve wstETH
cast send 0x7f39C581F595B53c5cb19bD0b3f8dA6c935E2Ca0 "approve(address,uint256)" \
  0x932326f46bC4ba386b31B462560f20b5Db5315EB \
  115792089237316195423570985008687907853269984665640564039457584007913129639935 \
  --rpc-url $STAGENET_RPC_URL --private-key $STAGENET_PRIVATE_KEY

# 3. Execute 2x leverage on 1 wstETH
cast send 0x932326f46bC4ba386b31B462560f20b5Db5315EB \
  "executeLeverage(address,uint256,uint256)" \
  0x7f39C581F595B53c5cb19bD0b3f8dA6c935E2Ca0 \
  2000000000000000000 \
  1000000000000000000 \
  --rpc-url $STAGENET_RPC_URL --private-key $STAGENET_PRIVATE_KEY
```

#### Unwind Leverage Position

Close your leveraged position:

```bash
forge script script/UnwindFlashLoan.s.sol --rpc-url $STAGENET_RPC_URL --broadcast
```

Or using cast:

```bash
# 1. Approve aToken spending
cast send <A_WSTETH_TOKEN> "approve(address,uint256)" \
  0x932326f46bC4ba386b31B462560f20b5Db5315EB \
  115792089237316195423570985008687907853269984665640564039457584007913129639935 \
  --rpc-url $STAGENET_RPC_URL --private-key $STAGENET_PRIVATE_KEY

# 2. Execute deleverage
cast send 0x932326f46bC4ba386b31B462560f20b5Db5315EB \
  "executeDeleverage(address)" \
  0x7f39C581F595B53c5cb19bD0b3f8dA6c935E2Ca0 \
  --rpc-url $STAGENET_RPC_URL --private-key $STAGENET_PRIVATE_KEY
```

### Frontend Application

#### Development

```bash
cd frontend
npm run dev
```

Visit [http://localhost:3000](http://localhost:3000)

#### Production Build

```bash
npm run build
npm start
```

## How It Works

### Leverage Execution Flow

1. **User Deposits**: User approves and deposits initial wstETH collateral
2. **Credit Delegation**: User delegates borrowing rights to the helper contract
3. **Flash Loan**: Helper contract takes a flash loan of wstETH from Aave V3
4. **Supply to Aave**: Flash loaned wstETH is supplied as collateral to user's Aave position
5. **Borrow on Behalf**: Helper borrows wstETH using delegated credit on behalf of the user
6. **Repay Flash Loan**: Borrowed wstETH repays the flash loan
7. **Result**: User has a leveraged position (e.g., 2x exposure)

### Deleverage Execution Flow

1. **Approve aTokens**: User approves helper to withdraw their collateral
2. **Flash Loan**: Helper takes a flash loan to repay user's debt
3. **Repay Debt**: Flash loaned funds repay user's variable debt
4. **Withdraw Collateral**: Helper withdraws user's collateral from Aave
5. **Repay Flash Loan**: Withdrawn collateral repays the flash loan
6. **Return Remainder**: Remaining wstETH is returned to user's wallet

### Risk Monitoring

The platform monitors wstETH/ETH premium/discount in real-time:

- **Safe Zone** (<2% discount): Low risk, leverage recommended
- **Moderate Risk** (2-5% discount): Caution advised
- **High Risk** (>5% discount): Consider unwinding position

## Deployed Addresses

### Contract.dev Mainnet Fork (Chain ID: 13957)

- **FlashLoanLeverageHelper**: `0x932326f46bC4ba386b31B462560f20b5Db5315EB`
- **wstETH**: `0x7f39C581F595B53c5cb19bD0b3f8dA6c935E2Ca0`
- **Aave V3 Pool**: `0x87870Bca3F3fD6335C3F4ce8392D69350B4fA4E2`
- **Aave Data Provider**: `0x0a16f2FCC0D44FaE41cc54e079281D84A363bECD`

## Development

### Running Tests

```bash
forge test
```

### Compiling Contracts

```bash
forge build
```

### Linting Frontend

```bash
cd frontend
npm run lint
```

## Security Considerations

⚠️ **Important Notes:**

- This is experimental software. Use at your own risk.
- Flash loans carry liquidation risk if wstETH depegs significantly
- Always monitor your position's health factor
- The platform is deployed on a mainnet fork (contract.dev) for testing
- Never share your private keys or commit them to version control

## Troubleshooting

### Frontend Transaction Errors

If you encounter "Block at number X could not be found" errors:
- The transaction likely succeeded despite the error
- Clear your wallet's cached data
- The error is due to block number caching on the forked network

### Gas Estimation Failures

Gas limits are manually set to avoid estimation issues on the fork:
- Leverage execution: 3,000,000 gas
- Token approvals: 100,000 gas

## License

MIT

## Contributing

Contributions are welcome! Please open an issue or submit a pull request.

## Support

For questions or issues, please open an issue on the GitHub repository.
