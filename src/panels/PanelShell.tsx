import { createContext, useContext, type ReactNode, useEffect } from 'react';
import { MemoryRouter, UNSAFE_LocationContext, useNavigate, useLocation } from 'react-router-dom';
import { X } from 'lucide-react';
import AppRoutes from './AppRoutes';
import type { PanelState } from './PanelContext';
import { usePanels } from './PanelContext';

/** Context that exposes the current panel's ID to all children */
const PanelIdContext = createContext<string | null>(null);
export function usePanelId() { return useContext(PanelIdContext); }

/**
 * Resets the parent Router context so a nested MemoryRouter can be created.
 * React Router v7 forbids nesting <Router> inside <Router>. This clears
 * the LocationContext so the inner MemoryRouter thinks it's at the top level.
 */
function RouterIsolation({ children }: { children: ReactNode }) {
  return (
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    <UNSAFE_LocationContext.Provider value={null as any}>
      {children}
    </UNSAFE_LocationContext.Provider>
  );
}

/**
 * Registers this panel's MemoryRouter navigate function with the PanelContext
 * so external components (e.g. SearchOverlay) can navigate within panels.
 * Also reports the current location so Ctrl+P can open context-aware panels.
 */
function NavigateRegistrar({ panelId }: { panelId: string }) {
  const navigate = useNavigate();
  const location = useLocation();
  const { registerNavigate, unregisterNavigate, reportLocation } = usePanels();

  useEffect(() => {
    registerNavigate(panelId, (path: string) => navigate(path));
    return () => unregisterNavigate(panelId);
  }, [panelId, navigate, registerNavigate, unregisterNavigate]);

  // Report current location on every navigation within this panel
  useEffect(() => {
    reportLocation(panelId, location.pathname + location.search);
  }, [panelId, location.pathname, location.search, reportLocation]);

  return null;
}

interface PanelShellProps {
  panel: PanelState;
}

export default function PanelShell({ panel }: PanelShellProps) {
  const { closePanel } = usePanels();

  return (
    <PanelIdContext.Provider value={panel.id}>
      <div className="panel">
        <button
          className="panel-close"
          onClick={() => closePanel(panel.id)}
          title="Close panel"
        >
          <X size={14} />
        </button>
        <div className="panel-body">
          <RouterIsolation>
            <MemoryRouter initialEntries={[panel.initialPath]}>
              <NavigateRegistrar panelId={panel.id} />
              <AppRoutes />
            </MemoryRouter>
          </RouterIsolation>
        </div>
      </div>
    </PanelIdContext.Provider>
  );
}
