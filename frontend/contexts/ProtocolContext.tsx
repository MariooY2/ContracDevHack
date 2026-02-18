'use client';

import React, { createContext, useContext, useState, useEffect, ReactNode, useRef } from 'react';
import { useChainId } from 'wagmi';
import { ProtocolType, ProtocolConfig, getProtocolConfig } from '@/lib/protocol';

interface ProtocolContextType {
  protocol: ProtocolType;
  config: ProtocolConfig;
}

const ProtocolContext = createContext<ProtocolContextType | undefined>(undefined);

export function ProtocolProvider({ children }: { children: ReactNode }) {
  const chainId = useChainId();
  const [protocol, setProtocol] = useState<ProtocolType>('aave');
  const initRef = useRef(false);

  // Sync protocol with chainId - simple and direct, NO circular dependency
  useEffect(() => {
    if (!chainId) {
      if (!initRef.current) {
        console.log('⚙️ No chain detected, defaulting to Aave');
        setProtocol('aave');
        initRef.current = true;
      }
      return;
    }

    const newProtocol: ProtocolType = chainId === 18133 ? 'morpho' : 'aave';

    if (!initRef.current) {
      console.log(`⚙️ Initial chain detected: ${chainId} → ${newProtocol.toUpperCase()}`);
      setProtocol(newProtocol);
      initRef.current = true;
    } else if (protocol !== newProtocol) {
      console.log(`🔄 Chain changed: ${chainId} → Switching to ${newProtocol.toUpperCase()}`);
      setProtocol(newProtocol);
    }
  }, [chainId]); // ✅ Only depends on chainId, protocol read from current state

  const config = getProtocolConfig(protocol);

  // Update CSS theme
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const root = document.documentElement;
      root.style.setProperty('--accent-primary', config.theme.primary);
      root.style.setProperty('--border-accent', config.theme.primary);
    }
  }, [config.theme.primary]);

  return (
    <ProtocolContext.Provider value={{ protocol, config }}>
      {children}
    </ProtocolContext.Provider>
  );
}

export function useProtocol() {
  const context = useContext(ProtocolContext);
  if (!context) {
    throw new Error('useProtocol must be used within a ProtocolProvider');
  }
  return context;
}
