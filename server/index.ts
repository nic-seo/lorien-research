import dotenv from 'dotenv';
import express from 'express';
import Anthropic from '@anthropic-ai/sdk';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// --- Load .env explicitly from project root ---
dotenv.config({ path: resolve(__dirname, '..', '.env'), override: true });

// --- Config ---

const PORT = process.env.PORT || 3001;
const API_KEY = process.env.ANTHROPIC_API_KEY;

if (!API_KEY || API_KEY === 'your-api-key-here') {
  console.error(
    '\n  Missing ANTHROPIC_API_KEY.\n' +
    '  Copy server/.env.example to .env and add your key:\n\n' +
    '    cp server/.env.example .env\n' +
    '    # then edit .env with your key\n'
  );
  process.exit(1);
}

const BRAVE_API_KEY = process.env.BRAVE_SEARCH_API_KEY;

if (!BRAVE_API_KEY) {
  console.warn(
    '\n  Warning: BRAVE_SEARCH_API_KEY not set.\n' +
    '  Reports will be generated without web search.\n' +
    '  Get a key at https://brave.com/search/api/\n'
  );
}

const anthropic = new Anthropic({ apiKey: API_KEY });

// --- Web search tools ---

async function executeWebSearch(query: string, count: number = 10): Promise<string> {
  if (!BRAVE_API_KEY) {
    return 'Error: BRAVE_SEARCH_API_KEY not configured. Cannot search the web.';
  }

  const params = new URLSearchParams({
    q: query,
    count: String(Math.min(Math.max(count, 1), 20)),
  });

  try {
    const response = await fetch(
      `https://api.search.brave.com/res/v1/web/search?${params}`,
      {
        headers: {
          Accept: 'application/json',
          'Accept-Encoding': 'gzip',
          'X-Subscription-Token': BRAVE_API_KEY,
        },
        signal: AbortSignal.timeout(15_000),
      }
    );

    if (!response.ok) {
      return `Search error: ${response.status} ${response.statusText}`;
    }

    const data = (await response.json()) as {
      web?: { results?: { title: string; url: string; description: string }[] };
    };
    const results = data.web?.results || [];

    if (results.length === 0) {
      return 'No results found.';
    }

    return results
      .map((r, i) => `[${i + 1}] ${r.title}\n    ${r.url}\n    ${r.description}`)
      .join('\n\n');
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      return 'Search timed out after 15s.';
    }
    return `Search error: ${err instanceof Error ? err.message : 'Unknown error'}`;
  }
}

async function executeReadPage(url: string): Promise<string> {
  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; LorienResearch/1.0)',
        Accept: 'text/html,application/xhtml+xml',
      },
      signal: AbortSignal.timeout(10_000),
      redirect: 'follow',
    });

    if (!response.ok) {
      return `Error fetching URL: ${response.status} ${response.statusText}`;
    }

    const contentType = response.headers.get('content-type') || '';
    if (!contentType.includes('text/html') && !contentType.includes('text/plain')) {
      return `Unsupported content type: ${contentType}. Can only read HTML/text pages.`;
    }

    const html = await response.text();

    const text = html
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<nav[\s\S]*?<\/nav>/gi, '')
      .replace(/<footer[\s\S]*?<\/footer>/gi, '')
      .replace(/<header[\s\S]*?<\/header>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/\s+/g, ' ')
      .trim();

    const MAX_CHARS = 8000;
    if (text.length > MAX_CHARS) {
      return text.slice(0, MAX_CHARS) + '\n\n[...truncated — page content exceeded 8000 characters]';
    }

    return text || 'Could not extract text content from this page.';
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      return 'Error: Page took too long to load (timeout after 10s).';
    }
    return `Error reading page: ${err instanceof Error ? err.message : 'Unknown error'}`;
  }
}

const TOOLS: Anthropic.Messages.Tool[] = [
  {
    name: 'web_search',
    description:
      'Search the web using Brave Search. Returns titles, URLs, and snippets for the top results. ' +
      'Use multiple searches with different queries to get broad coverage of a topic.',
    input_schema: {
      type: 'object' as const,
      properties: {
        query: {
          type: 'string',
          description: 'The search query.',
        },
        count: {
          type: 'number',
          description: 'Number of results to return (1-20, default 10).',
        },
      },
      required: ['query'],
    },
  },
  {
    name: 'read_page',
    description:
      'Fetch a URL and extract its readable text content. Use this when a search snippet looks promising ' +
      'and you want to read the full article. Returns text truncated to ~8000 characters.',
    input_schema: {
      type: 'object' as const,
      properties: {
        url: {
          type: 'string',
          description: 'The URL to fetch and extract text from.',
        },
      },
      required: ['url'],
    },
  },
];

// --- Load skill files once at startup ---

const SKILL_PROMPT = readFileSync(
  resolve(__dirname, '..', '.claude', 'skills', 'deep-research', 'SKILL.md'),
  'utf-8'
);

const HTML_TEMPLATE = readFileSync(
  resolve(__dirname, '..', '.claude', 'skills', 'deep-research', 'references', 'html-template.md'),
  'utf-8'
);

