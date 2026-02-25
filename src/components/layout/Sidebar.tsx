import { useNavigate, useLocation } from 'react-router-dom';
import { useDocs } from '../../db/hooks';
import type { Project } from '../../db/types';

interface SidebarProps {
  isOpen: boolean;
  onNavigate: () => void;
}

export default function Sidebar({ isOpen, onNavigate }: SidebarProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const { docs: projects } = useDocs<Project>('project');

  const goTo = (path: string) => {
    navigate(path);
    onNavigate();
  };

  return (
    <aside className={`sidebar ${isOpen ? 'open' : ''}`}>
      <div className="sidebar-header">
        <h1
          className="sidebar-title"
          onClick={() => goTo('/')}
          style={{ cursor: 'pointer' }}
        >
          Research Workspace
        </h1>
      </div>

      <nav className="sidebar-nav">
        <div className="sidebar-section">
          <div className="sidebar-section-label">Navigation</div>
          <button
            className={`sidebar-link ${location.pathname === '/' ? 'active' : ''}`}
            onClick={() => goTo('/')}
          >
            <span className="sidebar-icon">◈</span>
            Overview
          </button>
        </div>

        <div className="sidebar-section">
          <div className="sidebar-section-label">Projects</div>
          {projects.length === 0 && (
            <div className="sidebar-empty">No projects yet</div>
          )}
          {projects.map(project => {
            const isActive = location.pathname === `/project/${project._id}`;
            return (
              <button
                key={project._id}
                className={`sidebar-link ${isActive ? 'active' : ''}`}
                onClick={() => goTo(`/project/${project._id}`)}
              >
                <span className="sidebar-icon">◆</span>
                {project.title}
              </button>
            );
          })}
        </div>
      </nav>
    </aside>
  );
}
