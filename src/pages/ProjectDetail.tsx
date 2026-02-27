import { useParams, useSearchParams } from 'react-router-dom';
import { useState, useEffect, useCallback } from 'react';
import { useDoc, useProjectDocs } from '../db/hooks';
import { createDoc, deleteDoc, deleteReport } from '../db';
import type { Project, Report, Note, Chat, Reference } from '../db/types';
import { generateReport } from '../lib/api';
import QueueList from '../components/features/QueueList';
import DocHeader from '../components/features/DocHeader';
import Badge from '../components/ui/Badge';
import ConfirmDeleteButton from '../components/ui/ConfirmDeleteButton';
import { usePanelNavigate } from '../panels/usePanelNavigate';

type Tab = 'reports' | 'notes' | 'chats' | 'references' | 'queue';

const TAB_CONFIG: { key: Tab; label: string; badge: 'pink' | 'green' | 'blue' | 'yellow' | 'coral' }[] = [
  { key: 'reports', label: 'Reports', badge: 'pink' },
  { key: 'notes', label: 'Notes', badge: 'green' },
  { key: 'chats', label: 'Chats', badge: 'blue' },
  { key: 'references', label: 'References', badge: 'yellow' },
  { key: 'queue', label: 'Queue', badge: 'coral' },
];

