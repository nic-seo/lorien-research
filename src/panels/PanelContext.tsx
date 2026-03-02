import { createContext, useContext, useState, useCallback, useRef, useEffect, type ReactNode } from 'react';
import type React from 'react';

export interface PanelState {
  id: string;
  initialPath: string;
}

interface PanelContextValue {
  panels: PanelState[];
  addPanel: (path?: string) => void;
  closePanel: (id: string) => void;
  reorderPanels: (fromId: string, targetId: string, pos: 'left' | 'right') => void;
  registerNavigate: (panelId: string, fn: (path: string) => void) => void;
  unregisterNavigate: (panelId: string) => void;
  reportLocation: (panelId: string, path: string) => void;
  getFirstPanelPath: () => string;
  navigatePanel: (path: string) => void;
  getPanelLocation: (panelId: string) => string;
  // Drag state (for panel reordering)
  draggedPanelId: string | null;
  dragOverPanelId: string | null;
  dragOverPos: 'left' | 'right';
  startPanelDrag: (id: string) => void;
  updatePanelDragOver: (e: React.DragEvent<Element>, panelId: string) => void;
  dropOnPanel: (e: React.DragEvent<Element>, targetId: string) => void;
  endPanelDrag: () => void;
}

const PanelContext = createContext<PanelContextValue>({
  panels: [],
  addPanel: () => {},
  closePanel: () => {},
  reorderPanels: () => {},
  registerNavigate: () => {},
  unregisterNavigate: () => {},
  reportLocation: () => {},
  getFirstPanelPath: () => '/',
  navigatePanel: () => {},
  getPanelLocation: () => '/',
  draggedPanelId: null,
  dragOverPanelId: null,
  dragOverPos: 'right',
  startPanelDrag: () => {},
  updatePanelDragOver: () => {},
  dropOnPanel: () => {},
  endPanelDrag: () => {},
});

interface PanelProviderProps {
  initialPath: string;
  children: ReactNode;
}

// --- sessionStorage persistence ---

const STORAGE_KEY = 'lorien-panel-paths';

function loadSavedPaths(): string[] | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const paths = JSON.parse(raw);
    if (Array.isArray(paths) && paths.length > 0 && paths.every(p => typeof p === 'string')) {
      return paths;
    }
  } catch {}
  return null;
}

function savePaths(paths: string[]) {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(paths));
  } catch {}
}

// ----------------------------------

export function PanelProvider({ initialPath, children }: PanelProviderProps) {
  const [panels, setPanels] = useState<PanelState[]>(() => {
    const saved = loadSavedPaths();
    if (saved) {
      return saved.map(path => ({ id: crypto.randomUUID(), initialPath: path }));
    }
    return [{ id: crypto.randomUUID(), initialPath }];
  });

  // Navigation registry — each panel registers its MemoryRouter navigate fn
  const navigateRefs = useRef<Map<string, (path: string) => void>>(new Map());
  // Location registry — each panel reports its current path
  const locationRefs = useRef<Map<string, string>>(new Map());
  // Always-current panels ref so reportLocation doesn't go stale
  const panelsRef = useRef(panels);
  panelsRef.current = panels;

  // Persist whenever the panel list itself changes (add / close)
  useEffect(() => {
    const paths = panels.map(p => locationRefs.current.get(p.id) || p.initialPath);
    savePaths(paths);
  }, [panels]);

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

  const reorderPanels = useCallback((fromId: string, targetId: string, pos: 'left' | 'right') => {
    setPanels(prev => {
      const items = [...prev];
      const fromIdx = items.findIndex(p => p.id === fromId);
      if (fromIdx === -1) return prev;
      const [dragged] = items.splice(fromIdx, 1);
      const toIdx = items.findIndex(p => p.id === targetId);
      if (toIdx === -1) { items.splice(fromIdx, 0, dragged); return items; }
      const insertAt = pos === 'left' ? toIdx : toIdx + 1;
      items.splice(insertAt, 0, dragged);
      return items;
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
    // Persist all panels' current paths whenever any panel navigates
    const paths = panelsRef.current.map(p => locationRefs.current.get(p.id) || p.initialPath);
    savePaths(paths);
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
    const firstPanelId = panels[0]?.id;
    if (firstPanelId) {
      const nav = navigateRefs.current.get(firstPanelId);
      if (nav) nav(path);
    }
  }, [panels]);

  // --- Panel drag-and-drop state ---
  // Use refs for values read inside event handlers to avoid stale closures
  const [draggedPanelId, setDraggedPanelId] = useState<string | null>(null);
  const [dragOverPanelId, setDragOverPanelId] = useState<string | null>(null);
  const [dragOverPos, setDragOverPos] = useState<'left' | 'right'>('right');
  const dragStateRef = useRef<{ draggedId: string | null; pos: 'left' | 'right' }>({
    draggedId: null,
    pos: 'right',
  });

  const startPanelDrag = useCallback((id: string) => {
    dragStateRef.current.draggedId = id;
    setDraggedPanelId(id);
  }, []);

  const updatePanelDragOver = useCallback((e: React.DragEvent<Element>, panelId: string) => {
    e.preventDefault();
    if (panelId === dragStateRef.current.draggedId) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const pos = e.clientX < rect.left + rect.width / 2 ? 'left' : 'right';
    dragStateRef.current.pos = pos;
    setDragOverPanelId(panelId);
    setDragOverPos(pos);
  }, []);

  const dropOnPanel = useCallback((e: React.DragEvent<Element>, targetId: string) => {
    e.preventDefault();
    const { draggedId, pos } = dragStateRef.current;
    dragStateRef.current.draggedId = null;
    setDraggedPanelId(null);
    setDragOverPanelId(null);
    if (!draggedId || draggedId === targetId) return;
    reorderPanels(draggedId, targetId, pos);
  }, [reorderPanels]);

  const endPanelDrag = useCallback(() => {
    dragStateRef.current.draggedId = null;
    setDraggedPanelId(null);
    setDragOverPanelId(null);
  }, []);

  return (
    <PanelContext.Provider value={{
      panels, addPanel, closePanel, reorderPanels,
      registerNavigate, unregisterNavigate, reportLocation,
      getFirstPanelPath, navigatePanel, getPanelLocation,
      draggedPanelId, dragOverPanelId, dragOverPos,
      startPanelDrag, updatePanelDragOver, dropOnPanel, endPanelDrag,
    }}>
      {children}
    </PanelContext.Provider>
  );
}

export function usePanels() {
  return useContext(PanelContext);
}