function buildSystemMessage(): string {
  const today = new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  return `${SKILL_PROMPT}

---

${HTML_TEMPLATE}

---

TODAY'S DATE: ${today}

CRITICAL INSTRUCTIONS:
- You are generating a report to be stored in a web application.
- Return ONLY the complete HTML document. No markdown fences, no explanation, no preamble.
- The response must start with <!DOCTYPE html> and end with </html>.
- The report must be fully self-contained (inline CSS, inline JS, Google Fonts link).
- Follow the HTML template and CSS from the reference above EXACTLY.

RESEARCH TOOLS:
- You have access to web_search and read_page tools for conducting real web research.
- Today's date is ${today}. Use the current year when searching — do NOT default to older years.
- Use web_search to run multiple targeted searches covering different angles of the topic.
- Use read_page to fetch and read full article content when a search snippet looks promising.
- Conduct thorough research FIRST, THEN produce the HTML report.
- Cite your sources in the report with proper URLs from your research.
- After finishing all research, output the complete HTML report as your final response.
- EFFICIENCY: Aim for 3-5 web searches and only read pages that are essential. Do not exhaustively read every search result — snippets are often sufficient. Finish research within 6-8 tool calls total.
`;
}

// --- Express app ---

const app = express();
app.use(express.json());

// Health check
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok' });
});

// Generate research report (agentic loop with web search tools)
app.post('/api/research', async (req: express.Request, res: express.Response) => {
  const { query } = req.body as { query?: string };

  if (!query || typeof query !== 'string' || query.trim().length === 0) {
    res.status(400).json({ error: 'Missing or empty "query" field.' });
    return;
  }

  console.log(`[research] Starting report for: "${query.slice(0, 80)}..."`);
  const startTime = Date.now();

  try {
    const messages: Anthropic.Messages.MessageParam[] = [
      {
        role: 'user',
        content: `Research the following topic and produce a complete HTML report:\n\n${query}`,
      },
    ];

    let finalHtml = '';
    let loopCount = 0;
    const MAX_LOOPS = 10;

    while (loopCount < MAX_LOOPS) {
      loopCount++;
      console.log(`[research] Loop ${loopCount} — sending ${messages.length} messages`);

      const response = await anthropic.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 16000,
        system: buildSystemMessage(),
        tools: TOOLS,
        messages,
      });

      // Claude is done — extract the final HTML
      if (response.stop_reason === 'end_turn') {
        const textBlock = response.content.find((b) => b.type === 'text');
        if (textBlock && textBlock.type === 'text') {
          finalHtml = textBlock.text.trim();
        }
        break;
      }

      // Claude wants to use tools — execute them and continue
      if (response.stop_reason === 'tool_use') {
        messages.push({ role: 'assistant', content: response.content });

        const toolResults: Anthropic.Messages.ToolResultBlockParam[] = [];

        for (const block of response.content) {
          if (block.type !== 'tool_use') continue;

          const input = block.input as Record<string, unknown>;
          console.log(`[research]   Tool: ${block.name}(${JSON.stringify(input).slice(0, 120)})`);

          let result: string;
          if (block.name === 'web_search') {
            result = await executeWebSearch(
              input.query as string,
              (input.count as number) || 10
            );
          } else if (block.name === 'read_page') {
            result = await executeReadPage(input.url as string);
          } else {
            result = `Unknown tool: ${block.name}`;
          }

          toolResults.push({
            type: 'tool_result',
            tool_use_id: block.id,
            content: result,
          });
        }

        messages.push({ role: 'user', content: toolResults });
        continue;
      }

      // Unexpected stop reason (e.g. max_tokens) — take what we have
      console.log(`[research] Unexpected stop_reason: ${response.stop_reason}`);
      const textBlock = response.content.find((b) => b.type === 'text');
      if (textBlock && textBlock.type === 'text') {
        finalHtml = textBlock.text.trim();
      }
      break;
    }

    if (!finalHtml) {
      res.status(500).json({ error: 'No HTML content produced.' });
      return;
    }

    // Strip markdown fences if Claude wrapped the HTML anyway
    if (finalHtml.startsWith('```html')) {
      finalHtml = finalHtml.slice(7);
    } else if (finalHtml.startsWith('```')) {
      finalHtml = finalHtml.slice(3);
    }
    if (finalHtml.endsWith('```')) {
      finalHtml = finalHtml.slice(0, -3);
    }
    finalHtml = finalHtml.trim();

    // Extract title from the HTML
    const titleMatch = finalHtml.match(/<title>(.*?)<\/title>/i);
    const title = titleMatch?.[1] || 'Untitled Report';

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`[research] Done in ${elapsed}s (${loopCount} loops) — "${title}"`);

    res.json({ htmlContent: finalHtml, title });
  } catch (err: unknown) {
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.error(`[research] Failed after ${elapsed}s:`, err);

    if (err instanceof Anthropic.APIError) {
      res.status(err.status || 500).json({
        error: `Claude API error: ${err.message}`,
      });
      return;
    }

    res.status(500).json({
      error: err instanceof Error ? err.message : 'Unknown server error.',
    });
  }
});

