import { createContext, useContext, useState, useCallback, useRef, type ReactNode } from 'react';

export interface PanelState {
  id: string;
  initialPath: string;
}

interface PanelContextValue {
  panels: PanelState[];
  addPanel: (path?: string) => void;
  closePanel: (id: string) => void;
  registerNavigate: (panelId: string, fn: (path: string) => void) => void;
  unregisterNavigate: (panelId: string) => void;
  reportLocation: (panelId: string, path: string) => void;
  getFirstPanelPath: () => string;
  navigatePanel: (path: string) => void;
  getPanelLocation: (panelId: string) => string;
}

const PanelContext = createContext<PanelContextValue>({
  panels: [],
  addPanel: () => {},
  closePanel: () => {},
  registerNavigate: () => {},
  unregisterNavigate: () => {},
  reportLocation: () => {},
  getFirstPanelPath: () => '/',
  navigatePanel: () => {},
  getPanelLocation: () => '/',
});

interface PanelProviderProps {
  initialPath: string;
  children: ReactNode;
}

export function PanelProvider({ initialPath, children }: PanelProviderProps) {
  const [panels, setPanels] = useState<PanelState[]>(() => [
    { id: crypto.randomUUID(), initialPath },
  ]);

  // Navigation registry — each panel registers its MemoryRouter navigate fn
  const navigateRefs = useRef<Map<string, (path: string) => void>>(new Map());
  // Location registry — each panel reports its current path
  const locationRefs = useRef<Map<string, string>>(new Map());

  const addPanel = useCallback((path: string = '/') => {
    setPanels(prev => {
      if (prev.length >= 4) return prev; // max 4 panels
      return [...prev, { id: crypto.randomUUID(), initialPath: path }];
    });
  }, []);

  const closePanel = useCallback((id: string) => {
    setPanels(prev => {
      if (prev.length <= 1) return prev; // can't close last panel
      return prev.filter(p => p.id !== id);
    });
  }, []);

  const registerNavigate = useCallback((panelId: string, fn: (path: string) => void) => {
    navigateRefs.current.set(panelId, fn);
  }, []);

  const unregisterNavigate = useCallback((panelId: string) => {
    navigateRefs.current.delete(panelId);
    locationRefs.current.delete(panelId);
  }, []);

  const reportLocation = useCallback((panelId: string, path: string) => {
    locationRefs.current.set(panelId, path);
  }, []);

  // Get the first panel's current path
  const getFirstPanelPath = useCallback(() => {
    const firstPanelId = panels[0]?.id;
    if (firstPanelId) {
      return locationRefs.current.get(firstPanelId) || '/';
    }
    return '/';
  }, [panels]);

  // Get a specific panel's current path
  const getPanelLocation = useCallback((panelId: string) => {
    return locationRefs.current.get(panelId) || '/';
  }, []);

  // Navigate the first panel (used by SearchOverlay)
  const navigatePanel = useCallback((path: string) => {
    // Get the first panel's navigate function
    const firstPanelId = panels[0]?.id;
    if (firstPanelId) {
      const nav = navigateRefs.current.get(firstPanelId);
      if (nav) nav(path);
    }
  }, [panels]);

  return (
    <PanelContext.Provider value={{ panels, addPanel, closePanel, registerNavigate, unregisterNavigate, reportLocation, getFirstPanelPath, navigatePanel, getPanelLocation }}>
      {children}
    </PanelContext.Provider>
  );
}

export function usePanels() {
  return useContext(PanelContext);
}
