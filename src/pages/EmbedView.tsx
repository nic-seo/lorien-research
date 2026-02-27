import { useSearchParams } from 'react-router-dom';
import { ExternalLink, AlertTriangle } from 'lucide-react';
import { useState } from 'react';

export default function EmbedView() {
  const [searchParams] = useSearchParams();
  const url = searchParams.get('url') || '';
  const [loadError, setLoadError] = useState(false);

  if (!url) {
    return <div className="page-loading">No URL specified.</div>;
  }

  return (
    <div className="embed-page">
      <div className="embed-header">
        <span className="embed-url" title={url}>
          {url}
        </span>
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="embed-open-external"
          title="Open in browser"
        >
          <ExternalLink size={14} />
        </a>
      </div>

      {loadError ? (
        <div className="embed-error">
          <AlertTriangle size={20} />
          <p>This site cannot be embedded.</p>
          <a href={url} target="_blank" rel="noopener noreferrer">
            Open in browser instead
          </a>
        </div>
      ) : (
        <iframe
          src={url}
          className="embed-iframe"
          sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
          onError={() => setLoadError(true)}
          title={`Embedded: ${url}`}
        />
      )}
    </div>
  );
}
