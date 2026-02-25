import { db } from './index';
import { ulid } from '../lib/ulid';
import type { AnyDoc } from './types';

const SEED_KEY = 'research-workspace-seeded';

export async function seedIfEmpty() {
  // Only seed once
  if (localStorage.getItem(SEED_KEY)) return;

  // Check if there are already docs
  const existing = await db.allDocs({ limit: 1 });
  if (existing.rows.length > 0) {
    localStorage.setItem(SEED_KEY, 'true');
    return;
  }

  const now = new Date().toISOString();
  const projectId = `project:${ulid()}`;

  const docs: AnyDoc[] = [
    // --- Project ---
    {
      _id: projectId,
      type: 'project',
      title: 'Context Engineering',
      description: 'Research on prompt engineering, context windows, and how to structure information for LLMs. Covers tool design, RAG patterns, and agentic workflows.',
      tags: ['AI', 'LLMs', 'prompt-engineering', 'agents'],
      createdAt: now,
      updatedAt: now,
    } as AnyDoc,

    // --- Report ---
    {
      _id: `report:${ulid()}`,
      type: 'report',
      projectId,
      title: 'Context Engineering: The Next Frontier of AI Development',
      htmlContent: getSeedReportHTML(),
      sourceQuery: 'context engineering AI development',
      tags: ['context-engineering', 'overview'],
      createdAt: now,
      updatedAt: now,
    } as AnyDoc,

    // --- Notes ---
    {
      _id: `note:${ulid()}`,
      type: 'note',
      projectId,
      title: 'Key insight: Context is the new programming',
      content: `The main insight from Andrej Karpathy's framing is that **context engineering** replaces "prompt engineering" as the more accurate term.\n\nIt's not just about writing a good prompt — it's about designing the entire information pipeline:\n- What gets retrieved\n- How it's formatted\n- What tools are available\n- What examples are provided\n- What constraints are set\n\nThis is essentially systems engineering applied to AI inputs.`,
      tags: ['insight', 'karpathy'],
      createdAt: now,
      updatedAt: now,
    } as AnyDoc,

    {
      _id: `note:${ulid()}`,
      type: 'note',
      projectId,
      title: 'RAG vs. Long Context comparison',
      content: `Need to dig deeper into the tradeoffs:\n\n**RAG advantages:**\n- Works with unlimited corpus size\n- Cheaper per query\n- Precise retrieval\n\n**Long context advantages:**\n- No retrieval pipeline needed\n- Better at cross-document reasoning\n- Simpler architecture\n\nThe hybrid approach seems most promising — use RAG for retrieval, then load results into a long context window.`,
      tags: ['RAG', 'comparison'],
      createdAt: now,
      updatedAt: now,
    } as AnyDoc,

    // --- References ---
    {
      _id: `reference:${ulid()}`,
      type: 'reference',
      projectId,
      title: 'Context Engineering for AI Agents',
      url: 'https://www.anthropic.com/research/building-effective-agents',
      refType: 'blog',
      author: 'Anthropic',
      notes: 'Practical patterns for building agents with effective context management.',
      tags: ['anthropic', 'agents'],
      createdAt: now,
      updatedAt: now,
    } as AnyDoc,

    {
      _id: `reference:${ulid()}`,
      type: 'reference',
      projectId,
      title: 'The Context Engineering Landscape',
      url: 'https://karpathy.ai',
      refType: 'blog',
      author: 'Andrej Karpathy',
      notes: 'Coined "context engineering" as the more accurate framing.',
      tags: ['karpathy', 'framing'],
      createdAt: now,
      updatedAt: now,
    } as AnyDoc,

    {
      _id: `reference:${ulid()}`,
      type: 'reference',
      projectId,
      title: 'Retrieval Augmented Generation for Knowledge-Intensive NLP Tasks',
      url: 'https://arxiv.org/abs/2005.11401',
      refType: 'paper',
      author: 'Lewis et al.',
      notes: 'Original RAG paper — foundational for context engineering patterns.',
      tags: ['RAG', 'foundational'],
      createdAt: now,
      updatedAt: now,
    } as AnyDoc,

    // --- Chat ---
    {
      _id: `chat:${ulid()}`,
      type: 'chat',
      projectId,
      title: 'Brainstorm: Tool design patterns',
      messages: [
        { role: 'user' as const, content: 'What are the best patterns for designing tools that an LLM agent can use effectively?', timestamp: now },
        { role: 'assistant' as const, content: 'The key patterns include: clear naming conventions, constrained input schemas, rich error messages, and providing examples in the tool description. The tool should do one thing well rather than being a Swiss Army knife.', timestamp: now },
      ],
      createdAt: now,
      updatedAt: now,
    } as AnyDoc,

    // --- Queue items ---
    {
      _id: `queue-item:${ulid()}`,
      type: 'queue-item',
      projectId,
      text: 'Read "Lost in the Middle" paper on long context position bias',
      itemType: 'read',
      linkedDocId: null,
      status: 'open',
      priority: 1,
      createdAt: now,
      updatedAt: now,
    } as AnyDoc,

    {
      _id: `queue-item:${ulid()}`,
      type: 'queue-item',
      projectId,
      text: 'Watch Simon Willison\'s talk on prompt injection',
      itemType: 'watch',
      linkedDocId: null,
      status: 'open',
      priority: 2,
      createdAt: now,
      updatedAt: now,
    } as AnyDoc,

    {
      _id: `queue-item:${ulid()}`,
      type: 'queue-item',
      projectId,
      text: 'How does Claude\'s system prompt caching interact with context engineering?',
      itemType: 'question',
      linkedDocId: null,
      status: 'open',
      priority: 0,
      createdAt: now,
      updatedAt: now,
    } as AnyDoc,

    {
      _id: `queue-item:${ulid()}`,
      type: 'queue-item',
      projectId,
      text: 'Compare MCP tool schemas across different providers',
      itemType: 'todo',
      linkedDocId: null,
      status: 'done',
      priority: 0,
      createdAt: now,
      updatedAt: now,
    } as AnyDoc,
  ];

  await db.bulkDocs(docs);
  localStorage.setItem(SEED_KEY, 'true');
  console.log('Seed data loaded:', docs.length, 'documents');
}

