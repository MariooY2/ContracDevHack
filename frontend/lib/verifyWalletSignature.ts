import { verifyMessage } from 'viem';

const MAX_AGE_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Verify a wallet signature server-side.
 * Checks that the signer matches the claimed address and the timestamp is recent.
 */
export async function verifyWalletSignature(
  message: string,
  signature: string,
  expectedAddress: string,
  timestamp: number,
): Promise<{ valid: boolean; error?: string }> {
  // Check timestamp freshness
  const age = Date.now() - timestamp;
  if (age > MAX_AGE_MS || age < -60_000) {
    return { valid: false, error: 'Signature expired or invalid timestamp' };
  }

  try {
    const valid = await verifyMessage({
      address: expectedAddress as `0x${string}`,
      message,
      signature: signature as `0x${string}`,
    });

    if (!valid) {
      return { valid: false, error: 'Invalid signature' };
    }

    return { valid: true };
  } catch {
    return { valid: false, error: 'Signature verification failed' };
  }
}
