import { useParams, useSearchParams } from 'react-router-dom';
import { useState, useEffect, useCallback } from 'react';
import { useDoc, useProjectDocs } from '../db/hooks';
import { createDoc, deleteDoc, deleteReport } from '../db';
import type { Project, Report, Note, Chat, Reference, Topic } from '../db/types';
import { generateReport } from '../lib/api';
import QueueList from '../components/features/QueueList';
import TopicPicker from '../components/features/TopicPicker';
import DocHeader from '../components/features/DocHeader';
import Badge from '../components/ui/Badge';
import ConfirmDeleteButton from '../components/ui/ConfirmDeleteButton';
import { usePanelNavigate } from '../panels/usePanelNavigate';
import { projectColor } from '../lib/projectColor';

type Tab = 'home' | 'reports' | 'notes' | 'chats' | 'references';

const TAB_CONFIG: { key: Tab; label: string; badge: 'pink' | 'green' | 'blue' | 'yellow' | 'coral' | 'lavender' }[] = [
  { key: 'home', label: 'Home', badge: 'lavender' },
  { key: 'reports', label: 'Reports', badge: 'pink' },
  { key: 'notes', label: 'Notes', badge: 'green' },
  { key: 'chats', label: 'Chats', badge: 'blue' },
  { key: 'references', label: 'References', badge: 'coral' },
];

export default function ProjectDetail() {
  const { projectId } = useParams<{ projectId: string }>();
  const panelNavigate = usePanelNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { doc: project, loading } = useDoc<Project>(projectId || null);
  const initialTab = (searchParams.get('tab') as Tab | null) ?? 'home';
  const [activeTab, setActiveTab] = useState<Tab>(initialTab);

  // Keep the URL's ?tab= param in sync so sessionStorage persistence captures the active tab
  useEffect(() => {
    setSearchParams({ tab: activeTab }, { replace: true });
  }, [activeTab, setSearchParams]);

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
    home: 0,
    reports: reports.length,
    notes: notes.length,
    chats: chats.length,
    references: refs.length,
  };

  return (
    <div className="project-detail-page">
      <DocHeader backPath="/" backLabel="Projects" />
      <div className="project-detail-scroll">
        <div className="page-header">
          <div>
            <h2 className={`page-title title-${projectColor(projectId || '')}`}>{project.title}</h2>
            {project.description && <p className="page-description">{project.description}</p>}
          </div>
        </div>

        <div className="tabs">
          {TAB_CONFIG.map(tab => (
            <button
              key={tab.key}
              className={`tab tab-color-${tab.badge} ${activeTab === tab.key ? 'active' : ''}`}
              onClick={() => setActiveTab(tab.key)}
            >
              {tab.label}
              {tabCounts[tab.key] > 0 && (
                <span className={`tab-count badge-${tab.badge}`}>{tabCounts[tab.key]}</span>
              )}
            </button>
          ))}
        </div>

        <div className={`tab-content tab-content-${TAB_CONFIG.find(t => t.key === activeTab)?.badge}`}>
          {activeTab === 'home' && projectId && (
            <HomeTab
              projectId={projectId}
              reports={reports}
              notes={notes}
              chats={chats}
              refs={refs}
              panelNavigate={panelNavigate}
              formatDate={formatDate}
            />
          )}
          {activeTab === 'reports' && (
            <ReportsList reports={reports} panelNavigate={panelNavigate} formatDate={formatDate} projectId={projectId || ''} />
          )}
          {activeTab === 'notes' && (
            <NotesList notes={notes} formatDate={formatDate} panelNavigate={panelNavigate} projectId={projectId || ''} />
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
            <ReferencesList refs={refs} formatDate={formatDate} projectId={projectId || ''} />
          )}

        </div>
      </div>
    </div>
  );
}

// --- Home tab ---

type DocEntry = {
  _id: string;
  title: string;
  docType: 'report' | 'note' | 'chat' | 'reference';
  updatedAt: string;
  topicIds?: string[];
  url?: string;
};

const DOC_TYPE_BADGE: Record<DocEntry['docType'], 'pink' | 'green' | 'blue' | 'coral'> = {
  report: 'pink',
  note: 'green',
  chat: 'blue',
  reference: 'coral',
};

const DOC_TYPE_LABEL: Record<DocEntry['docType'], string> = {
  report: 'report',
  note: 'note',
  chat: 'chat',
  reference: 'ref',
};

