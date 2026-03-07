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

export async function generateChatTitle(firstMessage: string): Promise<string> {
  try {
    const response = await fetch('/api/generate-title', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ firstMessage }),
      signal: AbortSignal.timeout(15_000),
    });

    if (!response.ok) return firstMessage.slice(0, 50) + (firstMessage.length > 50 ? '…' : '');
    const data = await response.json();
    return data.title || firstMessage.slice(0, 50);
  } catch {
    return firstMessage.slice(0, 50) + (firstMessage.length > 50 ? '…' : '');
  }
}

// --- Quick Lookup ---

export interface QuickQAEntry {
  role: 'user' | 'assistant';
  content: string;
}

export async function quickQuestion(
  question: string,
  history: QuickQAEntry[] = []
): Promise<{ answer: string }> {
  const response = await fetch('/api/quick-question', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ question, history }),
    signal: AbortSignal.timeout(20_000),
  });

  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new Error(body?.error || `Server error (${response.status})`);
  }

  return response.json();
}

export interface SendChatResult {
  content: string;
  /** Updated summary if old messages were compressed during this request. */
  newSummary?: string;
  /** Number of messages (from the slice sent) that are now covered by newSummary. */
  summarizedCount?: number;
}

export interface ChatToolEvent {
  type: 'tool';
  tool: 'web_search' | 'read_page';
  /** Populated when tool === 'web_search' */
  query?: string;
  /** Populated when tool === 'read_page' */
  url?: string;
  domain?: string;
}

export async function sendChatMessage(
  messages: ChatMessageInput[],
  projectContext: ProjectContext,
  summary?: string,
  onTool?: (event: ChatToolEvent) => void,
): Promise<SendChatResult> {
  const response = await fetch('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages, projectContext, summary }),
    // Chat may do 1-2 web searches before responding
    signal: AbortSignal.timeout(2 * 60 * 1000),
  });

  if (!response.ok) {
    const body = await response.json().catch(() => null);
    const message = body?.error || `Server error (${response.status})`;
    throw new Error(message);
  }

  // Read the SSE stream line by line
  if (!response.body) throw new Error('No response body.');
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    // Keep the last (possibly incomplete) line in the buffer
    buffer = lines.pop() ?? '';

    for (const line of lines) {
      if (!line.startsWith('data: ')) continue;
      const json = line.slice(6).trim();
      if (!json) continue;

      let event: { type: string; [key: string]: unknown };
      try { event = JSON.parse(json); } catch { continue; }

      if (event.type === 'tool' && onTool) {
        onTool(event as unknown as ChatToolEvent);
      } else if (event.type === 'response') {
        return {
          content: event.content as string,
          newSummary: event.newSummary as string | undefined,
          summarizedCount: event.summarizedCount as number | undefined,
        };
      } else if (event.type === 'error') {
        throw new Error(event.message as string);
      }
    }
  }

  throw new Error('Stream ended without a response.');
}
