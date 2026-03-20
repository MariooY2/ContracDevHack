import { useCallback, useMemo, useRef } from 'react';
import { useAccount, useWalletClient } from 'wagmi';
import { parseEther, formatEther, maxUint256, createPublicClient, http } from 'viem';
import type { Address, PublicClient } from 'viem';
import { mainnet, base, arbitrum, polygon } from 'viem/chains';
import {
  MORPHO_ADDRESSES, MORPHO_LEVERAGE_HELPER_ABI, MORPHO_ABI, ERC20_ABI,
  MORPHO_MARKET_ID, DEFAULT_MARKET_PARAMS, LIFI_DIAMOND,
  MORPHO_BLUE_BY_CHAIN,
} from '@/lib/leverageContract';
import type { MarketParams, MarketConfig } from '@/lib/leverageContract';
import { baseMainnet } from '@/lib/wagmi';
import { BASE_RPC_URL } from '@/lib/types';
import { getMorphoAPY } from '@/lib/morphoApi';

// Chain config for multi-chain public clients (Alchemy where available, public fallback)
const CHAIN_RPC: Record<number, { chain: any; rpc: string }> = {
  1:     { chain: mainnet,  rpc: process.env.NEXT_PUBLIC_ETHEREUM_RPC_URL || 'https://eth.llamarpc.com' },
  8453:  { chain: base,     rpc: BASE_RPC_URL || 'https://mainnet.base.org' },
  42161: { chain: arbitrum, rpc: process.env.NEXT_PUBLIC_ARBITRUM_RPC_URL || 'https://arb1.arbitrum.io/rpc' },
  137:   { chain: polygon,  rpc: process.env.NEXT_PUBLIC_POLYGON_RPC_URL || 'https://polygon-rpc.com' },
};

