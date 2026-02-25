import { useParams, useNavigate } from 'react-router-dom';
import { useState } from 'react';
import { useDoc, useProjectDocs } from '../db/hooks';
import { createDoc } from '../db';
import type { Project, Report, Note, Chat, Reference } from '../db/types';
import { generateReport } from '../lib/api';
import QueueList from '../components/features/QueueList';
import Badge from '../components/ui/Badge';
import TagPill from '../components/ui/TagPill';

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
  const navigate = useNavigate();
  const { doc: project, loading } = useDoc<Project>(projectId || null);
  const [activeTab, setActiveTab] = useState<Tab>('reports');

  const { docs: reports } = useProjectDocs<Report>('report', projectId || null);
  const { docs: notes } = useProjectDocs<Note>('note', projectId || null);
  const { docs: chats } = useProjectDocs<Chat>('chat', projectId || null);
  const { docs: refs } = useProjectDocs<Reference>('reference', projectId || null);

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
    <div className="page">
      <div className="page-header">
        <div>
          <h2 className="page-title">{project.title}</h2>
          {project.description && <p className="page-description">{project.description}</p>}
          {project.tags.length > 0 && (
            <div className="page-tags">
              {project.tags.map(tag => (
                <TagPill key={tag} label={tag} color="lavender" />
              ))}
            </div>
          )}
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
          <ReportsList reports={reports} navigate={navigate} formatDate={formatDate} projectId={projectId || ''} />
        )}
        {activeTab === 'notes' && (
          <NotesList notes={notes} formatDate={formatDate} />
        )}
        {activeTab === 'chats' && (
          <ChatsList chats={chats} formatDate={formatDate} />
        )}
        {activeTab === 'references' && (
          <ReferencesList refs={refs} formatDate={formatDate} />
        )}
        {activeTab === 'queue' && projectId && (
          <QueueList projectId={projectId} />
        )}
      </div>
    </div>
  );
}

// --- Tab sub-components ---

function ReportsList({
  reports,
  navigate,
  formatDate,
  projectId,
}: {
  reports: Report[];
  navigate: (path: string) => void;
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
        tags: [],
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

      {/* Report list */}
      {reports.length === 0 && !showForm && !generating && (
        <div className="empty-state">No reports yet.</div>
      )}
      {reports.length > 0 && (
        <div className="list" style={{ marginTop: showForm || generating ? 0 : 16 }}>
          {reports.map(report => (
            <div
              key={report._id}
              className="list-item clickable"
              onClick={() => navigate(`/report/${report._id}`)}
            >
              <div className="list-item-content">
                <span className="list-item-title">{report.title}</span>
                {report.sourceQuery && (
                  <span className="list-item-meta">Query: {report.sourceQuery}</span>
                )}
              </div>
              <span className="list-item-date">{formatDate(report.updatedAt)}</span>
            </div>
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

function ChatsList({ chats, formatDate }: { chats: Chat[]; formatDate: (iso: string) => string }) {
  if (chats.length === 0) return <div className="empty-state">No chats yet.</div>;
  return (
    <div className="list">
      {chats.map(chat => (
        <div key={chat._id} className="list-item">
          <div className="list-item-content">
            <span className="list-item-title">{chat.title}</span>
            <span className="list-item-meta">{chat.messages.length} messages</span>
          </div>
          <span className="list-item-date">{formatDate(chat.updatedAt)}</span>
        </div>
      ))}
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
