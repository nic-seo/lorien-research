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

const anthropic = new Anthropic({ apiKey: API_KEY });

// --- Load skill files once at startup ---

const SKILL_PROMPT = readFileSync(
  resolve(__dirname, '..', '.claude', 'skills', 'deep-research', 'SKILL.md'),
  'utf-8'
);

const HTML_TEMPLATE = readFileSync(
  resolve(__dirname, '..', '.claude', 'skills', 'deep-research', 'references', 'html-template.md'),
  'utf-8'
);

const SYSTEM_MESSAGE = `${SKILL_PROMPT}

---

${HTML_TEMPLATE}

---

CRITICAL INSTRUCTIONS:
- You are generating a report to be stored in a web application.
- Return ONLY the complete HTML document. No markdown fences, no explanation, no preamble.
- The response must start with <!DOCTYPE html> and end with </html>.
- The report must be fully self-contained (inline CSS, inline JS, Google Fonts link).
- Follow the HTML template and CSS from the reference above EXACTLY.
`;

// --- Express app ---

const app = express();
app.use(express.json());

// Health check
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok' });
});

// Generate research report
app.post('/api/research', async (req: express.Request, res: express.Response) => {
  const { query } = req.body as { query?: string };

  if (!query || typeof query !== 'string' || query.trim().length === 0) {
    res.status(400).json({ error: 'Missing or empty "query" field.' });
    return;
  }

  console.log(`[research] Starting report for: "${query.slice(0, 80)}..."`);
  const startTime = Date.now();

  try {
    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 16000,
      system: SYSTEM_MESSAGE,
      messages: [
        {
          role: 'user',
          content: `Research the following topic and produce a complete HTML report:\n\n${query}`,
        },
      ],
    });

    // Extract text content from response
    const textBlock = message.content.find((block) => block.type === 'text');
    if (!textBlock || textBlock.type !== 'text') {
      res.status(500).json({ error: 'No text content in Claude response.' });
      return;
    }

    let htmlContent = textBlock.text.trim();

    // Strip markdown fences if Claude wrapped the HTML anyway
    if (htmlContent.startsWith('```html')) {
      htmlContent = htmlContent.slice(7);
    } else if (htmlContent.startsWith('```')) {
      htmlContent = htmlContent.slice(3);
    }
    if (htmlContent.endsWith('```')) {
      htmlContent = htmlContent.slice(0, -3);
    }
    htmlContent = htmlContent.trim();

    // Extract title from the HTML
    const titleMatch = htmlContent.match(/<title>(.*?)<\/title>/i);
    const title = titleMatch?.[1] || 'Untitled Report';

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`[research] Done in ${elapsed}s — "${title}"`);

    res.json({ htmlContent, title });
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
  let systemPrompt = `You are a research assistant for the project "${projectContext.title}".`;

  if (projectContext.description) {
    systemPrompt += `\n\nProject description: ${projectContext.description}`;
  }

  if (projectContext.reportTitles && projectContext.reportTitles.length > 0) {
    systemPrompt += `\n\nReports generated so far:\n${projectContext.reportTitles.map((t) => `- ${t}`).join('\n')}`;
  }

  systemPrompt += `\n\nHelp the user explore this topic. Be concise, direct, and useful. When referencing reports, mention them by title. You can suggest new research directions, answer questions about the topic, and help the user think through their research.`;

  console.log(`[chat] Message for project "${projectContext.title}" (${messages.length} messages)`);

  try {
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4096,
      system: systemPrompt,
      messages: messages.map((m) => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
      })),
    });

    const textBlock = response.content.find((block) => block.type === 'text');
    if (!textBlock || textBlock.type !== 'text') {
      res.status(500).json({ error: 'No text content in Claude response.' });
      return;
    }

    console.log(`[chat] Response: ${textBlock.text.slice(0, 80)}...`);
    res.json({ content: textBlock.text });
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

server.keepAliveTimeout = 120000;
server.headersTimeout = 120000;
