'use client';

import { useProtocol } from '@/contexts/ProtocolContext';
import { ProtocolType, PROTOCOL_CONFIGS } from '@/lib/protocol';
import { useSwitchChain } from 'wagmi';
import { useState } from 'react';

export default function ProtocolSwitcher() {
  const { protocol } = useProtocol();
  const { switchChain } = useSwitchChain();
  const [switching, setSwitching] = useState(false);

  const handleProtocolSwitch = async (newProtocol: ProtocolType) => {
    if (newProtocol === protocol || switching) return;

    console.log('━━━ User Protocol Switch ━━━');
    console.log('Switching from:', protocol, '→', newProtocol);

    setSwitching(true);
    const newConfig = PROTOCOL_CONFIGS[newProtocol];

    try {
      console.log(`Requesting chain switch to ${newConfig.chainId}...`);
      await switchChain({ chainId: newConfig.chainId });
      console.log(`✓ Chain switched successfully`);
      console.log(`ProtocolContext will auto-sync protocol to ${newProtocol}`);
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    } catch (error) {
      console.error('✗ Failed to switch network:', error);
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      alert(`Please manually switch your wallet to ${newConfig.chainName} (Chain ID: ${newConfig.chainId})`);
    } finally {
      setSwitching(false);
    }
  };

  return (
    <div className="flex items-center justify-center gap-3 mb-8">
      <button
        onClick={() => handleProtocolSwitch('aave')}
        disabled={switching}
        className={`
          px-6 py-3 rounded-xl font-semibold transition-all duration-300 relative
          ${protocol === 'aave'
            ? 'text-white shadow-lg scale-105'
            : 'bg-gray-800/50 text-gray-400 hover:bg-gray-800 hover:text-gray-300'
          }
          ${switching ? 'opacity-50 cursor-not-allowed' : ''}
        `}
        style={protocol === 'aave' ? {
          background: PROTOCOL_CONFIGS.aave.theme.gradient,
          boxShadow: PROTOCOL_CONFIGS.aave.theme.glow,
        } : {}}
      >
        <div className="flex items-center gap-2">
          {switching && (
            <div className="animate-spin h-3 w-3 border-2 border-white border-t-transparent rounded-full"></div>
          )}
          <span>{PROTOCOL_CONFIGS.aave.name}</span>
          <span className="text-xs opacity-75">{PROTOCOL_CONFIGS.aave.chainName}</span>
        </div>
      </button>

      <button
        onClick={() => handleProtocolSwitch('morpho')}
        disabled={switching}
        className={`
          px-6 py-3 rounded-xl font-semibold transition-all duration-300 relative
          ${protocol === 'morpho'
            ? 'text-white shadow-lg scale-105'
            : 'bg-gray-800/50 text-gray-400 hover:bg-gray-800 hover:text-gray-300'
          }
          ${switching ? 'opacity-50 cursor-not-allowed' : ''}
        `}
        style={protocol === 'morpho' ? {
          background: PROTOCOL_CONFIGS.morpho.theme.gradient,
          boxShadow: PROTOCOL_CONFIGS.morpho.theme.glow,
        } : {}}
      >
        <div className="flex items-center gap-2">
          {switching && (
            <div className="animate-spin h-3 w-3 border-2 border-white border-t-transparent rounded-full"></div>
          )}
          <span>{PROTOCOL_CONFIGS.morpho.name}</span>
          <span className="text-xs opacity-75">{PROTOCOL_CONFIGS.morpho.chainName}</span>
        </div>
      </button>
    </div>
  );
}
