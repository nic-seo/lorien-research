import { ChevronLeft, X, Download } from 'lucide-react';
import LinkedItems from './LinkedItems';
import TopicPicker from './TopicPicker';
import { usePanels } from '../../panels/PanelContext';
import { usePanelId, PanelDragHandle } from '../../panels/PanelShell';
import { usePanelNavigate } from '../../panels/usePanelNavigate';
import { useDoc } from '../../db/hooks';
import type { DocType, Project } from '../../db/types';

interface DocHeaderProps {
  backPath: string;
  backLabel?: string;
  docId?: string;
  docType?: DocType;
  projectId?: string;
  onDownload?: () => void;
}

export default function DocHeader({ backPath, backLabel, docId, docType, projectId, onDownload }: DocHeaderProps) {
  const { doc: project } = useDoc<Project>(projectId || null);
  const panelNavigate = usePanelNavigate();
  const { panels, closePanel } = usePanels();
  const panelId = usePanelId();
  const isMultiPanel = panels.length > 1;

  return (
    <div className="doc-header">
      <button className="doc-header-back" onClick={(e) => panelNavigate(backPath, e)}>
        <ChevronLeft size={12} />
        {backLabel ?? project?.title ?? 'Back'}
      </button>
      {docId && docType && projectId && (
        <LinkedItems docId={docId} docType={docType} projectId={projectId} />
      )}
      {docId && projectId && <TopicPicker docId={docId} projectId={projectId} />}
      {onDownload && (
        <button className="doc-header-action" onClick={onDownload} title="Download as PDF">
          <Download size={14} />
        </button>
      )}
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