export default function ProjectDetail() {
  const { projectId } = useParams<{ projectId: string }>();
  const panelNavigate = usePanelNavigate();
  const [searchParams] = useSearchParams();
  const { doc: project, loading } = useDoc<Project>(projectId || null);
  const initialTab = (searchParams.get('tab') as Tab | null) ?? 'reports';
  const [activeTab, setActiveTab] = useState<Tab>(initialTab);

  const { docs: reports } = useProjectDocs<Report>('report', projectId || null);
  const { docs: notes } = useProjectDocs<Note>('note', projectId || null);
  const { docs: chats } = useProjectDocs<Chat>('chat', projectId || null);
  const { docs: refs } = useProjectDocs<Reference>('reference', projectId || null);

  // Tab key cycles between tabs (only when no input/textarea is focused)
  const cycleTab = useCallback((direction: 1 | -1) => {
    setActiveTab(prev => {
      const idx = TAB_CONFIG.findIndex(t => t.key === prev);
      const next = (idx + direction + TAB_CONFIG.length) % TAB_CONFIG.length;
      return TAB_CONFIG[next].key;
    });
  }, []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Don't intercept Tab when user is typing in an input or textarea
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

      if (e.key === 'Tab') {
        e.preventDefault();
        cycleTab(e.shiftKey ? -1 : 1);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [cycleTab]);

  if (loading) return <div className="page-loading">Loading…</div>;
  if (!project) return <div className="page-loading">Project not found.</div>;

  const formatDate = (iso: string) =>
    new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

  const tabCounts: Record<Tab, number> = {
    reports: reports.length,
    notes: notes.length,
    chats: chats.length,
    references: refs.length,
    queue: 0, // queue shows its own count
  };

  return (
    <div className="project-detail-page">
      <DocHeader backPath="/" backLabel="Projects" />
      <div className="project-detail-scroll">
        <div className="page-header">
          <div>
            <h2 className="page-title">{project.title}</h2>
            {project.description && <p className="page-description">{project.description}</p>}
          </div>
        </div>

        <div className="tabs">
          {TAB_CONFIG.map(tab => (
            <button
              key={tab.key}
              className={`tab ${activeTab === tab.key ? 'active' : ''}`}
              onClick={() => setActiveTab(tab.key)}
            >
              {tab.label}
              {tabCounts[tab.key] > 0 && (
                <span className={`tab-count badge-${tab.badge}`}>{tabCounts[tab.key]}</span>
              )}
            </button>
          ))}
        </div>

        <div className="tab-content">
          {activeTab === 'reports' && (
            <ReportsList reports={reports} panelNavigate={panelNavigate} formatDate={formatDate} projectId={projectId || ''} />
          )}
          {activeTab === 'notes' && (
            <NotesList notes={notes} formatDate={formatDate} />
          )}
          {activeTab === 'chats' && (
            <ChatsList
              chats={chats}
              formatDate={formatDate}
              projectId={projectId || ''}
              panelNavigate={panelNavigate}
            />
          )}
          {activeTab === 'references' && (
            <ReferencesList refs={refs} formatDate={formatDate} />
          )}
          {activeTab === 'queue' && projectId && (
            <QueueList projectId={projectId} />
          )}
        </div>
      </div>
    </div>
  );
}

// --- Tab sub-components ---

function ReportsList({
  reports,
  panelNavigate,
  formatDate,
  projectId,
}: {
  reports: Report[];
  panelNavigate: (path: string, event?: React.MouseEvent) => void;
  formatDate: (iso: string) => string;
  projectId: string;
}) {
  const [showForm, setShowForm] = useState(false);
  const [query, setQuery] = useState('');
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);

  const handleGenerate = async () => {
    if (!query.trim() || generating) return;
    setGenerating(true);
    setError(null);
    setElapsed(0);

    // Tick a timer so the user sees progress
    const timer = setInterval(() => setElapsed(s => s + 1), 1000);

    try {
      const result = await generateReport(query.trim());
      await createDoc<Report>('report', {
        projectId,
        title: result.title,
        htmlContent: result.htmlContent,
        sourceQuery: query.trim(),
      });
      setQuery('');
      setShowForm(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      clearInterval(timer);
      setGenerating(false);
    }
  };

  return (
    <div>
      {/* New Report button / form */}
      {!showForm && !generating && (
        <button className="btn btn-primary" onClick={() => setShowForm(true)}>
          + New Report
        </button>
      )}

      {showForm && !generating && (
        <div className="report-form">
          <label className="report-form-label">What would you like to research?</label>
          <textarea
            className="report-form-input"
            placeholder="e.g. What's the current state of quantum computing? Who are the key players and what are the open problems?"
            value={query}
            onChange={e => setQuery(e.target.value)}
            rows={3}
            autoFocus
          />
          {error && <div className="report-form-error">{error}</div>}
          <div className="report-form-actions">
            <button
              className="btn btn-primary"
              onClick={handleGenerate}
              disabled={!query.trim()}
            >
              Generate Report
            </button>
            <button className="btn" onClick={() => { setShowForm(false); setError(null); }}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {generating && (
        <div className="report-generating">
          <div className="report-generating-spinner" />
          <div>
            <div className="report-generating-title">Researching…</div>
            <div className="report-generating-meta">
              "{query.length > 60 ? query.slice(0, 60) + '…' : query}" — {elapsed}s elapsed
            </div>
            <div className="report-generating-hint">This usually takes 30–60 seconds.</div>
          </div>
        </div>
      )}

      {/* Report cards */}
      {reports.length === 0 && !showForm && !generating && (
        <div className="empty-state">No reports yet.</div>
      )}
      {reports.length > 0 && (
        <div className="report-card-grid" style={{ marginTop: showForm || generating ? 0 : 16 }}>
          {reports.map(report => (
            <button
              key={report._id}
              className="report-card"
              onClick={(e) => panelNavigate(`/project/${projectId}/report/${report._id}`, e)}
            >
              <ConfirmDeleteButton
                onConfirm={() => deleteReport(report._id)}
                size={14}
              />
              <h4 className="report-card-title">{report.title}</h4>
              {report.sourceQuery && (
                <p className="report-card-query">{report.sourceQuery}</p>
              )}
              <div className="report-card-date">{formatDate(report.createdAt)}</div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function NotesList({ notes, formatDate }: { notes: Note[]; formatDate: (iso: string) => string }) {
  if (notes.length === 0) return <div className="empty-state">No notes yet.</div>;
  return (
    <div className="list">
      {notes.map(note => (
        <div key={note._id} className="list-item">
          <div className="list-item-content">
            <span className="list-item-title">{note.title}</span>
            <span className="list-item-meta">
              {note.content.slice(0, 120)}
              {note.content.length > 120 ? '…' : ''}
            </span>
          </div>
          <span className="list-item-date">{formatDate(note.updatedAt)}</span>
        </div>
      ))}
    </div>
  );
}

function ChatsList({
  chats,
  formatDate,
  projectId,
  panelNavigate,
}: {
  chats: Chat[];
  formatDate: (iso: string) => string;
  projectId: string;
  panelNavigate: (path: string, event?: React.MouseEvent) => void;
}) {
  const handleNewChat = async () => {
    const doc = await createDoc<Chat>('chat', {
      projectId,
      title: 'New chat',
      messages: [],
    });
    panelNavigate(`/project/${projectId}/chat/${doc._id}`);
  };

  return (
    <div>
      <button className="btn btn-primary" onClick={handleNewChat}>
        + New Chat
      </button>

      {chats.length === 0 && (
        <div className="empty-state">No chats yet.</div>
      )}
      {chats.length > 0 && (
        <div className="list" style={{ marginTop: 16 }}>
          {chats.map(chat => (
            <div
              key={chat._id}
              className="list-item clickable"
              onClick={(e) => panelNavigate(`/project/${projectId}/chat/${chat._id}`, e)}
            >
              <div className="list-item-content">
                <span className="list-item-title">{chat.title}</span>
                <span className="list-item-meta">{chat.messages.length} messages</span>
              </div>
              <span className="list-item-date">{formatDate(chat.updatedAt)}</span>
              <ConfirmDeleteButton
                onConfirm={() => deleteDoc(chat._id)}
                size={14}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ReferencesList({
  refs,
  formatDate,
}: {
  refs: Reference[];
  formatDate: (iso: string) => string;
}) {
  if (refs.length === 0) return <div className="empty-state">No references yet.</div>;

  const typeColors: Record<string, 'pink' | 'green' | 'blue' | 'yellow' | 'lavender' | 'coral'> = {
    video: 'coral',
    blog: 'pink',
    paper: 'blue',
    link: 'lavender',
    book: 'yellow',
    podcast: 'green',
  };

  return (
    <div className="list">
      {refs.map(ref => (
        <div key={ref._id} className="list-item">
          <Badge label={ref.refType} variant={typeColors[ref.refType] || 'blue'} />
          <div className="list-item-content">
            <span className="list-item-title">
              {ref.url ? (
                <a href={ref.url} target="_blank" rel="noopener noreferrer">
                  {ref.title}
                </a>
              ) : (
                ref.title
              )}
            </span>
            {ref.author && <span className="list-item-meta">by {ref.author}</span>}
          </div>
          <span className="list-item-date">{formatDate(ref.updatedAt)}</span>
        </div>
      ))}
    </div>
  );
}
