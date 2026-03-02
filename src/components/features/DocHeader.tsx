import { ChevronLeft, X } from 'lucide-react';
import LinkedItems from './LinkedItems';
import TopicPicker from './TopicPicker';
import { usePanels } from '../../panels/PanelContext';
import { usePanelId, PanelDragHandle } from '../../panels/PanelShell';
import { usePanelNavigate } from '../../panels/usePanelNavigate';
import type { DocType } from '../../db/types';

interface DocHeaderProps {
  backPath: string;
  backLabel?: string;
  docId?: string;
  docType?: DocType;
  projectId?: string;
}

export default function DocHeader({ backPath, backLabel = 'Back', docId, docType, projectId }: DocHeaderProps) {
  const panelNavigate = usePanelNavigate();
  const { panels, closePanel } = usePanels();
  const panelId = usePanelId();
  const isMultiPanel = panels.length > 1;

  return (
    <div className="doc-header">
      <button className="doc-header-back" onClick={(e) => panelNavigate(backPath, e)}>
        <ChevronLeft size={12} />
        {backLabel}
      </button>
      {docId && docType && projectId && (
        <LinkedItems docId={docId} docType={docType} projectId={projectId} />
      )}
      {docId && projectId && <TopicPicker docId={docId} projectId={projectId} />}
      <PanelDragHandle className="panel-drag-handle" />
      {isMultiPanel && panelId && (
        <button
          className="doc-header-close"
          onClick={() => closePanel(panelId)}
          title="Close panel"
        >
          <X size={14} />
        </button>
      )}
    </div>
  );
}
