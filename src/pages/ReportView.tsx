import { useParams, useNavigate } from 'react-router-dom';
import { useDoc } from '../db/hooks';
import type { Report } from '../db/types';
import { useRef, useEffect } from 'react';

export default function ReportView() {
  const { reportId } = useParams<{ reportId: string }>();
  const navigate = useNavigate();
  const { doc: report, loading } = useDoc<Report>(reportId || null);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  // Write HTML content into iframe
  useEffect(() => {
    if (report?.htmlContent && iframeRef.current) {
      const doc = iframeRef.current.contentDocument;
      if (doc) {
        doc.open();
        doc.write(report.htmlContent);
        doc.close();
      }
    }
  }, [report?.htmlContent]);

  if (loading) return <div className="page-loading">Loading…</div>;
  if (!report) return <div className="page-loading">Report not found.</div>;

  return (
    <div className="page report-view-page">
      <div className="report-view-header">
        <button className="btn" onClick={() => navigate(-1)}>
          ← Back
        </button>
        <h2 className="report-view-title">{report.title}</h2>
      </div>

      <iframe
        ref={iframeRef}
        className="report-iframe"
        sandbox="allow-same-origin"
        title={report.title}
      />
    </div>
  );
}
