import { useNavigate } from 'react-router-dom';
import { useCallback } from 'react';
import { usePanels } from './PanelContext';

/**
 * Returns a navigate function that supports ctrl/cmd+click to open in a new panel.
 *
 * Usage:
 *   const panelNavigate = usePanelNavigate();
 *   <div onClick={(e) => panelNavigate('/some/path', e)}>
 *
 * If ctrl or cmd is held, opens the path in a new panel.
 * Otherwise, navigates within the current panel's MemoryRouter.
 */
export function usePanelNavigate() {
  const navigate = useNavigate();
  const { addPanel } = usePanels();

  return useCallback(
    (path: string, event?: React.MouseEvent) => {
      if (event && (event.ctrlKey || event.metaKey)) {
        event.preventDefault();
        event.stopPropagation();
        addPanel(path);
      } else {
        navigate(path);
      }
    },
    [navigate, addPanel],
  );
}
