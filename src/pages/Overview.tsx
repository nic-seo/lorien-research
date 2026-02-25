import { useNavigate } from 'react-router-dom';
import { useState } from 'react';
import { useDocs } from '../db/hooks';
import { createDoc } from '../db/index';
import type { Project } from '../db/types';
import ProjectCard from '../components/features/ProjectCard';

export default function Overview() {
  const navigate = useNavigate();
  const { docs: projects, loading } = useDocs<Project>('project');
  const [showNew, setShowNew] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');

  const handleCreate = async () => {
    if (!title.trim()) return;
    const project = await createDoc<Project>('project', {
      title: title.trim(),
      description: description.trim(),
      tags: [],
    });
    setShowNew(false);
    setTitle('');
    setDescription('');
    navigate(`/project/${project._id}`);
  };

  if (loading) {
    return <div className="page-loading">Loading…</div>;
  }

  return (
    <div className="page">
      <div className="page-header">
        <h2 className="page-title">Overview</h2>
        <button className="btn btn-primary" onClick={() => setShowNew(true)}>
          + New Project
        </button>
      </div>

      {showNew && (
        <div className="new-project-form">
          <input
            type="text"
            className="form-input"
            placeholder="Project title"
            value={title}
            onChange={e => setTitle(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') handleCreate();
              if (e.key === 'Escape') setShowNew(false);
            }}
            autoFocus
          />
          <textarea
            className="form-input"
            placeholder="Description (optional)"
            value={description}
            onChange={e => setDescription(e.target.value)}
            rows={2}
          />
          <div className="form-actions">
            <button className="btn btn-primary" onClick={handleCreate} disabled={!title.trim()}>
              Create
            </button>
            <button className="btn" onClick={() => setShowNew(false)}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {projects.length === 0 && !showNew ? (
        <div className="empty-state">
          <p>No projects yet. Create one to get started.</p>
        </div>
      ) : (
        <div className="card-grid">
          {projects.map(project => (
            <ProjectCard key={project._id} project={project} />
          ))}
        </div>
      )}
    </div>
  );
}
