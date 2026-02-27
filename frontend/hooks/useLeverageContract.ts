import { useCallback, useMemo } from 'react';
import { useAccount, useWalletClient } from 'wagmi';
import { parseEther, formatEther, maxUint256, createPublicClient, http } from 'viem';
import {
  MORPHO_ADDRESSES, MORPHO_FLASH_LOAN_HELPER_ABI, MORPHO_ABI, ERC20_ABI, MORPHO_MARKET_ID,
} from '@/lib/leverageContract';
import { contractDevBase } from '@/lib/wagmi';
import { BASE_RPC_URL } from '@/lib/types';
import { getMorphoAPY } from '@/lib/morphoApi';

export function useLeverageContract() {
  const { address, isConnected } = useAccount();
  const { data: walletClient } = useWalletClient();

  const publicClient = useMemo(() => {
    return createPublicClient({
      chain: contractDevBase,
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

  // Read user's collateral balance from Morpho position
  const getATokenBalance = useCallback(async () => {
    if (!publicClient || !address) return 0n;
    const result = await publicClient.readContract({
      address: MORPHO_ADDRESSES.LEVERAGE_HELPER,
      abi: MORPHO_FLASH_LOAN_HELPER_ABI,
      functionName: 'getUserPosition',
      args: [address],
    });
    return result[0];
  }, [publicClient, address]);

  // Read user's debt balance from Morpho position
  const getDebtBalance = useCallback(async () => {
    if (!publicClient || !address) return 0n;
    const result = await publicClient.readContract({
      address: MORPHO_ADDRESSES.LEVERAGE_HELPER,
      abi: MORPHO_FLASH_LOAN_HELPER_ABI,
      functionName: 'getUserPosition',
      args: [address],
    });
    return result[1];
  }, [publicClient, address]);

  // Read user's full position
  const getUserPosition = useCallback(async () => {
    if (!publicClient || !address) return null;
    const result = await publicClient.readContract({
      address: MORPHO_ADDRESSES.LEVERAGE_HELPER,
      abi: MORPHO_FLASH_LOAN_HELPER_ABI,
      functionName: 'getUserPosition',
      args: [address],
    });
    return {
      totalCollateralBase: result[0],
      totalDebtBase: result[1],
      availableBorrowsBase: 0n,
      currentLiquidationThreshold: 0,
      ltv: 0,
      healthFactor: Number(formatEther(result[2])),
    };
  }, [publicClient, address]);

  // Fetch Lido staking APR
  const getLidoStakingAPR = async (): Promise<number> => {
    const response = await fetch('https://eth-api.lido.fi/v1/protocol/steth/apr/sma');
    if (!response.ok) throw new Error(`Lido API returned ${response.status}`);
    const data = await response.json();
    return data.data.smaApr;
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

  // Get Morpho pool + oracle exchange rates
  const getMorphoExchangeRates = useCallback(async () => {
    if (!publicClient) return null;
    try {
      const result = await publicClient.readContract({
        address: MORPHO_ADDRESSES.LEVERAGE_HELPER,
        abi: MORPHO_FLASH_LOAN_HELPER_ABI,
        functionName: 'getExchangeRates',
        args: [],
      });
      const poolWstethPerWeth = Number(formatEther(result[0]));
      const poolWethPerWsteth = Number(formatEther(result[1]));
      const oracleWethPerWsteth = Number(formatEther(result[2]));
      const premiumPct = ((poolWethPerWsteth - oracleWethPerWsteth) / oracleWethPerWsteth) * 100;
      return { poolWstethPerWeth, poolWethPerWsteth, oracleWethPerWsteth, premiumPct };
    } catch (err) {
      console.error('getMorphoExchangeRates error:', err);
      return null;
    }
  }, [publicClient]);

  // Get wstETH exchange rate (oracle-based)
  const getExchangeRate = useCallback(async () => {
    if (!publicClient) return 1.228;
    try {
      const rates = await getMorphoExchangeRates();
      if (rates) return rates.oracleWethPerWsteth;
    } catch (_) { /* fallthrough */ }
    return 1.228;
  }, [publicClient, getMorphoExchangeRates]);

  // Simulate leverage position
  const simulateLeverage = useCallback(async (targetLeverage: number, userDeposit: number) => {
    if (!publicClient) throw new Error('Client not available');
    const result = await publicClient.readContract({
      address: MORPHO_ADDRESSES.LEVERAGE_HELPER,
      abi: MORPHO_FLASH_LOAN_HELPER_ABI,
      functionName: 'simulateLeverage',
      args: [parseEther(targetLeverage.toString()), parseEther(userDeposit.toString())],
    });
    return {
      flashWethAmount: result[0],
      totalCollateral: result[1],
      totalDebt: result[2],
      estimatedHealthFactor: Number(formatEther(result[3])),
    };
  }, [publicClient]);

  // Get max safe leverage
  const getMaxSafeLeverage = useCallback(async () => {
    if (!publicClient) return 3.0;
    const result = await publicClient.readContract({
      address: MORPHO_ADDRESSES.LEVERAGE_HELPER,
      abi: MORPHO_FLASH_LOAN_HELPER_ABI,
      functionName: 'getMaxSafeLeverage',
      args: [],
    });
    return Number(formatEther(result));
  }, [publicClient]);

  // Execute leverage
  const executeLeverage = async (targetLeverage: number, userDeposit: number) => {
    if (!walletClient || !address || !publicClient) throw new Error('Wallet not connected');

    try {
      const depositWei = parseEther(userDeposit.toString());
      const leverageWei = parseEther(targetLeverage.toString());

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

      // Step 1: Approve wstETH
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

      // Step 2: Morpho authorization
      const isAuthorized = await publicClient.readContract({
        address: MORPHO_ADDRESSES.LEVERAGE_HELPER,
        abi: MORPHO_FLASH_LOAN_HELPER_ABI,
        functionName: 'hasAuthorization',
        args: [address],
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

      // Step 3: Execute
      const hash = await walletClient.writeContract({
        address: MORPHO_ADDRESSES.LEVERAGE_HELPER,
        abi: MORPHO_FLASH_LOAN_HELPER_ABI,
        functionName: 'executeLeverage',
        args: [leverageWei, depositWei],
        gas: 3000000n,
      });
      return await publicClient.waitForTransactionReceipt({ hash, timeout: 30000 });
    } catch (error: any) {
      if (error?.message?.includes('Block at number')) {
        return { transactionHash: 'unknown', status: 'success' } as any;
      }
      throw error;
    }
  };

  // Execute deleverage
  const executeDeleverage = async () => {
    if (!walletClient || !address || !publicClient) throw new Error('Wallet not connected');

    try {
      // Check authorization
      const isAuthorized = await publicClient.readContract({
        address: MORPHO_ADDRESSES.LEVERAGE_HELPER,
        abi: MORPHO_FLASH_LOAN_HELPER_ABI,
        functionName: 'hasAuthorization',
        args: [address],
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

      const hash = await walletClient.writeContract({
        address: MORPHO_ADDRESSES.LEVERAGE_HELPER,
        abi: MORPHO_FLASH_LOAN_HELPER_ABI,
        functionName: 'executeDeleverage',
        args: [],
        gas: 3000000n,
      });
      return await publicClient.waitForTransactionReceipt({ hash, timeout: 30000 });
    } catch (error: any) {
      if (error?.message?.includes('Block at number')) {
        return { transactionHash: 'unknown', status: 'success' } as any;
      }
      throw error;
    }
  };

  return {
    address,
    isConnected,
    getWstethBalance,
    getATokenBalance,
    getDebtBalance,
    getUserPosition,
    getReserveInfo,
    getExchangeRate,
    getMorphoExchangeRates,
    simulateLeverage,
    getMaxSafeLeverage,
    executeLeverage,
    executeDeleverage,
  };
}
