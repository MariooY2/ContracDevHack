# VOLT Protocol

A decentralized leverage trading platform for wstETH on Base, powered by Morpho Blue flash loans and Uniswap V3 swaps.

## Overview

VOLT Protocol allows users to amplify their wstETH staking yield through leveraged positions on Morpho Blue. By utilizing Morpho's flash loan functionality and Uniswap V3 for swaps, users can:

- **Leverage Up**: Open leveraged wstETH positions (up to ~18x) in a single transaction
- **Deleverage**: Close positions and receive remaining wstETH back to wallet
- **Monitor Risk**: Real-time health factor tracking and depeg risk monitoring

## Architecture

### Smart Contracts (Foundry)

- **MorphoFlashLoanLeverageHelper** — Core contract handling flash loan execution, leverage, and deleveraging via Morpho Blue
- **Morpho Blue** — Lending protocol providing flash loans and the wstETH/WETH market
- **Uniswap V3** — DEX used for wstETH <-> WETH swaps (0.01% fee pool)

### How It Works

**Leverage Flow:**
1. User deposits wstETH into the helper contract
2. Helper calculates additional wstETH needed based on target leverage
3. Helper flash-borrows WETH from Morpho Blue
4. WETH is swapped to wstETH via Uniswap V3
5. Total wstETH (user deposit + swapped) is supplied as collateral on Morpho
6. WETH debt is opened against the collateral to repay the flash loan

**Deleverage Flow:**
1. Helper flash-borrows WETH from Morpho Blue
2. Flash loan repays user's WETH debt on Morpho
3. Collateral (wstETH) is withdrawn from Morpho
4. Enough wstETH is swapped back to WETH via Uniswap V3 to repay the flash loan
5. Remaining wstETH is returned to the user's wallet

### Frontend (Next.js)

- Next.js 16, React 19, TypeScript, Tailwind v4
- Wagmi v2 + Viem for on-chain interactions
- ConnectKit for wallet connection
- Framer Motion animations, Zustand state management
- Real-time position tracking, yield calculations, and oracle depeg charts

## Tech Stack

**Smart Contracts:**
- Solidity ^0.8.20
- Foundry (forge, cast)
- Morpho Blue Protocol
- Uniswap V3

**Frontend:**
- Next.js 16 / React 19 / TypeScript
- Wagmi v2 / Viem
- Tailwind v4 / Framer Motion
- ConnectKit / Zustand

## Prerequisites

