import { useSearchParams } from 'react-router-dom';
import { ExternalLink, AlertTriangle } from 'lucide-react';
import { useState } from 'react';

/** Domains that refuse iframe embedding — show fallback immediately. */
const IFRAME_BLOCKED_HOSTS = new Set([
  'x.com', 'www.x.com',
  'twitter.com', 'www.twitter.com', 't.co',
  'instagram.com', 'www.instagram.com',
  'facebook.com', 'www.facebook.com',
  'linkedin.com', 'www.linkedin.com',
]);

function isIframeBlocked(url: string): boolean {
  try {
    return IFRAME_BLOCKED_HOSTS.has(new URL(url).hostname.toLowerCase());
  } catch {
    return false;
  }
}

export default function EmbedView() {
  const [searchParams] = useSearchParams();
  const url = searchParams.get('url') || '';
  const [loadError, setLoadError] = useState(false);

  if (!url) {
    return <div className="page-loading">No URL specified.</div>;
  }

  const blocked = isIframeBlocked(url) || loadError;

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

      {blocked ? (
        <div className="embed-error">
          <AlertTriangle size={20} />
          <p>This site can't be embedded.</p>
          <a href={url} target="_blank" rel="noopener noreferrer">
            Open in browser
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
