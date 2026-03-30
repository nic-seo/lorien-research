/**
 * printDoc.ts — generates print-ready HTML and exports as PDF.
 *
 * In Electron: silently saves a PDF to the Downloads folder via the main
 * process `print-to-pdf` IPC handler (no print dialog).
 *
 * In a plain browser: falls back to window.open + window.print().
 *
 * Reports already have a complete self-contained HTML template, so we just
 * pass them through. Notes and chats get a clean hand-crafted print template
 * that follows the app's "Japanese Highlighter" design language.
 */

import type { ChatMessage } from '../db/types';

// ── Core export ─────────────────────────────────────────────────────────────

/**
 * Export `html` as a PDF named `title`.pdf.
 * In Electron this is silent (no dialog); in a browser it opens the print dialog.
 */
export async function printHtml(html: string, title = 'document'): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const api = (window as any).electronAPI;
  if (api?.printToPdf) {
    await api.printToPdf(title, html);
    return;
  }
  // Fallback: browser print dialog
  const win = window.open('', '_blank');
  if (!win) return;
  win.document.write(html);
  win.document.close();
  win.focus();
  setTimeout(() => win.print(), 400);
}

// ── Shared print CSS ────────────────────────────────────────────────────────

const FONT_LINK = `<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:ital,wght@0,400;0,600;1,400&display=swap" rel="stylesheet">`;

const BASE_CSS = `
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: 'IBM Plex Mono', monospace;
    font-size: 12px;
    line-height: 1.8;
    color: #1a1a1a;
    background: #f7f6f3;
    max-width: 700px;
    margin: 48px auto;
    padding: 0 32px 80px;
  }
  @media print {
    body { background: white; margin: 0; max-width: 100%; }
  }
  .doc-title {
    font-size: 18px;
    font-weight: 600;
    letter-spacing: -0.3px;
    margin-bottom: 32px;
    padding-bottom: 4px;
    display: inline;
    background-image: linear-gradient(transparent 62%, rgba(168,213,186,0.65) 62%);
  }
  .doc-title.pink {
    background-image: linear-gradient(transparent 62%, rgba(240,184,200,0.65) 62%);
  }
  .doc-title.blue {
    background-image: linear-gradient(transparent 62%, rgba(168,200,232,0.65) 62%);
  }
  .title-wrap { margin-bottom: 32px; }
  .meta {
    font-size: 10px;
    color: #888;
    margin-top: 8px;
  }
  hr { border: none; border-top: 1px solid #e0ddd8; margin: 24px 0; }
  h1 { font-size: 15px; font-weight: 600; margin: 24px 0 8px; }
  h2 { font-size: 13px; font-weight: 600; margin: 20px 0 6px; }
  h3 { font-size: 12px; font-weight: 600; margin: 16px 0 4px; }
  p  { margin-bottom: 0.85em; }
  ul, ol { padding-left: 1.4em; margin-bottom: 0.85em; }
  li { margin-bottom: 0.3em; }
  blockquote {
    border-left: 3px solid #a8d5ba;
    padding-left: 12px;
    color: #555;
    margin: 12px 0;
  }
  code {
    font-family: 'IBM Plex Mono', monospace;
    font-size: 11px;
    background: #eeece8;
    padding: 1px 4px;
    border-radius: 3px;
  }
  pre {
    background: #eeece8;
    padding: 12px;
    border-radius: 4px;
    overflow: auto;
    margin: 12px 0;
  }
  pre code { background: none; padding: 0; }
  strong { font-weight: 600; }
  em { font-style: italic; }
  a  { color: #1a1a1a; text-decoration: underline; }
  table {
    width: 100%;
    border-collapse: collapse;
    margin: 12px 0;
    font-size: 11px;
  }
  th, td {
    border: 1px solid #c8c4bc;
    padding: 6px 10px;
    text-align: left;
    vertical-align: top;
  }
  th {
    background: #eeece8;
    font-weight: 600;
  }
  tr:nth-child(even) td { background: #f5f4f1; }
`;

// ── Report ──────────────────────────────────────────────────────────────────

/**
 * Reports are stored as complete self-contained HTML — just export as-is.
 */
export async function printReport(htmlContent: string, title = 'Report'): Promise<void> {
  await printHtml(htmlContent, title);
}

// ── Note ────────────────────────────────────────────────────────────────────

export async function printNote(title: string, bodyHtml: string): Promise<void> {
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escHtml(title)}</title>
  ${FONT_LINK}
  <style>${BASE_CSS}</style>
</head>
<body>
  <div class="title-wrap">
    <span class="doc-title">${escHtml(title)}</span>
    <div class="meta">Note · ${formatDate(new Date())}</div>
  </div>
  <hr>
  <div class="body-content">${bodyHtml}</div>
</body>
</html>`;
  await printHtml(html, title);
}

// ── Chat ────────────────────────────────────────────────────────────────────

export async function printChat(title: string, projectTitle: string, messages: ChatMessage[]): Promise<void> {
  const messagesHtml = messages.map((msg) => {
    const isUser = msg.role === 'user';
    return `
    <div class="message ${isUser ? 'message-user' : 'message-assistant'}">
      <div class="message-label">${isUser ? 'You' : 'Assistant'}</div>
      <div class="message-body">${escHtml(msg.content).replace(/\n/g, '<br>')}</div>
    </div>`;
  }).join('');

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escHtml(title)}</title>
  ${FONT_LINK}
  <style>
    ${BASE_CSS}
    .doc-title { background-image: linear-gradient(transparent 62%, rgba(168,200,232,0.65) 62%); }
    .message { margin-bottom: 20px; }
    .message-label {
      font-size: 10px;
      font-weight: 600;
      letter-spacing: 0.5px;
      text-transform: uppercase;
      color: #888;
      margin-bottom: 4px;
    }
    .message-user .message-label  { color: #5a8fa8; }
    .message-assistant .message-label { color: #888; }
    .message-body {
      font-size: 12px;
      line-height: 1.8;
      white-space: pre-wrap;
    }
    .message-user .message-body {
      background: rgba(168,200,232,0.15);
      border-left: 3px solid rgba(168,200,232,0.65);
      padding: 8px 12px;
      border-radius: 0 4px 4px 0;
    }
    hr { margin: 16px 0; }
  </style>
</head>
<body>
  <div class="title-wrap">
    <span class="doc-title">${escHtml(title)}</span>
    <div class="meta">${escHtml(projectTitle)} · ${formatDate(new Date())} · ${messages.length} messages</div>
  </div>
  <hr>
  ${messagesHtml}
</body>
</html>`;
  await printHtml(html, title);
}

// ── Utilities ───────────────────────────────────────────────────────────────

function escHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatDate(d: Date): string {
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
}
