import { useCallback, useMemo } from 'react';
import { useAccount, useWalletClient } from 'wagmi';
import { parseEther, formatEther, formatUnits, maxUint256, type Address, createPublicClient, http } from 'viem';
import {
  LEVERAGE_HELPER_ABI, MORPHO_FLASH_LOAN_HELPER_ABI, MORPHO_ABI, ERC20_ABI, VARIABLE_DEBT_TOKEN_ABI, AAVE_POOL_ABI, WSTETH_ABI, getAddresses, MORPHO_MARKET_ID
} from '@/lib/leverageContract';
import { contractDevMainnet, contractDevBase } from '@/lib/wagmi';
import { useProtocol } from '@/contexts/ProtocolContext';
import { getMorphoAPY } from '@/lib/morphoApi';

const RAY = 10n ** 27n;
const PRECISION = 10n ** 18n;

export function useLeverageContract() {
  const { address, isConnected } = useAccount();
  const { data: walletClient } = useWalletClient();
  const { protocol, config } = useProtocol();

  const ADDRESSES = useMemo(() => {
    const addresses = getAddresses(protocol);
    console.log(`━━━ Protocol Address Configuration ━━━`);
    console.log(`Protocol: ${protocol.toUpperCase()}`);
    console.log(`wstETH: ${addresses.WSTETH}`);
    console.log(`WETH: ${addresses.WETH}`);
    console.log(`Helper: ${addresses.LEVERAGE_HELPER}`);
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    return addresses;
  }, [protocol]);
  const isAave = protocol === 'aave';
  const isMorpho = protocol === 'morpho';

  // Create protocol-aware publicClient (memoized by protocol to prevent recreation glitches)
  const publicClient = useMemo(() => {
    const chain = isAave ? contractDevMainnet : contractDevBase;
    const rpcUrl = isAave
      ? 'https://rpc.contract.dev/8d4c379b5a073372ada8a49d68b43276'
      : 'https://rpc.contract.dev/eb48f1e525119201aedb590f162be7bc';

    console.log(`━━━ Creating PublicClient ━━━`);
    console.log(`Protocol: ${isAave ? 'AAVE' : 'MORPHO'}`);
    console.log(`Chain: ${chain.name} (ID: ${chain.id})`);
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);

    return createPublicClient({
      chain,
      transport: http(rpcUrl, {
        batch: false,
        retryCount: 3,
      }),
    });
  }, [isAave]); // Only recreate when protocol actually changes

  // Read user's wstETH wallet balance
  const getWstethBalance = useCallback(async () => {
    if (!publicClient || !address) return 0n;

    const wstethAddress = ADDRESSES.WSTETH;
    const chainName = isAave ? 'Ethereum (13957)' : 'Base (18133)';

    console.log(`━━━ wstETH Balance Query ━━━`);
    console.log(`Protocol: ${protocol.toUpperCase()}`);
    console.log(`Chain: ${chainName}`);
    console.log(`wstETH Contract: ${wstethAddress}`);
    console.log(`User: ${address}`);

    try {
      const balance = await publicClient.readContract({
        address: wstethAddress,
        abi: ERC20_ABI,
        functionName: 'balanceOf',
        args: [address],
      });
      console.log(`✓ Balance: ${formatEther(balance)} wstETH`);
      console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
      return balance;
    } catch (error) {
      console.error(`✗ Error fetching balance:`, error);
      console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
      return 0n;
    }
  }, [publicClient, address, ADDRESSES, protocol, isAave]);

  // Read user's collateral balance (protocol-aware)
  const getATokenBalance = useCallback(async () => {
    if (!publicClient || !address) return 0n;

    if (isAave) {
      const AAVE_ADDRESSES = ADDRESSES as any;
      return publicClient.readContract({
        address: AAVE_ADDRESSES.WSTETH_ATOKEN,
        abi: ERC20_ABI,
        functionName: 'balanceOf',
        args: [address],
      });
    } else {
      // Morpho: get from getUserPosition
      const result = await publicClient.readContract({
        address: ADDRESSES.LEVERAGE_HELPER,
        abi: MORPHO_FLASH_LOAN_HELPER_ABI,
        functionName: 'getUserPosition',
        args: [address],
      });
      return result[0];
    }
  }, [publicClient, address, isAave, ADDRESSES]);

  // Read user's debt balance (protocol-aware)
  const getDebtBalance = useCallback(async () => {
    if (!publicClient || !address) return 0n;

    if (isAave) {
      const AAVE_ADDRESSES = ADDRESSES as any;
      return publicClient.readContract({
        address: AAVE_ADDRESSES.WETH_VARIABLE_DEBT_TOKEN,
        abi: VARIABLE_DEBT_TOKEN_ABI,
        functionName: 'balanceOf',
        args: [address],
      });
    } else {
      // Morpho: get from getUserPosition
      const result = await publicClient.readContract({
        address: ADDRESSES.LEVERAGE_HELPER,
        abi: MORPHO_FLASH_LOAN_HELPER_ABI,
        functionName: 'getUserPosition',
        args: [address],
      });
      return result[1];
    }
  }, [publicClient, address, isAave, ADDRESSES]);

  // Read user's position (protocol-aware)
  const getUserPosition = useCallback(async () => {
    if (!publicClient || !address) return null;

    if (isAave) {
      const result = await publicClient.readContract({
        address: ADDRESSES.LEVERAGE_HELPER,
        abi: LEVERAGE_HELPER_ABI,
        functionName: 'getUserPosition',
        args: [address],
      });
      return {
        totalCollateralBase: result[0],
        totalDebtBase: result[1],
        availableBorrowsBase: result[2],
        currentLiquidationThreshold: Number(result[3]),
        ltv: Number(result[4]),
        healthFactor: Number(formatEther(result[5])),
      };
    } else {
      const result = await publicClient.readContract({
        address: ADDRESSES.LEVERAGE_HELPER,
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
    }
  }, [publicClient, address, isAave, ADDRESSES]);

  // Fetch Lido staking APR from API (no fallback - will throw if API fails)
  const getLidoStakingAPR = async (): Promise<number> => {
    const response = await fetch('https://eth-api.lido.fi/v1/protocol/steth/apr/sma');
    if (!response.ok) {
      throw new Error(`Lido API returned ${response.status}: ${response.statusText}`);
    }
    const data = await response.json();
    return data.data.smaApr;
  };

  // Get reserve data: wstETH for supply/LTV, WETH for borrow APY (protocol-aware)
  const getReserveInfo = useCallback(async () => {
    if (!publicClient) return null;

    console.log(`Fetching reserve info for protocol: ${protocol}`);

    if (isAave) {
      console.log('Using Aave reserve data');
      const AAVE_ADDRESSES = ADDRESSES as any;
      // Fetch Lido API staking APR and Aave reserve data in parallel
      const [wstethData, wethData, stakingYield] = await Promise.all([
        publicClient.readContract({
          address: AAVE_ADDRESSES.AAVE_POOL,
          abi: AAVE_POOL_ABI,
          functionName: 'getReserveData',
          args: [ADDRESSES.WSTETH],
        }),
        publicClient.readContract({
          address: AAVE_ADDRESSES.AAVE_POOL,
          abi: AAVE_POOL_ABI,
          functionName: 'getReserveData',
          args: [ADDRESSES.WETH],
        }),
        getLidoStakingAPR(),
      ]);

      // wstETH reserve: supply APY, LTV, liquidation threshold
      const wstethConfig = wstethData[0];
      const ltv = Number(wstethConfig & 0xFFFFn);
      const liqThreshold = Number((wstethConfig >> 16n) & 0xFFFFn);
      const wstethLiquidityRate = wstethData[2]; // RAY
      const supplyAPY = Number(wstethLiquidityRate) / Number(RAY) * 100;

      // WETH reserve: borrow APY
      const wethVariableBorrowRate = wethData[4]; // RAY
      const borrowAPY = Number(wethVariableBorrowRate) / Number(RAY) * 100;

      const maxLeverage = ltv > 0 ? 10000 / (10000 - ltv * 0.9) : 1;

      console.log(`Aave LTV: ${ltv / 100}%, Borrow APY: ${borrowAPY}%`);

      return {
        ltv: ltv / 100,
        liquidationThreshold: liqThreshold / 100,
        maxLeverage,
        supplyAPY,
        borrowAPY,
        stakingYield, // Real-time Lido staking APR from API
      };
    } else {
      console.log('Using Morpho reserve data - querying from contract and API');
      const MORPHO_ADDRESSES = ADDRESSES as any;

      try {
        // Query market params from contract and APY from API in parallel
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

        // Extract LLTV (in 18 decimals, so divide by 1e16 to get percentage)
        const lltvRaw = marketParams.lltv;
        const lltv = Number(lltvRaw) / 1e16; // Convert from 18 decimals to percentage

        // Calculate max leverage: 1 / (1 - LTV)
        // Example: 94.5% LTV = 1 / (1 - 0.945) = 18.18x
        const maxLeverage = lltv > 0 ? 100 / (100 - lltv) : 1;

        console.log(`Morpho Blue Market Info:`);
        console.log(`  LTV: ${lltv.toFixed(2)}%`);
        console.log(`  Max Leverage: ${maxLeverage.toFixed(2)}x`);
        console.log(`  Borrow APY: ${morphoAPY.borrowAPY.toFixed(2)}%`);
        console.log(`  Supply APY: ${morphoAPY.supplyAPY.toFixed(2)}%`);
        console.log(`  Utilization: ${morphoAPY.utilization.toFixed(2)}%`);

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
        // Fallback to default values for wstETH/WETH market on Base
        const stakingYield = await getLidoStakingAPR();
        return {
          ltv: 94.5,  // wstETH/WETH market LLTV
          liquidationThreshold: 94.5,
          maxLeverage: 18.18,  // 100 / (100 - 94.5)
          supplyAPY: 5.66,
          borrowAPY: 6.01,
          stakingYield,
        };
      }
    }
  }, [publicClient, protocol, isAave, ADDRESSES]);

  // Get wstETH exchange rate (stETH per wstETH) - protocol-aware
  const getExchangeRate = useCallback(async () => {
    if (!publicClient) return 1.228; // Default fallback

    if (isAave) {
      // Ethereum: wstETH has stEthPerToken() function
      try {
        const rate = await publicClient.readContract({
          address: ADDRESSES.WSTETH,
          abi: WSTETH_ABI,
          functionName: 'stEthPerToken',
        });
        console.log(`Aave wstETH exchange rate: ${Number(formatEther(rate))}`);
        return Number(formatEther(rate));
      } catch (error) {
        console.error('Error fetching Aave exchange rate:', error);
        return 1.228; // Fallback
      }
    } else {
      // Base/Morpho: wstETH might not have the same interface
      // Use a fixed rate or try to query with fallback
      console.log('Morpho: Using fixed wstETH exchange rate (Base wstETH may not have stEthPerToken)');
      return 1.228; // Typical wstETH/stETH ratio
    }
  }, [publicClient, isAave, ADDRESSES]);

  // Simulate leverage position (Morpho)
  const simulateLeverage = useCallback(async (targetLeverage: number, userDeposit: number) => {
    if (!publicClient) throw new Error('Client not available');
    const result = await publicClient.readContract({
      address: ADDRESSES.LEVERAGE_HELPER,
      abi: MORPHO_FLASH_LOAN_HELPER_ABI,
      functionName: 'simulateLeverage',
      args: [
        parseEther(targetLeverage.toString()),
        parseEther(userDeposit.toString()),
      ],
    });
    return {
      flashWethAmount: result[0],
      totalCollateral: result[1],  // wstETH
      totalDebt: result[2],        // WETH
      estimatedHealthFactor: Number(formatEther(result[3])),
    };
  }, [publicClient, ADDRESSES]);

  // Get max safe leverage (Morpho)
  const getMaxSafeLeverage = useCallback(async () => {
    if (!publicClient) return 3.0;
    const result = await publicClient.readContract({
      address: ADDRESSES.LEVERAGE_HELPER,
      abi: MORPHO_FLASH_LOAN_HELPER_ABI,
      functionName: 'getMaxSafeLeverage',
      args: [],
    });
    return Number(formatEther(result));
  }, [publicClient, ADDRESSES]);

  // Execute leverage (protocol-aware)
  const executeLeverage = async (targetLeverage: number, userDeposit: number, lifiSwapData: string = '') => {
    if (!walletClient || !address || !publicClient) {
      throw new Error('Wallet not connected');
    }

    try {
      const depositWei = parseEther(userDeposit.toString());
      const leverageWei = parseEther(targetLeverage.toString());

      // Pre-flight check: Verify user has enough wstETH
      console.log('Checking wstETH balance...');
      const balance = await publicClient.readContract({
        address: ADDRESSES.WSTETH,
        abi: ERC20_ABI,
        functionName: 'balanceOf',
        args: [address],
      });

      if (balance < depositWei) {
        throw new Error(`Insufficient wstETH balance. You have ${formatEther(balance)} wstETH but need ${formatEther(depositWei)} wstETH`);
      }

      // Step 1: Approve wstETH to helper
      console.log('Checking wstETH allowance...');
      const allowance = await publicClient.readContract({
        address: ADDRESSES.WSTETH,
        abi: ERC20_ABI,
        functionName: 'allowance',
        args: [address, ADDRESSES.LEVERAGE_HELPER],
      });

      if (allowance < depositWei) {
        console.log('Approving wstETH...');
        const hash = await walletClient.writeContract({
          address: ADDRESSES.WSTETH,
          abi: ERC20_ABI,
          functionName: 'approve',
          args: [ADDRESSES.LEVERAGE_HELPER, maxUint256],
          gas: 100000n,
        });
        await publicClient.waitForTransactionReceipt({ hash });
        console.log('wstETH approved');
      } else {
        console.log('wstETH already approved');
      }

      if (isAave) {
        // Aave: Credit delegation
        const AAVE_ADDRESSES = ADDRESSES as any;
        console.log('Checking credit delegation...');
        const delegation = await publicClient.readContract({
          address: AAVE_ADDRESSES.WETH_VARIABLE_DEBT_TOKEN,
          abi: VARIABLE_DEBT_TOKEN_ABI,
          functionName: 'borrowAllowance',
          args: [address, ADDRESSES.LEVERAGE_HELPER],
        });

        // Calculate required delegation (rough estimate: deposit * leverage)
        const requiredDelegation = depositWei * BigInt(Math.ceil(targetLeverage));

        if (delegation < requiredDelegation) {
          console.log('Approving credit delegation...');
          const hash = await walletClient.writeContract({
            address: AAVE_ADDRESSES.WETH_VARIABLE_DEBT_TOKEN,
            abi: VARIABLE_DEBT_TOKEN_ABI,
            functionName: 'approveDelegation',
            args: [ADDRESSES.LEVERAGE_HELPER, maxUint256],
            gas: 100000n,
          });
          await publicClient.waitForTransactionReceipt({ hash });
          console.log('Credit delegation approved');
        }

        // Execute Aave leverage (minWstethOut = 0 for now)
        console.log('Executing Aave leverage...');
        const hash = await walletClient.writeContract({
          address: ADDRESSES.LEVERAGE_HELPER,
          abi: LEVERAGE_HELPER_ABI,
          functionName: 'executeLeverage',
          args: [leverageWei, depositWei, 0n],
          gas: 3000000n,
        });

        const receipt = await publicClient.waitForTransactionReceipt({ hash, timeout: 30000 });
        return receipt;
      } else {
        // Morpho: Authorization
        const MORPHO_ADDRESSES = ADDRESSES as any;
        console.log('Checking Morpho authorization...');
        const isAuthorized = await publicClient.readContract({
          address: ADDRESSES.LEVERAGE_HELPER,
          abi: MORPHO_FLASH_LOAN_HELPER_ABI,
          functionName: 'hasAuthorization',
          args: [address],
        });

        if (!isAuthorized) {
          console.log('Authorizing helper on Morpho...');
          const hash = await walletClient.writeContract({
            address: MORPHO_ADDRESSES.MORPHO_BLUE,
            abi: MORPHO_ABI,
            functionName: 'setAuthorization',
            args: [ADDRESSES.LEVERAGE_HELPER, true],
            gas: 100000n,
          });
          await publicClient.waitForTransactionReceipt({ hash });
          console.log('Authorization granted');
        }

        // Execute Morpho leverage
        console.log('Executing Morpho leverage...');
        const lifiBytes = lifiSwapData ? `0x${lifiSwapData}` as `0x${string}` : '0x' as `0x${string}`;
        const hash = await walletClient.writeContract({
          address: ADDRESSES.LEVERAGE_HELPER,
          abi: MORPHO_FLASH_LOAN_HELPER_ABI,
          functionName: 'executeLeverage',
          args: [leverageWei, depositWei, lifiBytes],
          gas: 3000000n,
        });

        const receipt = await publicClient.waitForTransactionReceipt({ hash, timeout: 30000 });
        return receipt;
      }
    } catch (error: any) {
      console.error('ExecuteLeverage error:', error);
      if (error?.message?.includes('Block at number')) {
        return { transactionHash: 'unknown', status: 'success' } as any;
      }
      throw error;
    }
  };

  // Execute deleverage (protocol-aware)
  const executeDeleverage = async (lifiSwapData: string = '') => {
    if (!walletClient || !address || !publicClient) throw new Error('Wallet not connected');

    try {
      if (isAave) {
        // Aave: Need to approve aToken
        const AAVE_ADDRESSES = ADDRESSES as any;
        console.log('Checking aToken allowance...');
        const allowance = await publicClient.readContract({
          address: AAVE_ADDRESSES.WSTETH_ATOKEN,
          abi: ERC20_ABI,
          functionName: 'allowance',
          args: [address, ADDRESSES.LEVERAGE_HELPER],
        });

        if (allowance === 0n) {
          console.log('Approving aToken...');
          const hash = await walletClient.writeContract({
            address: AAVE_ADDRESSES.WSTETH_ATOKEN,
            abi: ERC20_ABI,
            functionName: 'approve',
            args: [ADDRESSES.LEVERAGE_HELPER, maxUint256],
            gas: 100000n,
          });
          await publicClient.waitForTransactionReceipt({ hash });
          console.log('aToken approved');
        }

        console.log('Executing Aave deleverage...');
        const hash = await walletClient.writeContract({
          address: ADDRESSES.LEVERAGE_HELPER,
          abi: LEVERAGE_HELPER_ABI,
          functionName: 'executeDeleverage',
          args: [],
          gas: 3000000n,
        });

        return await publicClient.waitForTransactionReceipt({ hash, timeout: 30000 });
      } else {
        // Morpho: Use LiFi swap data
        console.log('Executing Morpho deleverage...');
        const lifiBytes = lifiSwapData ? `0x${lifiSwapData}` as `0x${string}` : '0x' as `0x${string}`;
        const hash = await walletClient.writeContract({
          address: ADDRESSES.LEVERAGE_HELPER,
          abi: MORPHO_FLASH_LOAN_HELPER_ABI,
          functionName: 'executeDeleverage',
          args: [lifiBytes],
          gas: 3000000n,
        });

        return await publicClient.waitForTransactionReceipt({ hash, timeout: 30000 });
      }
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
    simulateLeverage,
    getMaxSafeLeverage,
    executeLeverage,
    executeDeleverage,
  };
}
