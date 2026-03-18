// Morpho Blue on Base — single supported protocol
export const MORPHO_CONFIG = {
  name: 'Morpho Blue',
  chainId: 8453,
  chainName: 'Base',
  helperAddress: '0x0000000000000000000000000000000000000000', // Deploy MorphoLeverageHelper and set address here
  theme: {
    primary: '#00D395',
    primaryHover: '#00C085',
    gradient: 'linear-gradient(135deg, #00D395 0%, #00A375 100%)',
    glow: '0 0 20px rgba(0, 211, 149, 0.3)',
  },
} as const;
