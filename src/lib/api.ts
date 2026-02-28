// API client for the research server

export interface GenerateReportResult {
  htmlContent: string;
  title: string;
}

export async function generateReport(query: string): Promise<GenerateReportResult> {
  const response = await fetch('/api/research', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
    // Reports with web search can take up to 10 minutes (multiple search + read cycles)
    signal: AbortSignal.timeout(10 * 60 * 1000),
  });

  if (!response.ok) {
    const body = await response.json().catch(() => null);
    const message = body?.error || `Server error (${response.status})`;
    throw new Error(message);
  }

  return response.json();
}

// --- Chat ---

export interface ChatMessageInput {
  role: 'user' | 'assistant';
  content: string;
}

export interface ProjectContext {
  title: string;
  description: string;
  reportTitles: string[];
}

export async function sendChatMessage(
  messages: ChatMessageInput[],
  projectContext: ProjectContext
): Promise<{ content: string }> {
  const response = await fetch('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages, projectContext }),
    // Chat may do 1-2 web searches before responding
    signal: AbortSignal.timeout(2 * 60 * 1000),
  });

  if (!response.ok) {
    const body = await response.json().catch(() => null);
    const message = body?.error || `Server error (${response.status})`;
    throw new Error(message);
  }

  return response.json();
}
