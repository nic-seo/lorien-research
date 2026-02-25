import { useNavigate } from 'react-router-dom';
import { useProjectDocs, useQueue } from '../../db/hooks';
import type { Project, Report, Note, Chat, Reference } from '../../db/types';
import TagPill from '../ui/TagPill';

interface ProjectCardProps {
  project: Project;
}

export default function ProjectCard({ project }: ProjectCardProps) {
  const navigate = useNavigate();
  const { docs: reports } = useProjectDocs<Report>('report', project._id);
  const { docs: notes } = useProjectDocs<Note>('note', project._id);
  const { docs: chats } = useProjectDocs<Chat>('chat', project._id);
  const { docs: refs } = useProjectDocs<Reference>('reference', project._id);
  const { items: queueItems } = useQueue(project._id, 'open');

  const counts = [
    { label: 'Reports', count: reports.length, color: 'pink' as const },
    { label: 'Notes', count: notes.length, color: 'green' as const },
    { label: 'Chats', count: chats.length, color: 'blue' as const },
    { label: 'Refs', count: refs.length, color: 'yellow' as const },
  ];

  const updated = new Date(project.updatedAt).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });

  return (
    <div className="card" onClick={() => navigate(`/project/${project._id}`)}>
      <div className="card-header">
        <h3 className="card-title">{project.title}</h3>
        <span className="card-date">{updated}</span>
      </div>

      <p className="card-description">{project.description}</p>

      <div className="card-counts">
        {counts.map(c => (
          <span key={c.label} className={`card-count card-count-${c.color}`}>
            <strong>{c.count}</strong> {c.label}
          </span>
        ))}
      </div>

      {queueItems.length > 0 && (
        <div className="card-queue-badge">
          {queueItems.length} open queue item{queueItems.length !== 1 ? 's' : ''}
        </div>
      )}

      {project.tags.length > 0 && (
        <div className="card-tags">
          {project.tags.slice(0, 4).map(tag => (
            <TagPill key={tag} label={tag} color="lavender" />
          ))}
        </div>
      )}
    </div>
  );
}