- Node.js 18+
- Foundry ([installation guide](https://book.getfoundry.sh/getting-started/installation))
- A [contract.dev](https://contract.dev) account with a Base fork
- A wallet with wstETH on your fork

## Setup Guide

> **Important**: This project runs on a contract.dev Base fork. Each user needs their own fork and must deploy the smart contract themselves.

### 1. Create a Base Fork

1. Go to [contract.dev](https://contract.dev) and create a new Base mainnet fork
2. Note your fork's RPC URL and chain ID

### 2. Clone and Install

```bash
git clone <repository-url>
cd ContracDevHack

# Install contract dependencies
cd contracts
forge install

# Install frontend dependencies
cd ../frontend
npm install
```

### 3. Configure Environment

Create `contracts/.env`:

```bash
STAGENET_PRIVATE_KEY=<your-private-key>
STAGENET_RPC_URL_BASE=<your-base-fork-rpc-url>
```

### 4. Deploy the Smart Contract

```bash
cd contracts

# Deploy MorphoFlashLoanLeverageHelper
forge script script/DeployMorphoFlashLoan.s.sol \
  --rpc-url $STAGENET_RPC_URL_BASE \
  --broadcast
```

If `forge script` broadcast fails (common on forks), use direct deployment:

```bash
# Build first
forge build

# Deploy directly with forge create
forge create src/MorphoFlashLoan.sol:MorphoFlashLoanLeverageHelper \
  --constructor-args \
    0xBBBBBbbBBb9cC5e90e3b3Af64bdAF62C37EEFFCb \
    0x3a4048c64ba1b375330d376b1ce40e4047d03b47ab4d48af484edec9fec801ba \
    "(0x4200000000000000000000000000000000000006,0xc1CBa3fCea344f92D9239c08C0568f6F2F0ee452,<ORACLE_ADDRESS>,<IRM_ADDRESS>,<LLTV>)" \
    0x4200000000000000000000000000000000000006 \
    0xc1CBa3fCea344f92D9239c08C0568f6F2F0ee452 \
    0x2626664c2603336E57B271c5C0b26F421741e481 \
    0x20E068D76f9E90b90604500B84c7e19dCB923e7e \
    100 \
  --rpc-url $STAGENET_RPC_URL_BASE \
  --private-key $STAGENET_PRIVATE_KEY
```

To get the market params (oracle, IRM, LLTV) for the constructor:

```bash
cast call 0xBBBBBbbBBb9cC5e90e3b3Af64bdAF62C37EEFFCb \
  "idToMarketParams(bytes32)" \
  0x3a4048c64ba1b375330d376b1ce40e4047d03b47ab4d48af484edec9fec801ba \
  --rpc-url $STAGENET_RPC_URL_BASE
```

### 5. Update Frontend Config

After deployment, update the helper address in [frontend/lib/leverageContract.ts](frontend/lib/leverageContract.ts):

```typescript
export const MORPHO_ADDRESSES = {
  LEVERAGE_HELPER: '<your-deployed-address>' as Address,
  // ... rest stays the same
};
```

Also update the RPC URL in [frontend/lib/types.ts](frontend/lib/types.ts) to point to your fork.

### 6. Run the Frontend

```bash
cd frontend
npm run dev
```

Visit [http://localhost:3000](http://localhost:3000)

## Manual Testing with Cast

### Create a Leveraged Position

```bash
RPC=<your-fork-rpc-url>
PK=<your-private-key>
HELPER=<your-deployed-helper-address>

# 1. Approve wstETH spending
cast send 0xc1CBa3fCea344f92D9239c08C0568f6F2F0ee452 \
  "approve(address,uint256)" $HELPER \
  115792089237316195423570985008687907853269984665640564039457584007913129639935 \
  --rpc-url $RPC --private-key $PK

# 2. Authorize helper on Morpho Blue
cast send 0xBBBBBbbBBb9cC5e90e3b3Af64bdAF62C37EEFFCb \
  "setAuthorization(address,bool)" $HELPER true \
  --rpc-url $RPC --private-key $PK

# 3. Execute 3x leverage with 0.1 wstETH deposit
cast send $HELPER \
  "executeLeverage(uint256,uint256)" \
  3000000000000000000 \
  100000000000000000 \
  --rpc-url $RPC --private-key $PK --gas-limit 3000000
```

### Check Position

```bash
cast call $HELPER \
  "getUserPosition(address)" <your-wallet-address> \
  --rpc-url $RPC
```

### Close Position (Deleverage)

```bash
cast send $HELPER \
  "executeDeleverage()" \
  --rpc-url $RPC --private-key $PK --gas-limit 3000000
```

## Key Addresses (Base)

| Contract | Address |
|----------|---------|
| Morpho Blue | `0xBBBBBbbBBb9cC5e90e3b3Af64bdAF62C37EEFFCb` |
| WETH | `0x4200000000000000000000000000000000000006` |
| wstETH | `0xc1CBa3fCea344f92D9239c08C0568f6F2F0ee452` |
| Uniswap V3 Router | `0x2626664c2603336E57B271c5C0b26F421741e481` |
| Uniswap V3 wstETH/WETH Pool | `0x20E068D76f9E90b90604500B84c7e19dCB923e7e` |
| Morpho Market ID | `0x3a4048c64ba1b375330d376b1ce40e4047d03b47ab4d48af484edec9fec801ba` |

## Troubleshooting

### Fork Pod Crashes (502 Errors)

Complex transactions (especially deleverage) can crash the contract.dev fork pod. Wait 15-30 seconds and retry — the transaction often succeeded despite the error.

### "Block at number X could not be found"

This is a fork-specific polling issue. The transaction likely succeeded. The frontend handles this gracefully.

### Gas Estimation Failures

Gas limits are set manually to avoid estimation issues on forks:
- Leverage/Deleverage: 3,000,000 gas
- Token approvals: 100,000 gas

### Oracle vs Pool Price Divergence

The contract uses Uniswap V3 pool prices (not oracle prices) for flash loan sizing and swap calculations. This ensures operations work correctly even if the oracle aggregator address is changed on the fork.

## Security

- This is experimental software deployed on a test fork. Use at your own risk.
- Leveraged positions carry liquidation risk if wstETH depegs significantly
- The Morpho market LLTV is 94.5% — liquidation mainly occurs from interest accrual
- Never share your private keys or commit them to version control

## License

MIT
