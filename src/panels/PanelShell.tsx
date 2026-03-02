import { createContext, useContext, type ReactNode, useEffect } from 'react';
import { MemoryRouter, UNSAFE_LocationContext, useNavigate, useLocation } from 'react-router-dom';
import { X, GripVertical } from 'lucide-react';
import AppRoutes from './AppRoutes';
import type { PanelState } from './PanelContext';
import { usePanels } from './PanelContext';

/** Context that exposes the current panel's ID to all children */
const PanelIdContext = createContext<string | null>(null);
export function usePanelId() { return useContext(PanelIdContext); }

/**
 * Reusable drag handle component. Can be placed anywhere inside a panel.
 * - In PanelShell: rendered as an absolutely-positioned floating handle
 *   (className="panel-drag-handle-floating"), hidden on doc-header pages via CSS
 * - In DocHeader: rendered inline (default className="panel-drag-handle"),
 *   always visible on doc pages
 */
export function PanelDragHandle({ className = 'panel-drag-handle' }: { className?: string }) {
  const { panels, startPanelDrag, endPanelDrag } = usePanels();
  const panelId = usePanelId();

  // Only show when there are multiple panels to reorder
  if (!panelId || panels.length <= 1) return null;

  return (
    <span
      className={className}
      draggable
      onDragStart={e => {
        // Use the whole panel div as the drag image for better visual feedback
        const panelEl = (e.currentTarget as HTMLElement).closest('.panel') as HTMLElement;
        if (panelEl) e.dataTransfer.setDragImage(panelEl, 20, 20);
        e.dataTransfer.effectAllowed = 'move';
        startPanelDrag(panelId);
      }}
      onDragEnd={endPanelDrag}
      title="Drag to reorder panel"
    >
      <GripVertical size={13} />
    </span>
  );
}

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
  const { closePanel, draggedPanelId, dragOverPanelId, dragOverPos, updatePanelDragOver, dropOnPanel } = usePanels();

  return (
    <PanelIdContext.Provider value={panel.id}>
      <div
        className={[
          'panel',
          draggedPanelId === panel.id ? 'panel-dragging' : '',
          dragOverPanelId === panel.id ? `panel-drop-${dragOverPos}` : '',
        ].filter(Boolean).join(' ')}
        data-panel-id={panel.id}
        onDragOver={e => updatePanelDragOver(e, panel.id)}
        onDrop={e => dropOnPanel(e, panel.id)}
      >
        {/* Floating handle: visible on hover for non-doc-header pages */}
        <PanelDragHandle className="panel-drag-handle-floating" />
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
