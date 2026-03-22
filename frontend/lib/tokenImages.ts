// Maps token symbols to local images in /public folder.
// Falls back to the LiFi logoURI or a generated placeholder.

const LOCAL_TOKEN_IMAGES: Record<string, string> = {
  wsteth: '/wsteth.png',
  weth: '/weth.png',
  cbeth: '/cbeth.png',
  weeth: '/weeth.png',
  reth: '/reth.png',
  ezeth: '/ezeth.png',
  oseth: '/oseth.png',
  pufeth: '/pufeth.png',
  wrseth: '/wrseth.png',
  wsuperoethb: '/wsuperoethb.png',
  yoeth: '/yoeth.png',
};

/**
 * Get the best image URL for a token.
 * Prefers local /public images, falls back to remote logoURI.
 */
export function getTokenImageUrl(symbol: string, logoURI?: string | null): string | undefined {
  const local = LOCAL_TOKEN_IMAGES[symbol.toLowerCase()];
  if (local) return local;
  if (logoURI) return logoURI;
  return undefined;
}
