import { useCallback, useMemo } from 'react';
import { useAccount, useWalletClient } from 'wagmi';
import { parseEther, formatEther, maxUint256, createPublicClient, http, encodeFunctionData } from 'viem';
import {
  MORPHO_ADDRESSES, MORPHO_LEVERAGE_HELPER_ABI, MORPHO_ABI, ERC20_ABI,
  MORPHO_MARKET_ID, DEFAULT_MARKET_PARAMS, LIFI_DIAMOND,
} from '@/lib/leverageContract';
import { baseMainnet } from '@/lib/wagmi';
import { BASE_RPC_URL } from '@/lib/types';
import { getMorphoAPY } from '@/lib/morphoApi';

export function useLeverageContract() {
  const { address, isConnected } = useAccount();
  const { data: walletClient } = useWalletClient();

  const publicClient = useMemo(() => {
    return createPublicClient({
      chain: baseMainnet,
      transport: http(BASE_RPC_URL, { batch: false, retryCount: 3 }),
    });
  }, []);

  // Read user's wstETH wallet balance
  const getWstethBalance = useCallback(async () => {
    if (!publicClient || !address) return 0n;
    try {
      return await publicClient.readContract({
        address: MORPHO_ADDRESSES.WSTETH,
        abi: ERC20_ABI,
        functionName: 'balanceOf',
        args: [address],
      });
    } catch (error) {
      console.error('Error fetching wstETH balance:', error);
      return 0n;
    }
  }, [publicClient, address]);

  // Read position directly from Morpho Blue (works even before helper is deployed)
  const _readPosition = useCallback(async () => {
    if (!publicClient || !address) return { collateral: 0n, debt: 0n };
    try {
      const position = await publicClient.readContract({
        address: MORPHO_ADDRESSES.MORPHO_BLUE,
        abi: MORPHO_ABI,
        functionName: 'position',
        args: [MORPHO_MARKET_ID as `0x${string}`, address],
      });
      const borrowShares = position[1];
      const collateral = BigInt(position[2]);
      let debt = 0n;
      if (borrowShares > 0n) {
        const marketData = await publicClient.readContract({
          address: MORPHO_ADDRESSES.MORPHO_BLUE,
          abi: MORPHO_ABI,
          functionName: 'market',
          args: [MORPHO_MARKET_ID as `0x${string}`],
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
  }, [publicClient, address]);

  // Read position for ANY market by ID (parameterized version)
  const readPositionForMarket = useCallback(async (marketId: string) => {
    if (!publicClient || !address) return { collateral: 0n, debt: 0n };
    try {
      const position = await publicClient.readContract({
        address: MORPHO_ADDRESSES.MORPHO_BLUE,
        abi: MORPHO_ABI,
        functionName: 'position',
        args: [marketId as `0x${string}`, address],
      });
      const borrowShares = position[1];
      const collateral = BigInt(position[2]);
      let debt = 0n;
      if (borrowShares > 0n) {
        const marketData = await publicClient.readContract({
          address: MORPHO_ADDRESSES.MORPHO_BLUE,
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
  }, [publicClient, address]);

  // Read user's collateral balance
  const getATokenBalance = useCallback(async () => {
    const { collateral } = await _readPosition();
    return collateral;
  }, [_readPosition]);

  // Read user's debt balance
  const getDebtBalance = useCallback(async () => {
    const { debt } = await _readPosition();
    return debt;
  }, [_readPosition]);

  // Read user's full position
  const getUserPosition = useCallback(async () => {
    if (!publicClient || !address) return null;
    const { collateral, debt } = await _readPosition();
    const lltv = Number(DEFAULT_MARKET_PARAMS.lltv) / 1e18;
    const hf = debt > 0n
      ? (Number(formatEther(collateral)) * lltv) / Number(formatEther(debt))
      : 999;
    return {
      totalCollateralBase: collateral,
      totalDebtBase: debt,
      availableBorrowsBase: 0n,
      currentLiquidationThreshold: 0,
      ltv: 0,
      healthFactor: hf,
    };
  }, [publicClient, address, _readPosition]);

  // Fetch Lido staking APR
  const getLidoStakingAPR = async (): Promise<number> => {
    const response = await fetch('https://eth-api.lido.fi/v1/protocol/steth/apr/sma');
    if (!response.ok) throw new Error(`Lido API returned ${response.status}`);
    const data = await response.json();
    return Math.round(data.data.smaApr * 1000) / 1000;
  };

  // Get reserve info from Morpho market
  const getReserveInfo = useCallback(async () => {
    if (!publicClient) return null;
    try {
      const [marketParams, stakingYield, morphoAPY] = await Promise.all([
        publicClient.readContract({
          address: MORPHO_ADDRESSES.MORPHO_BLUE,
          abi: MORPHO_ABI,
          functionName: 'idToMarketParams',
          args: [MORPHO_MARKET_ID],
        }),
        getLidoStakingAPR(),
        getMorphoAPY(MORPHO_MARKET_ID),
      ]);

      const lltvRaw = marketParams.lltv;
      const lltv = Number(lltvRaw) / 1e16;
      const maxLeverage = lltv > 0 ? 100 / (100 - lltv) : 1;

      return {
        ltv: lltv,
        liquidationThreshold: lltv,
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
  }, [publicClient]);

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

  // Simulate leverage (compute flash loan amount + expected output)
  const simulateLeverage = useCallback(async (targetLeverage: number, userDeposit: number) => {
    const rate = await getExchangeRate();
    const additionalMultiplier = targetLeverage - 1;
    const flashWethAmount = userDeposit * rate * additionalMultiplier;
    const collateralFromSwap = flashWethAmount / rate;
    const totalCollateral = userDeposit + collateralFromSwap;
    const totalDebt = flashWethAmount;

    const lltv = Number(DEFAULT_MARKET_PARAMS.lltv) / 1e18;
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

  // Get max safe leverage (from LLTV)
  const getMaxSafeLeverage = useCallback(async () => {
    const lltv = Number(DEFAULT_MARKET_PARAMS.lltv) / 1e18;
    return 1 / (1 - lltv); // ~18.18 for 94.5% LLTV
  }, []);

  // Execute leverage via LiFi swap
  const executeLeverage = async (targetLeverage: number, userDeposit: number, slippageBps: number = 50) => {
    if (!walletClient || !address || !publicClient) throw new Error('Wallet not connected');

    const depositWei = parseEther(userDeposit.toString());
    const rate = await getExchangeRate();
    const additionalMultiplier = targetLeverage - 1;
    const flashLoanAmount = parseEther((userDeposit * rate * additionalMultiplier).toFixed(18));

    // Pre-flight: check balance
    const balance = await publicClient.readContract({
      address: MORPHO_ADDRESSES.WSTETH,
      abi: ERC20_ABI,
      functionName: 'balanceOf',
      args: [address],
    });
    if (balance < depositWei) {
      throw new Error(`Insufficient wstETH balance. You have ${formatEther(balance)} wstETH but need ${formatEther(depositWei)} wstETH`);
    }

    // Get LiFi swap quote: WETH → wstETH
    const slippageDecimal = slippageBps / 10000;
    const lifiQuoteResponse = await fetch(
      `https://li.quest/v1/quote?` + new URLSearchParams({
        fromChain: '8453',
        toChain: '8453',
        fromToken: MORPHO_ADDRESSES.WETH,
        toToken: MORPHO_ADDRESSES.WSTETH,
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

    console.log('LiFi route:', lifiQuote.tool, '| min output:', formatEther(minCollateralFromSwap), 'wstETH');

    // Step 1: Approve wstETH to helper
    const allowance = await publicClient.readContract({
      address: MORPHO_ADDRESSES.WSTETH,
      abi: ERC20_ABI,
      functionName: 'allowance',
      args: [address, MORPHO_ADDRESSES.LEVERAGE_HELPER],
    });
    if (allowance < depositWei) {
      const hash = await walletClient.writeContract({
        address: MORPHO_ADDRESSES.WSTETH,
        abi: ERC20_ABI,
        functionName: 'approve',
        args: [MORPHO_ADDRESSES.LEVERAGE_HELPER, maxUint256],
        gas: 100000n,
      });
      await publicClient.waitForTransactionReceipt({ hash });
    }

    // Step 2: Morpho authorization — check directly via Morpho.isAuthorized
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

    // Step 3: Execute leverage with LiFi swap data
    const hash = await walletClient.writeContract({
      address: MORPHO_ADDRESSES.LEVERAGE_HELPER,
      abi: MORPHO_LEVERAGE_HELPER_ABI,
      functionName: 'executeLeverage',
      args: [
        DEFAULT_MARKET_PARAMS,
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

  // Execute deleverage via LiFi swap
  const executeDeleverage = async (slippageBps: number = 50) => {
    if (!walletClient || !address || !publicClient) throw new Error('Wallet not connected');

    // Read position from Morpho
    const position = await publicClient.readContract({
      address: MORPHO_ADDRESSES.MORPHO_BLUE,
      abi: MORPHO_ABI,
      functionName: 'position',
      args: [MORPHO_MARKET_ID as `0x${string}`, address],
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
      args: [MORPHO_MARKET_ID as `0x${string}`],
    });
    const totalBorrowAssets = marketData[2];
    const totalBorrowShares = marketData[3];
    const debtAmount = totalBorrowShares > 0n
      ? (BigInt(borrowShares) * BigInt(totalBorrowAssets) + BigInt(totalBorrowShares) - 1n) / BigInt(totalBorrowShares)
      : 0n;

    // Get LiFi swap quote: wstETH → WETH (swap collateral to repay debt)
    const slippageDecimal = slippageBps / 10000;
    const lifiQuoteResponse = await fetch(
      `https://li.quest/v1/quote?` + new URLSearchParams({
        fromChain: '8453',
        toChain: '8453',
        fromToken: MORPHO_ADDRESSES.WSTETH,
        toToken: MORPHO_ADDRESSES.WETH,
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

    console.log('LiFi deleverage route:', lifiQuote.tool, '| min output:', formatEther(minLoanTokenFromSwap), 'WETH');

    // Ensure Morpho authorization — check directly via Morpho.isAuthorized
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

    // Execute deleverage with LiFi swap data
    const hash = await walletClient.writeContract({
      address: MORPHO_ADDRESSES.LEVERAGE_HELPER,
      abi: MORPHO_LEVERAGE_HELPER_ABI,
      functionName: 'executeDeleverage',
      args: [
        DEFAULT_MARKET_PARAMS,
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