function HomeTab({
  projectId,
  reports,
  notes,
  chats,
  refs,
  panelNavigate,
  formatDate,
}: {
  projectId: string;
  reports: Report[];
  notes: Note[];
  chats: Chat[];
  refs: Reference[];
  panelNavigate: (path: string, event?: React.MouseEvent) => void;
  formatDate: (iso: string) => string;
}) {
  const { docs: topics } = useProjectDocs<Topic>('topic', projectId);

  const allDocs: DocEntry[] = [
    ...reports.map(r => ({ _id: r._id, title: r.title, docType: 'report' as const, updatedAt: r.updatedAt, topicIds: r.topicIds })),
    ...notes.map(n => ({ _id: n._id, title: n.title, docType: 'note' as const, updatedAt: n.updatedAt, topicIds: n.topicIds })),
    ...chats.map(c => ({ _id: c._id, title: c.title, docType: 'chat' as const, updatedAt: c.updatedAt, topicIds: c.topicIds })),
    ...refs.map(r => ({ _id: r._id, title: r.title, docType: 'reference' as const, updatedAt: r.updatedAt, topicIds: r.topicIds, url: r.url })),
  ];

  const getNavPath = (doc: DocEntry): string | null => {
    if (doc.docType === 'report') return `/project/${projectId}/report/${doc._id}`;
    if (doc.docType === 'note') return `/project/${projectId}/note/${doc._id}`;
    if (doc.docType === 'chat') return `/project/${projectId}/chat/${doc._id}`;
    return null;
  };

  // Build topic groups: each topic collects its docs, sorted by updatedAt desc
  const topicGroups = topics
    .map(topic => ({
      topicId: topic._id,
      topicName: topic.name,
      docs: allDocs
        .filter(d => d.topicIds?.includes(topic._id))
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
    }))
    .filter(g => g.docs.length > 0)
    .sort((a, b) => a.topicName.localeCompare(b.topicName));

  // Ungrouped: docs with no topicIds assigned
  const ungroupedDocs = allDocs
    .filter(d => !d.topicIds || d.topicIds.length === 0)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));

  const hasAnyDocs = allDocs.length > 0;

  const renderDocList = (docs: DocEntry[]) => (
    <div className="list">
      {docs.map(doc => {
        const path = getNavPath(doc);
        return (
          <div key={doc._id} className="list-item-row">
            <div
              className={`list-item ${path ? 'clickable' : ''}`}
              onClick={path ? (e) => panelNavigate(path, e) : undefined}
            >
              <Badge label={DOC_TYPE_LABEL[doc.docType]} variant={DOC_TYPE_BADGE[doc.docType]} />
              <div className="list-item-content">
                <span className="list-item-title">{doc.title}</span>
              </div>
              <span className="list-item-date">{formatDate(doc.updatedAt)}</span>
            </div>
            <TopicPicker docId={doc._id} projectId={projectId} />
          </div>
        );
      })}
    </div>
  );

  return (
    <div>
      <QueueList projectId={projectId} />

      {hasAnyDocs && (
        <>
          <div className="home-tab-divider" />

          {topicGroups.map(group => (
            <div key={group.topicId} className="home-tab-topic-group">
              <div className="home-tab-topic-name">{group.topicName}</div>
              {renderDocList(group.docs)}
            </div>
          ))}

          {ungroupedDocs.length > 0 && (
            <div className="home-tab-topic-group">
              <div className="home-tab-topic-name">no topic</div>
              {renderDocList(ungroupedDocs)}
            </div>
          )}
        </>
      )}
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

          </div>
        </div>
      )}

      {reports.length === 0 && !showForm && !generating && (
        <div className="empty-state">No reports yet.</div>
      )}
      {reports.length > 0 && (
        <div className="list" style={{ marginTop: showForm || generating ? 0 : 16 }}>
          {reports.map(report => (
            <div key={report._id} className="list-item-row">
              <div
                className="list-item clickable"
                onClick={(e) => panelNavigate(`/project/${projectId}/report/${report._id}`, e)}
              >
                <div className="list-item-content">
                  <span className="list-item-title">{report.title}</span>
                  {report.sourceQuery && (
                    <span className="list-item-meta">{report.sourceQuery}</span>
                  )}
                </div>
                <span className="list-item-date">{formatDate(report.createdAt)}</span>
                <ConfirmDeleteButton
                  onConfirm={() => deleteReport(report._id)}
                  size={14}
                />
              </div>
              <TopicPicker docId={report._id} projectId={projectId} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function NotesList({
  notes,
  formatDate,
  panelNavigate,
  projectId,
}: {
  notes: Note[];
  formatDate: (iso: string) => string;
  panelNavigate: (path: string, event?: React.MouseEvent) => void;
  projectId: string;
}) {
  const handleCreate = async () => {
    const doc = await createDoc<Note>('note', {
      projectId,
      title: 'Untitled',
      content: '',
      tags: [],
    });
    panelNavigate(`/project/${projectId}/note/${doc._id}`);
  };

  return (
    <div>
      <button className="btn btn-primary" onClick={handleCreate} style={{ marginBottom: 16 }}>
        + New Note
      </button>

      {notes.length === 0 && (
        <div className="empty-state">No notes yet.</div>
      )}

      <div className="list">
        {notes.map(note => (
          <div key={note._id} className="list-item-row">
            <div
              className="list-item clickable"
              onClick={(e) => panelNavigate(`/project/${projectId}/note/${note._id}`, e)}
            >
              <div className="list-item-content">
                <span className="list-item-title">{note.title}</span>
                <span className="list-item-meta">
                  {note.content.slice(0, 120)}
                  {note.content.length > 120 ? '…' : ''}
                </span>
              </div>
              <span className="list-item-date">{formatDate(note.updatedAt)}</span>
              <ConfirmDeleteButton
                onConfirm={() => deleteDoc(note._id)}
                size={14}
              />
            </div>
            <TopicPicker docId={note._id} projectId={projectId} />
          </div>
        ))}
      </div>
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
            <div key={chat._id} className="list-item-row">
              <div
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
              <TopicPicker docId={chat._id} projectId={projectId} />
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
  projectId,
}: {
  refs: Reference[];
  formatDate: (iso: string) => string;
  projectId: string;
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
        <div key={ref._id} className="list-item-row">
          <div className="list-item">
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
          <TopicPicker docId={ref._id} projectId={projectId} />
        </div>
      ))}
    </div>
  );
}