// Chat with project context
app.post('/api/chat', async (req: express.Request, res: express.Response) => {
  const { messages, projectContext } = req.body as {
    messages?: { role: string; content: string }[];
    projectContext?: { title: string; description: string; reportTitles: string[] };
  };

  if (!messages || !Array.isArray(messages) || messages.length === 0) {
    res.status(400).json({ error: 'Missing or empty "messages" array.' });
    return;
  }

  if (!projectContext?.title) {
    res.status(400).json({ error: 'Missing "projectContext.title".' });
    return;
  }

  // Build system prompt with project context
  const today = new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  let systemPrompt = `You are a research assistant for the project "${projectContext.title}". Today's date is ${today}.`;

  if (projectContext.description) {
    systemPrompt += `\n\nProject description: ${projectContext.description}`;
  }

  if (projectContext.reportTitles && projectContext.reportTitles.length > 0) {
    systemPrompt += `\n\nReports generated so far:\n${projectContext.reportTitles.map((t) => `- ${t}`).join('\n')}`;
  }

  systemPrompt += `\n\nHelp the user explore this topic. Be concise, direct, and useful. When referencing reports, mention them by title. You can suggest new research directions, answer questions about the topic, and help the user think through their research.`;
  systemPrompt += `\n\nYou have access to web_search and read_page tools. Use them when the user asks about current events, recent developments, or anything that benefits from up-to-date information. For general knowledge questions you can answer confidently, respond directly without searching. Keep searches focused — 1-2 searches is usually enough for a chat response.`;

  console.log(`[chat] Message for project "${projectContext.title}" (${messages.length} messages)`);

  try {
    const chatMessages: Anthropic.Messages.MessageParam[] = messages.map((m) => ({
      role: m.role as 'user' | 'assistant',
      content: m.content,
    }));

    let finalText = '';
    let loopCount = 0;
    const MAX_LOOPS = 5;

    while (loopCount < MAX_LOOPS) {
      loopCount++;

      const response = await anthropic.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 4096,
        system: systemPrompt,
        tools: TOOLS,
        messages: chatMessages,
      });

      if (response.stop_reason === 'end_turn') {
        const textBlock = response.content.find((b) => b.type === 'text');
        if (textBlock && textBlock.type === 'text') {
          finalText = textBlock.text;
        }
        break;
      }

      if (response.stop_reason === 'tool_use') {
        chatMessages.push({ role: 'assistant', content: response.content });

        const toolResults: Anthropic.Messages.ToolResultBlockParam[] = [];

        for (const block of response.content) {
          if (block.type !== 'tool_use') continue;

          const input = block.input as Record<string, unknown>;
          console.log(`[chat]   Tool: ${block.name}(${JSON.stringify(input).slice(0, 120)})`);

          let result: string;
          if (block.name === 'web_search') {
            result = await executeWebSearch(
              input.query as string,
              (input.count as number) || 10
            );
          } else if (block.name === 'read_page') {
            result = await executeReadPage(input.url as string);
          } else {
            result = `Unknown tool: ${block.name}`;
          }

          toolResults.push({
            type: 'tool_result',
            tool_use_id: block.id,
            content: result,
          });
        }

        chatMessages.push({ role: 'user', content: toolResults });
        continue;
      }

      // Unexpected stop reason — take what we have
      const textBlock = response.content.find((b) => b.type === 'text');
      if (textBlock && textBlock.type === 'text') {
        finalText = textBlock.text;
      }
      break;
    }

    if (!finalText) {
      res.status(500).json({ error: 'No response produced.' });
      return;
    }

    console.log(`[chat] Response (${loopCount} loops): ${finalText.slice(0, 80)}...`);
    res.json({ content: finalText });
  } catch (err: unknown) {
    console.error('[chat] Failed:', err);

    if (err instanceof Anthropic.APIError) {
      res.status(err.status || 500).json({
        error: `Claude API error: ${err.message}`,
      });
      return;
    }

    res.status(500).json({
      error: err instanceof Error ? err.message : 'Unknown server error.',
    });
  }
});

// --- Catch silent crashes ---

process.on('uncaughtException', (err) => {
  console.error('[server] Uncaught exception:', err);
});

process.on('unhandledRejection', (err) => {
  console.error('[server] Unhandled rejection:', err);
});

// --- Start ---

const server = app.listen(PORT, () => {
  console.log(`\n  Research API server running on http://localhost:${PORT}`);
  console.log(`  Health check: http://localhost:${PORT}/api/health\n`);
});

server.on('error', (err: NodeJS.ErrnoException) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`\n  Port ${PORT} is already in use.`);
    console.error(`  Kill the other process first:  lsof -ti:${PORT} | xargs kill\n`);
  } else {
    console.error('[server] Failed to start:', err);
  }
  process.exit(1);
});

server.keepAliveTimeout = 600_000;
server.headersTimeout = 600_000;
