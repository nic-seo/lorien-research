# Lorien Research — Handoff for Claude Code

## What this is

A local-first research workspace app. Users create **Projects** that contain **Reports** (full HTML research documents), **Notes** (markdown), **Chats** (conversation logs), and **References** (links to videos/blogs/papers/books/podcasts). Everything lives in PouchDB (IndexedDB) in the browser. CouchDB sync is designed for but not yet wired up.

## Tech stack

- **React 18 + TypeScript + Vite** (scaffolded with `create-vite`)
- **PouchDB** with `pouchdb-find` for local-first storage
- **React Router v7** for client-side routing
- **No component library** — all styles are hand-written CSS using a custom design system

## Design system: "Japanese Highlighter"

The visual language is specific and intentional — don't swap it for Tailwind or a component library.

- **Font**: IBM Plex Mono (monospace throughout)
- **Palette**: Muted Zebra Mildliner highlighter colors — pink `#f0b8c8`, green `#a8d5ba`, yellow `#f5dfa0`, blue `#a8c8e8`, lavender `#c8b8e0`, coral `#e8b8a0`
- **Section h2**: Pink highlight underline via `background-image: linear-gradient(transparent 60%, var(--pink) 60%)`
- **Section h3**: Green left border (`border-left: 3px solid var(--green)`)
- **Dark mode**: Via `[data-theme="dark"]` on `<html>`, toggled in Topbar
- **Sidebar**: Fixed 272px left, collapses on mobile (<900px)
- **All design tokens are CSS custom properties** in `src/styles/global.css`

When adding new components, follow the existing patterns in global.css. Use the color variables, not raw hex values.

## Architecture

### Data model (`src/db/types.ts`)

All documents share a `BaseDoc` with `_id`, `_rev`, `type`, `createdAt`, `updatedAt`. Document types:

| Type | Key fields | Notes |
|------|-----------|-------|
| `project` | title, description, tags | Top-level container |
| `report` | projectId, title, htmlContent, sourceQuery, tags | Full HTML stored as string |
| `note` | projectId, title, content (markdown), tags | |
| `chat` | projectId, title, messages[] | Each message has role/content/timestamp |
| `reference` | projectId, title, url, refType, author, notes, tags | refType: video/blog/paper/link/book/podcast |
| `queue-item` | projectId, text, itemType, status, priority, linkedDocId | itemType: read/watch/question/todo; status: open/done |
| `link` | sourceId, sourceType, targetId, targetType | Bidirectional linking between any two docs |

IDs use the pattern `type:<ulid>` (e.g. `project:01HXK...`). ULIDs give chronological sort for free. See `src/lib/ulid.ts`.

### Data layer (`src/db/index.ts`)

- `createDoc<T>(type, data)` — auto-generates ID, timestamps
- `getDoc<T>(id)`, `updateDoc<T>(id, updates)`, `deleteDoc(id)`
- `getDocsByType<T>(type)`, `getProjectDocs<T>(type, projectId)`
- `getQueueItems(projectId, status?)`
- `createLink(sourceId, sourceType, targetId, targetType)`, `getLinksFor(docId)` — queries both directions
- `onChange(callback)` — live PouchDB change feed
- PouchDB indexes on: `[type]`, `[type, projectId]`, `[type, status]`, `[sourceId]`, `[targetId]`

### React hooks (`src/db/hooks.ts`)

- `useDoc<T>(id)` — single document, auto-refreshes on changes
- `useDocs<T>(type)` — all docs of a type
- `useProjectDocs<T>(type, projectId)` — project-scoped
- `useQueue(projectId, status?)` — queue items

All hooks subscribe to the PouchDB change feed and re-fetch automatically.

### Routes (`src/App.tsx`)

- `/` → Overview (project grid)
- `/project/:projectId` → ProjectDetail (tabbed: Reports/Notes/Chats/References/Queue)
- `/report/:reportId` → ReportView (renders stored HTML in iframe)

### Seed data (`src/db/seed.ts`)

On first load, seeds one "Context Engineering" project with a sample report, notes, references, a chat, and queue items. Controlled by a localStorage flag so it only runs once.

## What's built and working

- Full data layer with typed CRUD, queries, links, and live hooks
- App shell with sidebar navigation, sticky topbar, Cmd+K search overlay, dark mode toggle
- Overview page with project cards showing item counts and queue badges, "New Project" creation form
- Project Detail page with 5 tabs (Reports, Notes, Chats, References, Queue) — queue has quick-add input with type selector and done/undone toggling
- Report Viewer that renders stored HTML content in a sandboxed iframe
- Responsive layout (sidebar collapses under 900px)
- Seed data for demo/development

## What to build next

Roughly in priority order:

1. **Note editor** — Markdown editing for notes (currently notes display but can't be created/edited in the UI). Consider CodeMirror or a simple textarea with preview.
2. **Reference creation UI** — Form to add references (url, type, author, notes). Currently only seed data populates these.
3. **Chat interface** — Conversational UI within a project. This will eventually connect to the Claude API via a server-side proxy (never expose API keys client-side).
4. **Bidirectional link UI** — The `Link` document type and `createLink`/`getLinksFor` helpers exist but there's no UI to create or browse links between documents yet. Think: a "linked items" panel on any doc view.
5. **API proxy for Claude** — A simple Express/Fastify server that holds the API key and proxies requests from the frontend. Keep this as a separate `server/` directory.
6. **CouchDB sync** — PouchDB's `sync()` to a CouchDB instance for backup/multi-device. The data layer is already designed for this — just need the connection UI and config.
7. **Full-text search** — PouchDB has limited search. Options: build a client-side index with Lunr/MiniSearch, or add server-side search if the API proxy exists.
8. **Import existing reports** — The deep research skill (see below) produces standalone HTML reports. Would be nice to import those directly as Report documents.

## Deep Research Skill

The `.claude/skills/deep-research/` directory contains a skill for generating polished research reports as self-contained HTML files. This skill was developed alongside the app and its output is designed to be stored as Report documents.

### Skill files

- **`.claude/skills/deep-research/SKILL.md`** — The full skill definition. Covers the research workflow (understand → plan → gather → assess → write → save), the three-zone report structure, and how to use the HTML template.
- **`.claude/skills/deep-research/references/html-template.md`** — The complete design system reference: full CSS (~580 lines), HTML skeleton, JavaScript (theme toggle, sidebar nav tracking, Cmd+K search), and a component usage guide. Reports must use this template verbatim.
- **`.claude/skills/deep-research/evals/evals.json`** — Three eval prompts for testing the skill (AI coding agents market, context engineering, Manus profile).

### Report structure (three-zone)

Reports always have this shape:

1. **Opening bookend** (fixed): Key Takeaways
2. **Adaptive middle** (fully dynamic): The LLM designs sections from scratch based on what the research found. No templates, no optional predefined sections — the structure emerges from the content.
3. **Closing bookend** (fixed): Reading & Watch List → Related Subjects to Explore

Sources, questions for further research, confidence assessments, etc. may appear in the adaptive middle if the content calls for them, but they are NOT prescribed.

### How to use the skill

When asked to research a topic, read `SKILL.md` first, then read `references/html-template.md` for the exact CSS/HTML/JS to use. The skill produces a self-contained HTML file that can be viewed standalone in a browser or stored as a Report document in the app.

## Development

```bash
npm install
npm run dev      # Vite dev server on localhost:5173
npm run build    # TypeScript check + production build
npm run lint     # ESLint
```

Package name in package.json is still `research-workspace` — you may want to update it to `lorien-research`.
