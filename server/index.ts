import dotenv from 'dotenv';
import express from 'express';
import Anthropic from '@anthropic-ai/sdk';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Server } from 'node:http';

// Works in ESM (direct execution via tsx) and CJS (bundled by tsup for Electron)
const __dirname = typeof import.meta?.url === 'string' && import.meta.url.startsWith('file:')
  ? dirname(fileURLToPath(import.meta.url))
  : process.cwd();

// --- Mutable API clients (updated via updateKeys) ---

let anthropic: Anthropic | null = null;
let braveApiKey: string | null = null;

/**
 * Update API keys at runtime. Called by Electron main process via IPC,
 * or at startup in standalone mode.
 */
export function updateKeys(anthropicKey: string, brave?: string): void {
  if (anthropicKey) {
    anthropic = new Anthropic({ apiKey: anthropicKey });
  }
  braveApiKey = brave || null;
}

// --- Web search tools ---

async function executeWebSearch(query: string, count: number = 10): Promise<string> {
  if (!braveApiKey) {
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
          'X-Subscription-Token': braveApiKey,
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

// --- Skill file loading ---

function loadSkillFiles(skillsDir: string): { skillPrompt: string; htmlTemplate: string } {
  const skillPrompt = readFileSync(
    resolve(skillsDir, 'SKILL.md'),
    'utf-8'
  );
  const htmlTemplate = readFileSync(
    resolve(skillsDir, 'references', 'html-template.md'),
    'utf-8'
  );
  return { skillPrompt, htmlTemplate };
}

function buildSystemMessage(skillPrompt: string, htmlTemplate: string): string {
  const today = new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  return `${skillPrompt}

---

${htmlTemplate}

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

// --- Guard for routes that need an API key ---

function requireApiKey(res: express.Response): boolean {
  if (!anthropic) {
    res.status(503).json({ error: 'API key not configured. Open Settings to add your Anthropic API key.' });
    return false;
  }
  return true;
}

// --- Create the Express app and server ---

export function createServer(port: number, options?: {
  staticDir?: string;
  skillsDir?: string;
}): Promise<Server> {
  const skillsDir = options?.skillsDir ?? resolve(__dirname, '..', '.claude', 'skills', 'deep-research');
  const { skillPrompt, htmlTemplate } = loadSkillFiles(skillsDir);

  const app = express();
  app.use(express.json({ limit: '50mb' }));

  // Health check
  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', hasApiKey: !!anthropic, hasBraveKey: !!braveApiKey });
  });

  // Generate research report (agentic loop with web search tools)
  app.post('/api/research', async (req: express.Request, res: express.Response) => {
    if (!requireApiKey(res)) return;

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

        const response = await anthropic!.messages.create({
          model: 'claude-sonnet-4-6',
          max_tokens: 16000,
          system: buildSystemMessage(skillPrompt, htmlTemplate),
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

  // Chat with project context — streams tool events via SSE, then emits final response
  app.post('/api/chat', async (req: express.Request, res: express.Response) => {
    if (!requireApiKey(res)) return;

    const { messages, projectContext, summary: existingSummary } = req.body as {
      messages?: { role: string; content: string }[];
      projectContext?: { title: string; description: string; reportTitles: string[] };
      summary?: string;
    };

    // Validate before SSE headers so we can return a plain JSON error
    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      res.status(400).json({ error: 'Missing or empty "messages" array.' });
      return;
    }

    if (!projectContext?.title) {
      res.status(400).json({ error: 'Missing "projectContext.title".' });
      return;
    }

    // --- SSE setup ---
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no'); // disable Nginx buffering
    res.flushHeaders();

    const emit = (event: object) => {
      if (res.writableEnded) return;
      try {
        res.write('data: ' + JSON.stringify(event) + '\n\n');
      } catch {
        // Client disconnected mid-stream — ignore
      }
    };

    // Note: we do NOT use clientGone as a loop-exit condition — Vite's dev proxy
    // fires req 'close' when the request body is consumed (not when the SSE stream closes),
    // which would kill the loop before any Anthropic calls happen.
    // The emit() guard (res.writableEnded) handles the actual disconnect case.
    req.on('close', () => {
      console.log('[chat] Client disconnected or request closed.');
    });

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

    console.log(`[chat] Project "${projectContext.title}" — ${messages.length} messages, summary: ${existingSummary ? existingSummary.length + ' chars' : 'none'}`);

    try {
      // --- History management ---
      const CHAR_BUDGET = 400_000;
      const RECENT_KEEP = 20;

      let verbatimMessages = messages;
      let newSummary: string | null = null;
      let summarizedCount: number | null = null;

      const verbatimChars = messages.reduce((s, m) => s + m.content.length, 0);
      const totalChars = verbatimChars + (existingSummary?.length ?? 0);

      if (totalChars > CHAR_BUDGET && messages.length > RECENT_KEEP) {
        const recentMessages = messages.slice(-RECENT_KEEP);
        const oldMessages = messages.slice(0, -RECENT_KEEP);

        const parts: string[] = [];
        if (existingSummary) {
          parts.push(`Previous conversation summary:\n${existingSummary}`);
        }
        parts.push(
          `New conversation messages to incorporate:\n` +
          oldMessages
            .map((m) => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`)
            .join('\n\n')
        );

        console.log(`[chat] Summarizing ${oldMessages.length} old messages with Haiku…`);

        const summaryResp = await anthropic!.messages.create({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 1200,
          system: `You are a conversation summarizer for a research assistant chat. Produce a concise but thorough summary that preserves: topics discussed, questions asked and answered, research findings, key facts and decisions, and any important context. The summary will replace the original messages, so include everything needed to continue the conversation intelligently.`,
          messages: [{ role: 'user', content: parts.join('\n\n---\n\n') }],
        });

        const summaryText = summaryResp.content.find((b) => b.type === 'text');
        newSummary = summaryText?.type === 'text' ? summaryText.text.trim() : (existingSummary ?? '');
        summarizedCount = oldMessages.length;
        verbatimMessages = recentMessages;

        console.log(`[chat] Summary: ${oldMessages.length} messages → ${newSummary.length} chars`);
      }

      // Build the Anthropic message array: optional summary context + verbatim messages
      const summaryToUse = newSummary ?? existingSummary ?? null;
      let chatMessages: Anthropic.Messages.MessageParam[] = [];

      if (summaryToUse) {
        chatMessages = [
          { role: 'user', content: `[Earlier conversation summary — treat this as established context:\n\n${summaryToUse}]` },
          { role: 'assistant', content: 'Understood. I have the context from our earlier conversation and will continue from there.' },
        ];
      }

      chatMessages = [
        ...chatMessages,
        ...verbatimMessages.map((m) => ({
          role: m.role as 'user' | 'assistant',
          content: m.content,
        })),
      ];

      let finalText = '';
      let loopCount = 0;
      const MAX_LOOPS = 12;
      let lastResponse: Anthropic.Messages.Message | null = null;

      while (loopCount < MAX_LOOPS) {
        loopCount++;
        console.log(`[chat] Loop ${loopCount} — ${chatMessages.length} messages in context`);

        const response = await anthropic!.messages.create(
          {
            model: 'claude-sonnet-4-6',
            max_tokens: 4096,
            system: systemPrompt,
            tools: TOOLS,
            messages: chatMessages,
          },
          { timeout: 90_000 } // 90s per call — prevents silent hangs
        );
        lastResponse = response;
        console.log(`[chat] Loop ${loopCount} — stop_reason: ${response.stop_reason}`);

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

            // Emit tool event to the client before executing so the trace is live
            if (block.name === 'web_search') {
              emit({ type: 'tool', tool: 'web_search', query: input.query as string });
            } else if (block.name === 'read_page') {
              const url = input.url as string;
              let domain = url;
              try { domain = new URL(url).hostname; } catch { /* keep raw url */ }
              emit({ type: 'tool', tool: 'read_page', url, domain });
            }

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

      // If the loop ran out of turns, try to extract any text from the last response
      if (!finalText && lastResponse) {
        const fallback = lastResponse.content.find((b) => b.type === 'text');
        if (fallback && fallback.type === 'text') {
          finalText = fallback.text;
          console.log(`[chat] Used fallback text after hitting MAX_LOOPS (${MAX_LOOPS})`);
        }
      }

      if (!finalText) {
        emit({ type: 'error', message: 'No response produced.' });
        res.end();
        return;
      }

      console.log(`[chat] Response (${loopCount} loops): ${finalText.slice(0, 80)}...`);
      emit({
        type: 'response',
        content: finalText,
        ...(newSummary != null && summarizedCount != null
          ? { newSummary, summarizedCount }
          : {}),
      });
      res.end();
    } catch (err: unknown) {
      console.error('[chat] Failed:', err);
      const message = err instanceof Anthropic.APIError
        ? `Claude API error: ${err.message}`
        : err instanceof Error ? err.message : 'Unknown server error.';
      emit({ type: 'error', message });
      res.end();
    }
  });

  // Generate a short chat title using Haiku
  app.post('/api/generate-title', async (req: express.Request, res: express.Response) => {
    if (!requireApiKey(res)) return;

    const { firstMessage } = req.body as { firstMessage?: string };

    if (!firstMessage || typeof firstMessage !== 'string' || firstMessage.trim().length === 0) {
      res.status(400).json({ error: 'Missing "firstMessage" field.' });
      return;
    }

    console.log(`[generate-title] Generating title for: "${firstMessage.slice(0, 60)}..."`);

    try {
      const response = await anthropic!.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 30,
        messages: [
          {
            role: 'user',
            content: `Generate a short title (4–6 words) for a research chat that starts with:\n\n"${firstMessage.slice(0, 500)}"\n\nReturn ONLY the title. No quotes, no punctuation at the end, no explanation.`,
          },
        ],
      });

      const textBlock = response.content.find((b) => b.type === 'text');
      const title = textBlock?.type === 'text' ? textBlock.text.trim() : firstMessage.slice(0, 50);

      console.log(`[generate-title] → "${title}"`);
      res.json({ title });
    } catch (err: unknown) {
      console.error('[generate-title] Failed:', err);

      if (err instanceof Anthropic.APIError) {
        res.status(err.status || 500).json({ error: `Claude API error: ${err.message}` });
        return;
      }

      res.status(500).json({ error: err instanceof Error ? err.message : 'Unknown error.' });
    }
  });

  // Quick single-turn (or multi-turn) question answered by Haiku
  app.post('/api/quick-question', async (req: express.Request, res: express.Response) => {
    if (!requireApiKey(res)) return;

    const { question, history } = req.body as {
      question?: string;
      history?: { role: string; content: string }[];
    };

    if (!question?.trim()) {
      res.status(400).json({ error: 'Missing "question".' });
      return;
    }

    console.log(`[quick-question] "${question.slice(0, 60)}"`);

    try {
      const messages: Anthropic.Messages.MessageParam[] = [
        ...(history || []).map((m) => ({
          role: m.role as 'user' | 'assistant',
          content: m.content,
        })),
        { role: 'user' as const, content: question.trim() },
      ];

      const response = await anthropic!.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 400,
        system: `You are a fast, concise reference assistant. Answer questions briefly and directly — definitions, facts, names, places, concepts. No preamble or filler. Use markdown only when genuinely helpful (e.g., a short list or inline code).`,
        messages,
      });

      const text = response.content.find((b) => b.type === 'text');
      const answer = text?.type === 'text' ? text.text.trim() : 'No response.';

      console.log(`[quick-question] → ${answer.slice(0, 60)}`);
      res.json({ answer });
    } catch (err: unknown) {
      console.error('[quick-question] Failed:', err);

      if (err instanceof Anthropic.APIError) {
        res.status(err.status || 500).json({ error: `Claude API error: ${err.message}` });
        return;
      }

      res.status(500).json({ error: err instanceof Error ? err.message : 'Unknown error.' });
    }
  });

  // --- Static file serving for Electron production mode ---
  const staticDir = options?.staticDir;
  if (staticDir) {
    app.use(express.static(staticDir));
    // SPA catch-all: any non-API route returns index.html
    app.get('{*splat}', (req, res) => {
      if (!req.path.startsWith('/api')) {
        res.sendFile(resolve(staticDir, 'index.html'));
      }
    });
  }

  // --- Start listening ---
  return new Promise<Server>((resolvePromise, reject) => {
    const server = app.listen(port, () => {
      console.log(`\n  Research API server running on http://localhost:${port}`);
      console.log(`  Health check: http://localhost:${port}/api/health\n`);
      resolvePromise(server);
    });

    server.on('error', (err: NodeJS.ErrnoException) => {
      if (err.code === 'EADDRINUSE') {
        console.error(`\n  Port ${port} is already in use.`);
        console.error(`  Kill the other process first:  lsof -ti:${port} | xargs kill\n`);
      } else {
        console.error('[server] Failed to start:', err);
      }
      reject(err);
    });

    server.keepAliveTimeout = 600_000;
    server.headersTimeout = 600_000;
  });
}

// --- Direct execution (standalone web dev mode) ---
// When run directly via `npm run server` / `tsx watch server/index.ts`

const isDirectExecution = process.argv[1]
  && !process.versions.electron
  && fileURLToPath(import.meta.url).includes(process.argv[1].replace(/\\/g, '/'));

if (isDirectExecution) {
  dotenv.config({ path: resolve(__dirname, '..', '.env'), override: true });

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

  updateKeys(API_KEY, process.env.BRAVE_SEARCH_API_KEY);

  if (!process.env.BRAVE_SEARCH_API_KEY) {
    console.warn(
      '\n  Warning: BRAVE_SEARCH_API_KEY not set.\n' +
      '  Reports will be generated without web search.\n' +
      '  Get a key at https://brave.com/search/api/\n'
    );
  }

  const PORT = Number(process.env.PORT) || 3001;

  createServer(PORT).catch(() => process.exit(1));

  // --- Catch silent crashes ---
  process.on('uncaughtException', (err) => {
    console.error('[server] Uncaught exception:', err);
  });

  process.on('unhandledRejection', (err) => {
    console.error('[server] Unhandled rejection:', err);
  });
}
