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
    // Reports can take 2-3 minutes to generate — don't let the browser kill it early
    signal: AbortSignal.timeout(5 * 60 * 1000),
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
    signal: AbortSignal.timeout(60 * 1000),
  });

  if (!response.ok) {
    const body = await response.json().catch(() => null);
    const message = body?.error || `Server error (${response.status})`;
    throw new Error(message);
  }

  return response.json();
}
