'use client';

import { createContext, useContext, useState, useCallback } from 'react';

export interface LayoutConfig {
  navbarTransparent: boolean;
  hideFooter: boolean;
}

const defaultConfig: LayoutConfig = {
  navbarTransparent: false,
  hideFooter: false,
};

interface LayoutContextValue {
  config: LayoutConfig;
  setConfig: (patch: Partial<LayoutConfig>) => void;
}

const LayoutContext = createContext<LayoutContextValue>({
  config: defaultConfig,
  setConfig: () => {},
});

export function LayoutProvider({ children }: { children: React.ReactNode }) {
  const [config, setConfigState] = useState<LayoutConfig>(defaultConfig);

  const setConfig = useCallback((patch: Partial<LayoutConfig>) => {
    setConfigState((prev) => ({ ...prev, ...patch }));
  }, []);

  return (
    <LayoutContext.Provider value={{ config, setConfig }}>
      {children}
    </LayoutContext.Provider>
  );
}

export function useLayout() {
  return useContext(LayoutContext);
}
