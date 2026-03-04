import { useCapabilities } from 'wagmi';
import { contractDevBase } from '@/lib/wagmi';

/**
 * Detects whether the connected wallet supports EIP-5792 atomic batching.
 * MetaMask smart accounts (EIP-7702) and Coinbase Smart Wallet both report
 * this capability, enabling single-click bundled transactions.
 */
export function useBatchingSupport() {
  const { data: capabilities, isLoading } = useCapabilities();

  const chainId = contractDevBase.id;
  const chainCaps = capabilities?.[chainId];
  const supportsBatching = !!chainCaps?.atomicBatch?.supported;

  return { supportsBatching, isLoading };
}
