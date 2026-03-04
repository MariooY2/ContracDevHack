# VOLT Protocol

A DeFi leverage platform built on Morpho Blue, enabling users to take leveraged positions on yield-bearing assets using flash loans with on-chain oracle depeg risk analysis.

## Overview

VOLT Protocol allows users to amplify their exposure to yield-bearing tokens (LSTs, LRTs, stablecoins) across multiple chains. The platform combines flash loan leverage with real-time oracle depeg monitoring to recommend safe leverage levels.

**Key Features:**

- Flash loan leverage on Morpho Blue markets (Base, Ethereum, Arbitrum)
- On-chain oracle vs intrinsic depeg analysis across 180 days of history
- Data-driven leverage recommendations based on historical depeg risk
- Multi-chain market discovery with real-time APY tracking
- Smart account support with ERC-4337 batched transactions

## Architecture

### Smart Contracts (Foundry)

- **MorphoFlashLoan.sol** — Core contract handling flash loan leverage/deleverage via Morpho Blue
- **Aerodrome SlipStream CL** — Swap routing through concentrated liquidity pools
- Deployed on Base fork (Chain ID: 18133)

### Frontend (Next.js)

- **Market Explorer** — Browse Morpho Blue markets across chains with APY, utilization, and depeg data
- **Depeg Analysis** — Oracle vs intrinsic price charts with liquidation threshold overlays
- **Strategy Panel** — Leverage/deleverage execution with risk-aware recommendations
- **Cron Jobs** — Automated market data, token rates, and depeg history refresh

### Data Pipeline

```
On-chain RPCs (Alchemy)
    |
    v
Cron Endpoints (/api/cron/*)
    |-- refresh-markets:  Morpho Blue GraphQL -> Supabase
    |-- refresh-rates:    Token exchange rates (stEthPerToken, ERC4626, etc.)
    |-- refresh-analysis: Oracle price() vs intrinsic rate -> depeg history
    |
    v
Supabase (morpho_data, oracle_depeg_history)
    |
    v
Frontend (Zustand store, SVG charts)
```

## Tech Stack

**Smart Contracts:**
- Solidity ^0.8.20, Foundry
- Morpho Blue, Aerodrome SlipStream CL

**Frontend:**
- Next.js 16, React 19, TypeScript
- Wagmi v2, Viem, RainbowKit
- Tailwind v4, Framer Motion
- Zustand v5 (state management)
- Supabase (data persistence)

## Getting Started

### Prerequisites

- Node.js 18+
- Foundry ([installation guide](https://book.getfoundry.sh/getting-started/installation))

### Installation

```bash
git clone <repository-url>
cd ContracDevHack

# Smart contracts
cd contracts && forge install

# Frontend
cd ../frontend && npm install
```

### Environment Variables

Create `frontend/.env`:

```bash
# Supabase
NEXT_PUBLIC_SUPABASE_URL=<your-supabase-url>
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY=<your-supabase-key>

# RPC (Alchemy recommended for archive state)
ETHEREUM_RPC_URL=https://eth-mainnet.g.alchemy.com/v2/<key>
BASE_RPC_URL=https://base-mainnet.g.alchemy.com/v2/<key>
ARBITRUM_RPC_URL=https://arb-mainnet.g.alchemy.com/v2/<key>

# Wallet
NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID=<your-project-id>
NEXT_PUBLIC_RPC_URL=https://rpc.contract.dev/<your-api-key>
```

### Running

```bash
cd frontend
npm run dev
```

Visit [http://localhost:3000](http://localhost:3000)

### Data Refresh

Populate market data and depeg history:

```bash
# 1. Fetch markets from Morpho Blue GraphQL
curl http://localhost:3000/api/cron/refresh-markets

# 2. Fetch on-chain token APYs
curl http://localhost:3000/api/cron/refresh-rates

# 3. Run oracle depeg analysis (180-day backfill on first run)
curl http://localhost:3000/api/cron/refresh-analysis
```

## Oracle Depeg Analysis

The core risk engine compares Morpho oracle prices against on-chain intrinsic token values:

```
oracle_exchange_rate = Morpho.price() / 10^(36 + loanDec - collateralDec)
true_intrinsic_rate  = collateral.stEthPerToken() / loan.stEthPerToken()
depeg = (oracle_exchange_rate / true_intrinsic_rate - 1) * 100
```

Supported intrinsic rate methods:
- **LSTs**: wstETH, cbETH, rETH, LsETH (exchange rate functions)
- **LRTs**: weETH, rsETH, ezETH, pufETH, agETH, rswETH (ERC4626, custom oracles)
- **Yield ETH**: OETH, superOETHb, ETH0 (rebasing), hgETH, yoETH (ERC4626)
- **Stablecoins**: sUSDe, sDAI, sUSDS, sUSDf, syrupUSDC (ERC4626)

## Deployed Contracts

### Base Fork (Chain ID: 18133)

- **MorphoFlashLoan Helper**: `0x8a7056d943E66fecA6b87978Cc591d8FdDe239Cf`
- **Morpho Market**: `0x3a4048c64ba1b375330d376b1ce40e4047d03b47ab4d48af484edec9fec801ba`
- **SlipStream CL Router**: `0xBE6D8f0d05cC4be24d5167a3eF062215bE6D18a5`

## Security

- This is experimental software for a hackathon. Use at your own risk.
- Flash loans carry liquidation risk if oracle prices deviate significantly from intrinsic values.
- Always monitor your position's health factor.
- Never share private keys or commit them to version control.

## License

MIT