export function useLeverageContract() {
  const { address, isConnected } = useAccount();
  const { data: walletClient } = useWalletClient();

  // Cache public clients per chain
  const clientCache = useRef<Map<number, PublicClient>>(new Map());

  const getClientForChain = useCallback((chainId: number): PublicClient => {
    const cached = clientCache.current.get(chainId);
    if (cached) return cached;
    const config = CHAIN_RPC[chainId];
    if (!config) return getClientForChain(8453); // fallback to Base
    const client = createPublicClient({
      chain: config.chain,
      transport: http(config.rpc, { batch: false, retryCount: 3 }),
    }) as PublicClient;
    clientCache.current.set(chainId, client);
    return client;
  }, []);

  // Default Base client (backwards compat)
  const publicClient = useMemo(() => getClientForChain(8453), [getClientForChain]);

  // Read user's collateral token balance (defaults to wstETH on Base)
  const getCollateralBalance = useCallback(async (collateralToken?: Address, chainId?: number) => {
    if (!address) return 0n;
    const client = chainId ? getClientForChain(chainId) : publicClient;
    const token = collateralToken || MORPHO_ADDRESSES.WSTETH;
    try {
      return await client.readContract({
        address: token,
        abi: ERC20_ABI,
        functionName: 'balanceOf',
        args: [address],
      });
    } catch (error) {
      console.error('Error fetching collateral balance:', error);
      return 0n;
    }
  }, [publicClient, address, getClientForChain]);

  // Backwards-compat alias
  const getWstethBalance = useCallback(() => getCollateralBalance(), [getCollateralBalance]);

  // Read position for ANY market by ID on ANY chain
  const readPositionForMarket = useCallback(async (marketId: string, chainId?: number) => {
    if (!address) return { collateral: 0n, debt: 0n };
    const client = chainId ? getClientForChain(chainId) : publicClient;
    const morpho = (chainId ? MORPHO_BLUE_BY_CHAIN[chainId] : null) || MORPHO_ADDRESSES.MORPHO_BLUE;
    try {
      const position = await client.readContract({
        address: morpho,
        abi: MORPHO_ABI,
        functionName: 'position',
        args: [marketId as `0x${string}`, address],
      });
      const borrowShares = position[1];
      const collateral = BigInt(position[2]);
      let debt = 0n;
      if (borrowShares > 0n) {
        const marketData = await client.readContract({
          address: morpho,
          abi: MORPHO_ABI,
          functionName: 'market',
          args: [marketId as `0x${string}`],
        });
        const totalBorrowAssets = BigInt(marketData[2]);
        const totalBorrowShares = BigInt(marketData[3]);
        if (totalBorrowShares > 0n) {
          debt = (BigInt(borrowShares) * totalBorrowAssets) / totalBorrowShares;
        }
      }
      return { collateral, debt };
    } catch {
      return { collateral: 0n, debt: 0n };
    }
  }, [publicClient, address, getClientForChain]);

  // Read position from default market (backwards compat)
  const _readPosition = useCallback(async () => {
    return readPositionForMarket(MORPHO_MARKET_ID);
  }, [readPositionForMarket]);

  const getATokenBalance = useCallback(async () => {
    const { collateral } = await _readPosition();
    return collateral;
  }, [_readPosition]);

  const getDebtBalance = useCallback(async () => {
    const { debt } = await _readPosition();
    return debt;
  }, [_readPosition]);

  // Read user's full position — accepts optional marketId + lltv
  const getUserPosition = useCallback(async (marketId?: string, lltv?: number) => {
    if (!publicClient || !address) return null;
    const id = marketId || MORPHO_MARKET_ID;
    const effectiveLltv = lltv ?? Number(DEFAULT_MARKET_PARAMS.lltv) / 1e18;
    const { collateral, debt } = await readPositionForMarket(id);
    const hf = debt > 0n
      ? (Number(formatEther(collateral)) * effectiveLltv) / Number(formatEther(debt))
      : 999;
    return {
      totalCollateralBase: collateral,
      totalDebtBase: debt,
      availableBorrowsBase: 0n,
      currentLiquidationThreshold: 0,
      ltv: 0,
      healthFactor: hf,
    };
  }, [publicClient, address, readPositionForMarket]);

  // Fetch Lido staking APR
  const getLidoStakingAPR = async (): Promise<number> => {
    const response = await fetch('https://eth-api.lido.fi/v1/protocol/steth/apr/sma');
    if (!response.ok) throw new Error(`Lido API returned ${response.status}`);
    const data = await response.json();
    return Math.round(data.data.smaApr * 1000) / 1000;
  };

  // Get reserve info — accepts optional marketId
  const getReserveInfo = useCallback(async (marketId?: string, chainId?: number) => {
    const client = chainId ? getClientForChain(chainId) : publicClient;
    const morpho = (chainId ? MORPHO_BLUE_BY_CHAIN[chainId] : null) || MORPHO_ADDRESSES.MORPHO_BLUE;
    const id = marketId || MORPHO_MARKET_ID;
    try {
      const [marketParams, stakingYield, morphoAPY] = await Promise.all([
        client.readContract({
          address: morpho,
          abi: MORPHO_ABI,
          functionName: 'idToMarketParams',
          args: [id as `0x${string}`],
        }),
        getLidoStakingAPR(),
        getMorphoAPY(id),
      ]);

      const lltvRaw = marketParams.lltv;
      const lltvPct = Number(lltvRaw) / 1e16;
      const maxLeverage = lltvPct > 0 ? 100 / (100 - lltvPct) : 1;

      return {
        ltv: lltvPct,
        liquidationThreshold: lltvPct,
        maxLeverage,
        supplyAPY: morphoAPY.supplyAPY,
        borrowAPY: morphoAPY.borrowAPY,
        stakingYield,
      };
    } catch (error) {
      console.error('Error fetching Morpho market data:', error);
      const stakingYield = await getLidoStakingAPR();
      return {
        ltv: 94.5,
        liquidationThreshold: 94.5,
        maxLeverage: 18.18,
        supplyAPY: 5.66,
        borrowAPY: 6.01,
        stakingYield,
      };
    }
  }, [publicClient, getClientForChain]);

  // Get wstETH/WETH exchange rate from wstETH.stEthPerToken()
  const getExchangeRate = useCallback(async () => {
    if (!publicClient) return 1.228; // fallback
    try {
      const rate = await publicClient.readContract({
        address: MORPHO_ADDRESSES.WSTETH,
        abi: [{
          inputs: [],
          name: 'stEthPerToken',
          outputs: [{ type: 'uint256' }],
          stateMutability: 'view',
          type: 'function',
        }] as const,
        functionName: 'stEthPerToken',
      });
      return Number(rate) / 1e18;
    } catch {
      return 1.228; // fallback
    }
  }, [publicClient]);

  // Get exchange rates (compatibility with existing UI)
  const getMorphoExchangeRates = useCallback(async () => {
    const rate = await getExchangeRate();
    return {
      poolWstethPerWeth: 1 / rate,
      poolWethPerWsteth: rate,
      oracleWethPerWsteth: rate,
      premiumPct: 0,
    };
  }, [getExchangeRate]);

  // Simulate leverage — accepts optional market params for LLTV
  const simulateLeverage = useCallback(async (
    targetLeverage: number,
    userDeposit: number,
    marketParams?: MarketParams,
  ) => {
    const rate = await getExchangeRate();
    const additionalMultiplier = targetLeverage - 1;
    const flashWethAmount = userDeposit * rate * additionalMultiplier;
    const collateralFromSwap = flashWethAmount / rate;
    const totalCollateral = userDeposit + collateralFromSwap;
    const totalDebt = flashWethAmount;

    const lltv = marketParams
      ? Number(marketParams.lltv) / 1e18
      : Number(DEFAULT_MARKET_PARAMS.lltv) / 1e18;
    const hf = totalDebt > 0
      ? (totalCollateral * rate * lltv) / totalDebt
      : 999;

    return {
      flashWethAmount: parseEther(flashWethAmount.toFixed(18)),
      totalCollateral: parseEther(totalCollateral.toFixed(18)),
      totalDebt: parseEther(totalDebt.toFixed(18)),
      estimatedHealthFactor: hf,
    };
  }, [getExchangeRate]);

  // Get max safe leverage — accepts optional market params for LLTV
  const getMaxSafeLeverage = useCallback(async (marketParams?: MarketParams) => {
    const lltv = marketParams
      ? Number(marketParams.lltv) / 1e18
      : Number(DEFAULT_MARKET_PARAMS.lltv) / 1e18;
    return 1 / (1 - lltv);
  }, []);

  // Execute leverage via LiFi swap — accepts optional MarketConfig
  const executeLeverage = async (
    targetLeverage: number,
    userDeposit: number,
    slippageBps: number = 50,
    config?: MarketConfig,
  ) => {
    if (!walletClient || !address || !publicClient) throw new Error('Wallet not connected');

    const mp = config?.marketParams || DEFAULT_MARKET_PARAMS;
    const collateralToken = mp.collateralToken;
    const loanToken = mp.loanToken;

    const depositWei = parseEther(userDeposit.toString());
    const rate = await getExchangeRate();
    const additionalMultiplier = targetLeverage - 1;
    const flashLoanAmount = parseEther((userDeposit * rate * additionalMultiplier).toFixed(18));

    // Pre-flight: check balance
    const balance = await publicClient.readContract({
      address: collateralToken,
      abi: ERC20_ABI,
      functionName: 'balanceOf',
      args: [address],
    });
    if (balance < depositWei) {
      throw new Error(`Insufficient collateral balance. You have ${formatEther(balance)} but need ${formatEther(depositWei)}`);
    }

    // Get LiFi swap quote: loanToken → collateralToken
    const slippageDecimal = slippageBps / 10000;
    const lifiQuoteResponse = await fetch(
      `https://li.quest/v1/quote?` + new URLSearchParams({
        fromChain: '8453',
        toChain: '8453',
        fromToken: loanToken,
        toToken: collateralToken,
        fromAmount: flashLoanAmount.toString(),
        fromAddress: MORPHO_ADDRESSES.LEVERAGE_HELPER === '0x0000000000000000000000000000000000000000' ? address : MORPHO_ADDRESSES.LEVERAGE_HELPER,
        slippage: slippageDecimal.toString(),
      })
    );

    if (!lifiQuoteResponse.ok) {
      const err = await lifiQuoteResponse.text();
      throw new Error(`LiFi quote failed: ${err}`);
    }

    const lifiQuote = await lifiQuoteResponse.json();
    const swapTarget = lifiQuote.transactionRequest.to as `0x${string}`;
    const swapCalldata = lifiQuote.transactionRequest.data as `0x${string}`;
    const minCollateralFromSwap = BigInt(lifiQuote.estimate.toAmountMin);

    console.log('LiFi route:', lifiQuote.tool, '| min output:', formatEther(minCollateralFromSwap), 'collateral');

    // Step 1: Approve collateral to helper
    const allowance = await publicClient.readContract({
      address: collateralToken,
      abi: ERC20_ABI,
      functionName: 'allowance',
      args: [address, MORPHO_ADDRESSES.LEVERAGE_HELPER],
    });
    if (allowance < depositWei) {
      const hash = await walletClient.writeContract({
        address: collateralToken,
        abi: ERC20_ABI,
        functionName: 'approve',
        args: [MORPHO_ADDRESSES.LEVERAGE_HELPER, maxUint256],
        gas: 100000n,
      });
      await publicClient.waitForTransactionReceipt({ hash });
    }

    // Step 2: Morpho authorization
    const isAuthorized = await publicClient.readContract({
      address: MORPHO_ADDRESSES.MORPHO_BLUE,
      abi: MORPHO_ABI,
      functionName: 'isAuthorized',
      args: [address, MORPHO_ADDRESSES.LEVERAGE_HELPER],
    });
    if (!isAuthorized) {
      const hash = await walletClient.writeContract({
        address: MORPHO_ADDRESSES.MORPHO_BLUE,
        abi: MORPHO_ABI,
        functionName: 'setAuthorization',
        args: [MORPHO_ADDRESSES.LEVERAGE_HELPER, true],
        gas: 100000n,
      });
      await publicClient.waitForTransactionReceipt({ hash });
    }

    // Step 3: Execute leverage with market params + LiFi swap data
    const hash = await walletClient.writeContract({
      address: MORPHO_ADDRESSES.LEVERAGE_HELPER,
      abi: MORPHO_LEVERAGE_HELPER_ABI,
      functionName: 'executeLeverage',
      args: [
        mp,
        depositWei,
        flashLoanAmount,
        minCollateralFromSwap,
        swapTarget,
        swapCalldata,
      ],
      gas: 3000000n,
    });
    return await publicClient.waitForTransactionReceipt({ hash, timeout: 60000 });
  };

  // Execute deleverage via LiFi swap — accepts optional MarketConfig
  const executeDeleverage = async (slippageBps: number = 50, config?: MarketConfig) => {
    if (!walletClient || !address || !publicClient) throw new Error('Wallet not connected');

    const mp = config?.marketParams || DEFAULT_MARKET_PARAMS;
    const marketId = config?.marketId || MORPHO_MARKET_ID;
    const collateralToken = mp.collateralToken;
    const loanToken = mp.loanToken;

    // Read position from Morpho
    const position = await publicClient.readContract({
      address: MORPHO_ADDRESSES.MORPHO_BLUE,
      abi: MORPHO_ABI,
      functionName: 'position',
      args: [marketId as `0x${string}`, address],
    });
    const borrowShares = position[1];
    const collateral = position[2];

    if (borrowShares === 0n && collateral === 0n) {
      throw new Error('No position to close');
    }

    // Calculate debt amount
    const marketData = await publicClient.readContract({
      address: MORPHO_ADDRESSES.MORPHO_BLUE,
      abi: MORPHO_ABI,
      functionName: 'market',
      args: [marketId as `0x${string}`],
    });
    const totalBorrowAssets = marketData[2];
    const totalBorrowShares = marketData[3];
    const debtAmount = totalBorrowShares > 0n
      ? (BigInt(borrowShares) * BigInt(totalBorrowAssets) + BigInt(totalBorrowShares) - 1n) / BigInt(totalBorrowShares)
      : 0n;

    // Get LiFi swap quote: collateralToken → loanToken
    const slippageDecimal = slippageBps / 10000;
    const lifiQuoteResponse = await fetch(
      `https://li.quest/v1/quote?` + new URLSearchParams({
        fromChain: '8453',
        toChain: '8453',
        fromToken: collateralToken,
        toToken: loanToken,
        fromAmount: collateral.toString(),
        fromAddress: MORPHO_ADDRESSES.LEVERAGE_HELPER === '0x0000000000000000000000000000000000000000' ? address : MORPHO_ADDRESSES.LEVERAGE_HELPER,
        slippage: slippageDecimal.toString(),
      })
    );

    if (!lifiQuoteResponse.ok) {
      const err = await lifiQuoteResponse.text();
      throw new Error(`LiFi quote failed: ${err}`);
    }

    const lifiQuote = await lifiQuoteResponse.json();
    const swapTarget = lifiQuote.transactionRequest.to as `0x${string}`;
    const swapCalldata = lifiQuote.transactionRequest.data as `0x${string}`;
    const minLoanTokenFromSwap = BigInt(lifiQuote.estimate.toAmountMin);

    console.log('LiFi deleverage route:', lifiQuote.tool, '| min output:', formatEther(minLoanTokenFromSwap), 'loan token');

    // Ensure Morpho authorization
    const isAuthorized = await publicClient.readContract({
      address: MORPHO_ADDRESSES.MORPHO_BLUE,
      abi: MORPHO_ABI,
      functionName: 'isAuthorized',
      args: [address, MORPHO_ADDRESSES.LEVERAGE_HELPER],
    });
    if (!isAuthorized) {
      const authHash = await walletClient.writeContract({
        address: MORPHO_ADDRESSES.MORPHO_BLUE,
        abi: MORPHO_ABI,
        functionName: 'setAuthorization',
        args: [MORPHO_ADDRESSES.LEVERAGE_HELPER, true],
        gas: 100000n,
      });
      await publicClient.waitForTransactionReceipt({ hash: authHash });
    }

    // Execute deleverage with market params + LiFi swap data
    const hash = await walletClient.writeContract({
      address: MORPHO_ADDRESSES.LEVERAGE_HELPER,
      abi: MORPHO_LEVERAGE_HELPER_ABI,
      functionName: 'executeDeleverage',
      args: [
        mp,
        minLoanTokenFromSwap,
        swapTarget,
        swapCalldata,
      ],
      gas: 3000000n,
    });
    return await publicClient.waitForTransactionReceipt({ hash, timeout: 60000 });
  };

  return {
    address,
    isConnected,
    publicClient,
    getCollateralBalance,
    getWstethBalance,
    getATokenBalance,
    getDebtBalance,
    getUserPosition,
    readPositionForMarket,
    getReserveInfo,
    getExchangeRate,
    getMorphoExchangeRates,
    simulateLeverage,
    getMaxSafeLeverage,
    executeLeverage,
    executeDeleverage,
  };
}