function getSeedReportHTML(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>Context Engineering: The Next Frontier of AI Development</title>
<style>
  body { font-family: 'IBM Plex Mono', monospace; max-width: 800px; margin: 2rem auto; padding: 0 1rem; line-height: 1.7; color: #2c2c2c; }
  h1 { font-size: 1.6rem; border-bottom: 3px solid #f0b8c8; padding-bottom: 0.5rem; }
  h2 { font-size: 1.2rem; color: #4a4a4a; border-left: 3px solid #a8d5ba; padding-left: 0.75rem; margin-top: 2rem; }
  .takeaway { background: #f0b8c8; padding: 1rem 1.25rem; border-radius: 6px; margin: 0.75rem 0; }
  .tag-cloud { display: flex; flex-wrap: wrap; gap: 0.5rem; margin: 1rem 0; }
  .tag-pill { padding: 0.25rem 0.75rem; border-radius: 999px; font-size: 0.8rem; background: #e8e0f0; }
  .resource-card { border: 1px solid #e0e0e0; border-radius: 6px; padding: 0.75rem; margin: 0.5rem 0; }
  .cat-dot { display: inline-block; width: 8px; height: 8px; border-radius: 50%; margin-right: 0.5rem; }
</style>
</head>
<body>
<h1>Context Engineering: The Next Frontier of AI Development</h1>

<section>
<h2>Key Takeaways</h2>
<div class="takeaway">Context engineering is emerging as a distinct discipline — the art and science of designing the complete information environment that an LLM receives.</div>
<div class="takeaway">The shift from "prompt engineering" to "context engineering" reflects a maturing understanding that LLM performance depends on the entire input pipeline, not just the instruction text.</div>
<div class="takeaway">Effective context engineering requires systems thinking — treating retrieval, formatting, tool design, and constraint specification as interconnected components.</div>
</section>

<section>
<h2>The Evolution from Prompts to Context</h2>
<p>The term "prompt engineering" emerged in 2022 as practitioners discovered that carefully crafted instructions could dramatically improve LLM outputs. But as applications grew more sophisticated, it became clear that the prompt itself was just one piece of a much larger puzzle.</p>
<p>Context engineering encompasses everything the model receives: system instructions, retrieved documents, tool descriptions, conversation history, examples, and constraints. Each element interacts with the others in complex ways.</p>
</section>

<section>
<h2>Core Patterns</h2>
<p>Several patterns have emerged as foundational: structured system prompts with clear role definitions, retrieval-augmented generation for grounding, tool schemas that guide rather than constrain, and few-shot examples that demonstrate desired behavior through demonstration rather than description.</p>
</section>

<section>
<h2>Reading & Watch List</h2>
<div>
<p><span class="cat-dot" style="background:#f0b8c8"></span><strong>Blogs & Articles</strong></p>
<div class="resource-card">Anthropic — Building Effective Agents</div>
<div class="resource-card">Simon Willison — Context Engineering for LLM Applications</div>
</div>
<div>
<p><span class="cat-dot" style="background:#a8c8e8"></span><strong>Papers</strong></p>
<div class="resource-card">Lewis et al. — Retrieval Augmented Generation (2020)</div>
<div class="resource-card">Liu et al. — Lost in the Middle (2023)</div>
</div>
<div>
<p><span class="cat-dot" style="background:#a8d5ba"></span><strong>Talks & Videos</strong></p>
<div class="resource-card">Andrej Karpathy — Context Engineering keynote</div>
</div>
</section>

<section>
<h2>Related Subjects to Explore</h2>
<div class="tag-cloud">
<span class="tag-pill">Retrieval Augmented Generation</span>
<span class="tag-pill">Tool Use Patterns</span>
<span class="tag-pill">Agentic Workflows</span>
<span class="tag-pill">Prompt Injection Defense</span>
<span class="tag-pill">Long Context Windows</span>
<span class="tag-pill">Knowledge Graphs</span>
<span class="tag-pill">Chain of Thought</span>
<span class="tag-pill">System Prompt Design</span>
</div>
</section>

</body>
</html>`;
}
