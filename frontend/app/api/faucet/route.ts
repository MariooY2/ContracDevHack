import { NextResponse } from 'next/server';
import { createWalletClient, createPublicClient, http, parseEther, formatEther, encodeFunctionData } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { defineChain } from 'viem';

const RPC_URL = process.env.NEXT_PUBLIC_BASE_RPC_URL!;
const FAUCET_KEY = process.env.FAUCET_PRIVATE_KEY!;
const WSTETH = '0xc1CBa3fCea344f92D9239c08C0568f6F2F0ee452' as const;

const ETH_AMOUNT = parseEther('1');      // 1 ETH per request
const WSTETH_AMOUNT = parseEther('10');   // 10 wstETH per request
const MAX_WSTETH = parseEther('10');      // 10 wstETH max per account

const chain = defineChain({
  id: 18133,
  name: 'Base (Contract.dev)',
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  rpcUrls: { default: { http: [RPC_URL] } },
});

const ERC20_ABI = [
  { inputs: [{ name: 'account', type: 'address' }], name: 'balanceOf', outputs: [{ name: '', type: 'uint256' }], stateMutability: 'view', type: 'function' },
  { inputs: [{ name: 'to', type: 'address' }, { name: 'amount', type: 'uint256' }], name: 'transfer', outputs: [{ name: '', type: 'bool' }], stateMutability: 'nonpayable', type: 'function' },
] as const;

export async function POST(request: Request) {
  try {
    if (!FAUCET_KEY) {
      return NextResponse.json({ error: 'Faucet not configured' }, { status: 500 });
    }

    const { address } = await request.json();
    if (!address || !/^0x[a-fA-F0-9]{40}$/.test(address)) {
      return NextResponse.json({ error: 'Valid address required' }, { status: 400 });
    }

    const account = privateKeyToAccount(`0x${FAUCET_KEY.replace('0x', '')}`);

    const publicClient = createPublicClient({ chain, transport: http(RPC_URL) });
    const walletClient = createWalletClient({ account, chain, transport: http(RPC_URL) });

    // Check recipient's current wstETH balance
    const currentBalance = await publicClient.readContract({
      address: WSTETH,
      abi: ERC20_ABI,
      functionName: 'balanceOf',
      args: [address as `0x${string}`],
    });

    if (currentBalance >= MAX_WSTETH) {
      return NextResponse.json({
        error: `Account already has ${formatEther(currentBalance)} wstETH (max ${formatEther(MAX_WSTETH)})`,
      }, { status: 400 });
    }

    // Check faucet wstETH balance
    const faucetWstethBal = await publicClient.readContract({
      address: WSTETH,
      abi: ERC20_ABI,
      functionName: 'balanceOf',
      args: [account.address],
    });

    if (faucetWstethBal < WSTETH_AMOUNT) {
      return NextResponse.json({
        error: `Faucet low on wstETH (${formatEther(faucetWstethBal)} remaining)`,
      }, { status: 500 });
    }

    // Send 1 ETH
    const ethTxHash = await walletClient.sendTransaction({
      to: address as `0x${string}`,
      value: ETH_AMOUNT,
    });

    // Send 10 wstETH
    const wstethTxHash = await walletClient.writeContract({
      address: WSTETH,
      abi: ERC20_ABI,
      functionName: 'transfer',
      args: [address as `0x${string}`, WSTETH_AMOUNT],
    });

    return NextResponse.json({
      success: true,
      ethTx: ethTxHash,
      wstethTx: wstethTxHash,
      message: 'Funded 1 ETH + 10 wstETH',
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
