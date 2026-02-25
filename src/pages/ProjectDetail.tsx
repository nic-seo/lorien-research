import { useParams, useNavigate } from 'react-router-dom';
import { useState } from 'react';
import { useDoc, useProjectDocs } from '../db/hooks';
import type { Project, Report, Note, Chat, Reference } from '../db/types';
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
          <ReportsList reports={reports} navigate={navigate} formatDate={formatDate} />
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
}: {
  reports: Report[];
  navigate: (path: string) => void;
  formatDate: (iso: string) => string;
}) {
  if (reports.length === 0) return <div className="empty-state">No reports yet.</div>;
  return (
    <div className="list">
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
