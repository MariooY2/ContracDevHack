# Quick Start Guide

## Wallet Connection Integration Complete! ✅

Your Morpho Leverage Simulator now has full wallet connection functionality using RainbowKit, configured for Contract.dev's Base fork (chain ID 8452).

## What Was Fixed

### ✅ All RPC Endpoints Now Use Contract.dev
- **wagmi.ts**: Configured to use `NEXT_PUBLIC_RPC_URL`
- **oracleReader.ts**: Fixed to use Contract.dev Base fork (was using mainnet)
- **leverageContract.ts**: Already correctly configured
- **All blockchain interactions**: Consistently use the Contract.dev RPC endpoint

### ✅ Wallet Connection Added
- RainbowKit integration with multi-wallet support
- Connect button in top-right of UI
- Wallet state management with wagmi hooks
- Execute button disabled until wallet connected

### ✅ UI Improvements
- Removed optional price input (always fetches from oracle)
- Cleaner form interface
- Better wallet connection UX

## Next Steps to Run

### 1. Get Your WalletConnect Project ID (Required)

Visit: https://cloud.walletconnect.com/

1. Sign up for free account
2. Create new project
3. Copy your Project ID
4. Update `.env.local`:

```bash
NEXT_PUBLIC_WALLET_CONNECT_PROJECT_ID=your_actual_project_id_here
```

### 2. Start the Application

```bash
npm run dev
```

### 3. Open in Browser

Navigate to: http://localhost:3000

### 4. Connect Your Wallet

1. Click "Connect Wallet" button (top-right)
2. Choose your wallet (MetaMask, WalletConnect, etc.)
3. Approve the connection
4. Your wallet will connect to Base network (via Contract.dev)

### 5. Test the App

1. Select market (96.5% or 94.5% LLTV)
2. Enter collateral amount (wstETH)
3. Set leverage multiplier
4. Click "Simulate Position" - see results
5. Click "Execute Leverage Position" - prepare transaction parameters

## Configuration

### Environment Variables (.env.local)

```bash
# Contract.dev RPC (Base fork - chain ID 8452)
NEXT_PUBLIC_RPC_URL=https://rpc.contract.dev/aa90bfbbcb2a1e1bdd12e535147175c3
NEXT_PUBLIC_CHAIN_ID=8452

# WalletConnect Project ID - GET THIS FROM cloud.walletconnect.com
NEXT_PUBLIC_WALLET_CONNECT_PROJECT_ID=your_project_id_here

# Contract addresses (already configured)
NEXT_PUBLIC_LEVERAGE_HELPER_ADDRESS=0xa588aEFFa899A6dE2eFED5c6c1Eeb219f69A695A
NEXT_PUBLIC_MORPHO_BLUE=0xBBBBBbbBBb9cC5e90e3b3Af64bdAF62C37EEFFCb
...
```

## How It Works

### Contract.dev Base Fork
- Replicates Base mainnet state and contracts
- Same addresses as mainnet (e.g., Morpho, oracles)
- Safe testing environment
- No real funds required

### Wallet Flow
1. User connects wallet → RainbowKit UI
2. Wallet connects to Base (8452) → Contract.dev RPC
3. All reads/writes → Contract.dev Base fork
4. User signs transactions → Their connected wallet

## Key Features

✅ **Multi-Wallet Support**: MetaMask, WalletConnect, Coinbase Wallet, etc.
✅ **Chain Auto-Switch**: Automatically prompts to switch to Base
✅ **No Private Keys**: All operations use connected wallet
✅ **Contract.dev Integration**: All endpoints correctly configured
✅ **Real-time Oracle Prices**: Fetches from on-chain oracle
✅ **Secure**: Client-side signing only

## File Structure

```
frontend/
├── app/
│   ├── providers.tsx              # NEW - Wallet providers
│   └── layout.tsx                 # Updated - Added providers
├── components/
│   ├── WalletConnect.tsx          # NEW - Connect button
│   └── ExecuteButton.tsx          # Updated - Wallet check
├── hooks/
│   └── useLeverageContract.ts     # NEW - Contract hook
└── lib/
    ├── wagmi.ts                   # NEW - Wagmi config
    └── oracleReader.ts            # FIXED - Contract.dev RPC
```

## Troubleshooting

### Wallet won't connect?
- Make sure you added `NEXT_PUBLIC_WALLET_CONNECT_PROJECT_ID` to `.env.local`
- Restart dev server after changing `.env.local`

### Wrong network?
- Your wallet should auto-prompt to switch to Base (8452)
- Make sure Contract.dev RPC URL is correct in `.env.local`

### Oracle price fails?
- Check that `NEXT_PUBLIC_RPC_URL` is set correctly
- Oracle address: `0x2a01EB9496094dA03c4E364Def50f5aD1280AD72`

## What's Next?

To complete full execution:
1. Integrate LiFi API for swap data
2. Implement transaction signing in ExecuteButton
3. Add transaction status tracking
4. Add loading states and error handling

## Documentation

For detailed information, see: [WALLET_INTEGRATION.md](./WALLET_INTEGRATION.md)

---

**Ready to test!** 🚀

Start the app with `npm run dev` and connect your wallet!
