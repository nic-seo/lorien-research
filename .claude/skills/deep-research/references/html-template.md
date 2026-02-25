# HTML Report Template Reference

This document defines the exact design system for deep research reports. The style is called "Japanese Highlighter" — inspired by Zebra Mildliner / bullet journal aesthetics. Soft, muted tones, nothing neon. IBM Plex Mono monospace font throughout.

## Design Principles

- **Font**: IBM Plex Mono (loaded from Google Fonts) as the primary and only font
- **Palette**: Warm, muted highlighter colors — pink, green, yellow, blue, lavender, coral
- **Layout**: Fixed sidebar nav on the left (272px), scrollable main content area (max-width 740px)
- **Features**: Dark mode toggle, Cmd+K search overlay, scroll-tracked active nav
- **Typography**: 13.5px base, line-height 1.75, generous whitespace
- **Cards**: Used for key concepts (strategy cards, practice items, resource cards)
- **Section headings (h2)**: Rendered with a pink highlighter underline effect using `background-image: linear-gradient(transparent 60%, var(--pink) 60%)`
- **Sub-headings (h3)**: Left green border accent (`border-left: 3px solid var(--green)`)

## Full CSS

Copy this CSS verbatim into every report's `<style>` block. Do not modify the color values or spacing.

```css
:root {
  --bg: #faf8f5;
  --surface: #ffffff;
  --text: #2c2a27;
  --text-secondary: #7a756d;
  --border: #e8e4de;
  --border-light: #f0ede8;

  --pink: #f0b8c8;
  --pink-light: #fdf0f4;
  --green: #a8d5ba;
  --green-light: #eef7f1;
  --yellow: #f5dfa0;
  --yellow-light: #fdf8eb;
  --blue: #a8c8e8;
  --blue-light: #eef4fb;
  --lavender: #c8b8e0;
  --lavender-light: #f3eff9;
  --coral: #e8b8a0;
  --coral-light: #faf2ed;

  --accent: #c87d96;
  --accent-light: var(--pink-light);
  --link: #8a6a7e;
  --tag-bg: var(--lavender-light);
  --tag-text: #7a6890;
  --sidebar-bg: #faf8f5;
  --sidebar-active: #c87d96;
  --shadow: 0 1px 3px rgba(44,42,39,0.05);
  --shadow-lg: 0 4px 16px rgba(44,42,39,0.08);
  --h2-underline: var(--pink);
}

[data-theme="dark"] {
  --bg: #1a1816;
  --surface: #242220;
  --text: #e8e4de;
  --text-secondary: #9a958d;
  --border: #333028;
  --border-light: #2a2825;

  --pink: #c87d96;
  --pink-light: #2d2028;
  --green: #6a9a78;
  --green-light: #1e2820;
  --yellow: #c8a850;
  --yellow-light: #28241a;
  --blue: #6890b0;
  --blue-light: #1a2028;
  --lavender: #8878a0;
  --lavender-light: #221e28;
  --coral: #b08868;
  --coral-light: #282018;

  --accent: #d8a0b8;
  --accent-light: var(--pink-light);
  --link: #d8a0b8;
  --tag-bg: var(--lavender-light);
  --tag-text: #b0a0c0;
  --sidebar-bg: #1e1c1a;
  --sidebar-active: #d8a0b8;
  --shadow: 0 1px 3px rgba(0,0,0,0.3);
  --shadow-lg: 0 4px 16px rgba(0,0,0,0.4);
  --h2-underline: var(--pink);
}

* { margin: 0; padding: 0; box-sizing: border-box; }

body {
  font-family: 'IBM Plex Mono', 'SF Mono', 'Fira Code', 'Consolas', 'Monaco', monospace;
  background: var(--bg);
  color: var(--text);
  line-height: 1.75;
  font-size: 13.5px;
  transition: background 0.3s, color 0.3s;
  -webkit-font-smoothing: antialiased;
}

/* Layout */
.layout { display: flex; min-height: 100vh; }

/* Sidebar */
.sidebar {
  position: fixed;
  top: 0; left: 0;
  width: 272px;
  height: 100vh;
  background: var(--sidebar-bg);
  border-right: 1px solid var(--border);
  padding: 24px 0;
  overflow-y: auto;
  z-index: 100;
  transition: transform 0.3s ease, background 0.3s;
}
.sidebar.collapsed { transform: translateX(-272px); }
.sidebar-header {
  padding: 0 20px 18px;
  border-bottom: 1px solid var(--border);
  margin-bottom: 10px;
}
.sidebar-header h2 {
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--text-secondary);
}
.nav-section { padding: 6px 10px; }
.nav-item {
  display: block;
  padding: 5px 12px;
  font-size: 12px;
  color: var(--text-secondary);
  text-decoration: none;
  border-radius: 4px;
  cursor: pointer;
  transition: all 0.15s;
  line-height: 1.5;
}
.nav-item:hover {
  background: var(--accent-light);
  color: var(--accent);
}
.nav-item.active {
  background: var(--accent-light);
  color: var(--sidebar-active);
  font-weight: 600;
}
.nav-item.sub {
  padding-left: 26px;
  font-size: 11.5px;
}

/* Main */
.main {
  margin-left: 272px;
  flex: 1;
  transition: margin-left 0.3s;
}
.main.expanded { margin-left: 0; }

/* Top bar */
.topbar {
  position: sticky;
  top: 0;
  background: var(--surface);
  border-bottom: 1px solid var(--border);
  padding: 10px 28px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  z-index: 90;
  backdrop-filter: blur(10px);
}
.topbar-left { display: flex; align-items: center; gap: 12px; }
.topbar-right { display: flex; align-items: center; gap: 6px; }

.menu-btn, .theme-btn, .search-btn {
  background: none;
  border: 1px solid var(--border);
  color: var(--text-secondary);
  width: 32px; height: 32px;
  border-radius: 4px;
  cursor: pointer;
  display: flex; align-items: center; justify-content: center;
  font-size: 14px;
  font-family: inherit;
  transition: all 0.15s;
}
.menu-btn:hover, .theme-btn:hover, .search-btn:hover {
  background: var(--accent-light);
  border-color: var(--accent);
  color: var(--accent);
}
.topbar-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--text);
}
.topbar-subtitle {
  font-size: 11px;
  color: var(--text-secondary);
}

/* Search overlay */
.search-overlay {
  display: none;
  position: fixed;
  inset: 0;
  background: rgba(44,42,39,0.4);
  z-index: 200;
  align-items: flex-start;
  justify-content: center;
  padding-top: 100px;
}
.search-overlay.open { display: flex; }
.search-box {
  background: var(--surface);
  border-radius: 8px;
  width: 520px;
  max-width: 90vw;
  box-shadow: var(--shadow-lg);
  border: 1px solid var(--border);
  overflow: hidden;
}
.search-input {
  width: 100%;
  padding: 14px 18px;
  border: none;
  background: transparent;
  font-size: 13.5px;
  color: var(--text);
  outline: none;
  font-family: inherit;
}
.search-results {
  max-height: 360px;
  overflow-y: auto;
  border-top: 1px solid var(--border);
}
.search-result-item {
  padding: 10px 18px;
  cursor: pointer;
  border-bottom: 1px solid var(--border-light);
  transition: background 0.1s;
}
.search-result-item:hover { background: var(--accent-light); }
.search-result-item .sr-section {
  font-size: 10px;
  color: var(--accent);
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.06em;
}
.search-result-item .sr-text {
  font-size: 12px;
  color: var(--text);
  margin-top: 2px;
}
.search-result-item .sr-text mark {
  background: var(--yellow-light);
  color: var(--text);
  border-radius: 2px;
  padding: 0 2px;
  border-bottom: 2px solid var(--yellow);
}

/* Content */
.content {
  max-width: 740px;
  margin: 0 auto;
  padding: 44px 32px 120px;
}

/* Hero */
.hero {
  margin-bottom: 44px;
  padding-bottom: 28px;
  border-bottom: 1px solid var(--border);
}
.hero h1 {
  font-size: 28px;
  font-weight: 700;
  line-height: 1.3;
  letter-spacing: -0.01em;
  margin-bottom: 10px;
}
.hero-subtitle {
  font-size: 14px;
  color: var(--text-secondary);
  margin-bottom: 16px;
  line-height: 1.6;
  font-weight: 300;
}
.hero-meta {
  display: flex;
  gap: 8px;
  color: var(--text-secondary);
  font-size: 11px;
  flex-wrap: wrap;
  align-items: center;
}
.hero-tag {
  padding: 2px 10px;
  border-radius: 2px;
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.04em;
}
.hero-tag.t-pink { background: var(--pink-light); color: #a06078; border-bottom: 2px solid var(--pink); }
.hero-tag.t-green { background: var(--green-light); color: #5a8a6a; border-bottom: 2px solid var(--green); }
.hero-tag.t-blue { background: var(--blue-light); color: #5878a0; border-bottom: 2px solid var(--blue); }
.hero-meta .sep { color: var(--border); }

/* Sections */
.section {
  margin-bottom: 44px;
  scroll-margin-top: 70px;
}
.section h2 {
  font-size: 18px;
  font-weight: 700;
  margin-bottom: 16px;
  letter-spacing: -0.005em;
  display: inline;
  background-image: linear-gradient(transparent 60%, var(--pink) 60%);
  background-size: 100% 100%;
  background-repeat: no-repeat;
  padding: 0 2px;
}
.section .h2-wrap {
  margin-bottom: 18px;
}
.section h3 {
  font-size: 14.5px;
  font-weight: 700;
  margin: 30px 0 10px;
  color: var(--text);
  padding-left: 10px;
  border-left: 3px solid var(--green);
}
.section p {
  margin-bottom: 12px;
  color: var(--text);
  font-size: 13.5px;
  font-weight: 400;
}
.section ul, .section ol {
  margin: 0 0 12px 18px;
  font-size: 13.5px;
}
.section li {
  margin-bottom: 5px;
  line-height: 1.7;
}
.section strong { font-weight: 600; }
.section em { font-style: italic; color: var(--text-secondary); }

/* Insight/strategy cards — 2-column grid */
.card-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
  margin: 18px 0 24px;
}
.card {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 18px;
  transition: box-shadow 0.2s;
  position: relative;
}
.card:hover { box-shadow: var(--shadow-lg); }
.card::before {
  content: '';
  position: absolute;
  top: 0; left: 0; right: 0;
  height: 3px;
  border-radius: 6px 6px 0 0;
}
.card:nth-child(4n+1)::before { background: var(--pink); }
.card:nth-child(4n+2)::before { background: var(--blue); }
.card:nth-child(4n+3)::before { background: var(--yellow); }
.card:nth-child(4n)::before { background: var(--green); }
.card .card-label {
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--text-secondary);
  margin-bottom: 4px;
}
.card h4 {
  font-size: 14px;
  font-weight: 700;
  margin-bottom: 8px;
}
.card p {
  font-size: 12px;
  color: var(--text-secondary);
  line-height: 1.65;
}

/* Warning/caution cards — coral left border */
.caution-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
  margin: 18px 0 24px;
}
.caution-card {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 14px 16px;
  border-left: 3px solid var(--coral);
}
.caution-card h4 {
  font-size: 12px;
  font-weight: 700;
  margin-bottom: 4px;
  color: #b07860;
}
[data-theme="dark"] .caution-card h4 { color: var(--coral); }
.caution-card p { font-size: 12px; color: var(--text-secondary); line-height: 1.6; }

/* Numbered practice/takeaway items */
.practice-item {
  display: flex;
  gap: 12px;
  margin-bottom: 10px;
  padding: 12px 14px;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 6px;
}
.practice-num {
  flex-shrink: 0;
  width: 24px; height: 24px;
  border-radius: 3px;
  display: flex; align-items: center; justify-content: center;
  font-size: 11px;
  font-weight: 700;
}
.practice-item:nth-child(odd) .practice-num { background: var(--pink-light); color: #a06078; }
.practice-item:nth-child(even) .practice-num { background: var(--green-light); color: #5a8a6a; }
.practice-text h4 { font-size: 13px; font-weight: 700; margin-bottom: 2px; }
.practice-text p { font-size: 12px; color: var(--text-secondary); margin: 0; line-height: 1.6; }

/* Resource/source cards */
.reading-category { margin-bottom: 28px; }
.reading-category h3 {
  font-size: 13px;
  font-weight: 700;
  margin-bottom: 10px;
  display: flex;
  align-items: center;
  gap: 8px;
  border-left: none;
  padding-left: 0;
}
.reading-category h3 .cat-dot {
  width: 8px; height: 8px;
  border-radius: 50%;
  display: inline-block;
}
.resource-card {
  display: block;
  padding: 10px 14px;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 5px;
  margin-bottom: 6px;
  text-decoration: none;
  transition: all 0.15s;
}
.resource-card:hover {
  border-color: var(--accent);
  background: var(--accent-light);
}
.resource-card .rc-title {
  font-size: 12.5px;
  font-weight: 600;
  color: var(--link);
  margin-bottom: 1px;
}
.resource-card .rc-author {
  font-size: 10.5px;
  color: var(--text-secondary);
  font-weight: 500;
}
.resource-card .rc-desc {
  font-size: 11.5px;
  color: var(--text-secondary);
  margin-top: 3px;
  line-height: 1.5;
  font-weight: 300;
}

/* Tag pills */
.tag-cloud {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 14px;
}
.tag-pill {
  padding: 4px 12px;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 3px;
  font-size: 11.5px;
  color: var(--text);
  cursor: default;
  transition: all 0.15s;
  font-weight: 400;
}
.tag-pill:nth-child(4n+1) { border-bottom: 2px solid var(--pink); }
.tag-pill:nth-child(4n+2) { border-bottom: 2px solid var(--green); }
.tag-pill:nth-child(4n+3) { border-bottom: 2px solid var(--blue); }
.tag-pill:nth-child(4n)   { border-bottom: 2px solid var(--yellow); }
.tag-pill:hover { background: var(--accent-light); }

/* Confidence badges */
.confidence-badge {
  display: inline-block;
  padding: 2px 8px;
  border-radius: 3px;
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}
.confidence-badge.high { background: var(--green-light); color: #5a8a6a; border-bottom: 2px solid var(--green); }
.confidence-badge.medium { background: var(--yellow-light); color: #8a7a40; border-bottom: 2px solid var(--yellow); }
.confidence-badge.low { background: var(--coral-light); color: #8a6050; border-bottom: 2px solid var(--coral); }

/* Inline citation superscripts */
sup a {
  color: var(--accent);
  text-decoration: none;
  font-weight: 600;
  font-size: 10px;
}
sup a:hover { text-decoration: underline; }

/* ASCII diagrams */
.arch-diagram {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 20px;
  margin: 18px 0;
  font-size: 12px;
  line-height: 1.5;
  overflow-x: auto;
  white-space: pre;
  color: var(--text-secondary);
}

/* Responsive */
@media (max-width: 900px) {
  .sidebar { transform: translateX(-272px); }
  .sidebar.open { transform: translateX(0); }
  .main { margin-left: 0; }
  .card-grid, .caution-grid { grid-template-columns: 1fr; }
  .content { padding: 28px 18px 80px; }
  .hero h1 { font-size: 22px; }
}

/* Scrollbar */
::-webkit-scrollbar { width: 5px; }
::-webkit-scrollbar-track { background: transparent; }
::-webkit-scrollbar-thumb { background: var(--border); border-radius: 3px; }
::-webkit-scrollbar-thumb:hover { background: var(--text-secondary); }

/* Selection */
::selection {
  background: var(--yellow);
  color: var(--text);
}
```

## HTML Structure Template

Every report must follow this skeleton. Adapt the section content but preserve the structural pattern.

```html
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>[Report Title]</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:ital,wght@0,300;0,400;0,500;0,600;0,700;1,400&display=swap" rel="stylesheet">
<style>
  /* PASTE FULL CSS FROM ABOVE */
</style>
</head>
<body>
<div class="layout">

  <!-- Sidebar -->
  <nav class="sidebar" id="sidebar">
    <div class="sidebar-header">
      <h2>Contents</h2>
    </div>
    <div class="nav-section">
      <!-- One nav-item per section. Use class="nav-item sub" for sub-sections -->
      <a class="nav-item" data-section="takeaways">Key Takeaways</a>
      <a class="nav-item" data-section="section-1">Section Title</a>
      <a class="nav-item sub" data-section="sub-1a">Sub-section</a>
      <!-- ... more nav items ... -->
      <!-- ... adaptive middle nav items ... -->
      <a class="nav-item" data-section="reading">Reading & Watch List</a>
      <a class="nav-item" data-section="related">Related Subjects</a>
    </div>
  </nav>

  <!-- Main Content -->
  <div class="main" id="main">
    <div class="topbar">
      <div class="topbar-left">
        <button class="menu-btn" id="menuBtn" title="Toggle sidebar">☰</button>
        <div>
          <div class="topbar-title">[short-kebab-case-title]</div>
          <div class="topbar-subtitle">research · [month] [year]</div>
        </div>
      </div>
      <div class="topbar-right">
        <button class="search-btn" id="searchBtn" title="Search (⌘K)">⌕</button>
        <button class="theme-btn" id="themeBtn" title="Toggle dark mode">◑</button>
      </div>
    </div>

    <div class="content">

      <!-- Hero -->
      <div class="hero">
        <h1>[Report Title]</h1>
        <p class="hero-subtitle">[One-line description of the research topic and scope]</p>
        <div class="hero-meta">
          <span class="hero-tag t-pink">[Tag 1]</span>
          <span class="hero-tag t-green">[Tag 2]</span>
          <span class="hero-tag t-blue">[Tag 3]</span>
          <span class="sep">·</span>
          <span>compiled [month] [year]</span>
        </div>
      </div>

      <!-- Key Takeaways — always first section -->
      <div class="section" id="takeaways">
        <div class="h2-wrap"><h2>Key Takeaways</h2></div>
        <!-- Use practice-item pattern for numbered takeaways -->
        <div class="practice-item">
          <div class="practice-num">1</div>
          <div class="practice-text">
            <h4>[Takeaway title]</h4>
            <p>[Brief explanation]</p>
          </div>
        </div>
        <!-- ... more takeaways ... -->
      </div>

      <!-- Adaptive middle sections -->
      <div class="section" id="section-1">
        <div class="h2-wrap"><h2>[Section Title]</h2></div>
        <p>[Prose content with inline citations<sup><a href="#source-1">[1]</a></sup>]</p>

        <h3 id="sub-1a">[Sub-section Title]</h3>
        <p>[More content...]</p>

        <!-- Use card-grid for comparing concepts, players, approaches -->
        <div class="card-grid">
          <div class="card">
            <div class="card-label">[label]</div>
            <h4>[Card Title]</h4>
            <p>[Card description]</p>
          </div>
          <!-- ... more cards ... -->
        </div>

        <!-- Use caution-grid for risks, warnings, limitations -->
        <div class="caution-grid">
          <div class="caution-card">
            <h4>[Warning Title]</h4>
            <p>[Description]</p>
          </div>
        </div>
      </div>

      <!-- ====== CLOSING BOOKEND (always present, in this order) ====== -->

      <!-- Reading & Watch List — curated resources for going deeper -->
      <div class="section" id="reading">
        <div class="h2-wrap"><h2>Reading & Watch List</h2></div>
        <p>[Brief intro — what the reader should expect from these resources]</p>

        <!-- Category 1: Blog Posts (pink dot) -->
        <div class="reading-category" id="read-blogs">
          <h3><span class="cat-dot" style="background:var(--pink)"></span> Seminal Blog Posts</h3>
          <a class="resource-card" href="[url]" target="_blank">
            <div class="rc-title">[Title]</div>
            <div class="rc-author">[Author / Publication]</div>
            <div class="rc-desc">[Why this is worth reading — one line]</div>
          </a>
          <!-- ... more resource cards ... -->
        </div>

        <!-- Category 2: Academic Papers (blue dot) -->
        <div class="reading-category" id="read-papers">
          <h3><span class="cat-dot" style="background:var(--blue)"></span> Academic Papers</h3>
          <a class="resource-card" href="[url]" target="_blank">
            <div class="rc-title">[Title]</div>
            <div class="rc-author">[Authors / Year]</div>
            <div class="rc-desc">[Why this is worth reading]</div>
          </a>
        </div>

        <!-- Category 3: Talks & Videos (green dot) -->
        <div class="reading-category" id="read-talks">
          <h3><span class="cat-dot" style="background:var(--green)"></span> Talks & Videos</h3>
          <a class="resource-card" href="[url]" target="_blank">
            <div class="rc-title">[Title]</div>
            <div class="rc-author">[Speaker / Event]</div>
            <div class="rc-desc">[Why this is worth watching]</div>
          </a>
        </div>

        <!-- Category 4: Books (yellow dot) -->
        <div class="reading-category" id="read-books">
          <h3><span class="cat-dot" style="background:var(--yellow)"></span> Books</h3>
          <a class="resource-card" href="[url]" target="_blank">
            <div class="rc-title">[Title]</div>
            <div class="rc-author">[Author / Year]</div>
            <div class="rc-desc">[Why this is worth reading]</div>
          </a>
        </div>

        <!-- Additional categories as needed: Podcasts, Tools & Libraries, Courses, Newsletters, Communities -->
        <!-- Use lavender dot for additional categories: style="background:var(--lavender)" -->
      </div>

      <!-- Related Subjects — tag cloud of adjacent topics -->
      <div class="section" id="related">
        <div class="h2-wrap"><h2>Related Subjects to Explore</h2></div>
        <p>[Brief sentence about how these topics intersect with the research]</p>
        <div class="tag-cloud">
          <span class="tag-pill">[Adjacent Topic 1]</span>
          <span class="tag-pill">[Adjacent Topic 2]</span>
          <span class="tag-pill">[Adjacent Topic 3]</span>
          <!-- 8-15 tags total. Each should be a concise topic name (2-5 words), specific enough to search. -->
        </div>
      </div>

      <!-- No more fixed sections after Related Subjects. -->
      <!-- Sources, questions, confidence ratings, etc. may appear in the adaptive middle if the content calls for it. -->

    </div>
  </div>
</div>

<!-- Search Overlay -->
<div class="search-overlay" id="searchOverlay">
  <div class="search-box">
    <input type="text" class="search-input" id="searchInput" placeholder="search this document…" autocomplete="off">
    <div class="search-results" id="searchResults"></div>
  </div>
</div>

<script>
// Theme toggle
const themeBtn = document.getElementById('themeBtn');
themeBtn.addEventListener('click', () => {
  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
  document.documentElement.setAttribute('data-theme', isDark ? 'light' : 'dark');
});

// Sidebar toggle
const menuBtn = document.getElementById('menuBtn');
const sidebar = document.getElementById('sidebar');
const main = document.getElementById('main');
menuBtn.addEventListener('click', () => {
  if (window.innerWidth <= 900) {
    sidebar.classList.toggle('open');
  } else {
    sidebar.classList.toggle('collapsed');
    main.classList.toggle('expanded');
  }
});

// Nav clicks
document.querySelectorAll('.nav-item').forEach(item => {
  item.addEventListener('click', () => {
    const id = item.getAttribute('data-section');
    const el = document.getElementById(id);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      if (window.innerWidth <= 900) sidebar.classList.remove('open');
    }
  });
});

// Active nav on scroll
const navItems = document.querySelectorAll('.nav-item');
const sectionMap = {};
navItems.forEach(n => { sectionMap[n.getAttribute('data-section')] = n; });
function updateActiveNav() {
  let current = '';
  document.querySelectorAll('[id]').forEach(el => {
    if (el.getBoundingClientRect().top <= 100 && sectionMap[el.id]) {
      current = el.id;
    }
  });
  navItems.forEach(n => n.classList.remove('active'));
  if (current && sectionMap[current]) sectionMap[current].classList.add('active');
}
window.addEventListener('scroll', updateActiveNav, { passive: true });
updateActiveNav();

// Search
const searchBtn = document.getElementById('searchBtn');
const searchOverlay = document.getElementById('searchOverlay');
const searchInput = document.getElementById('searchInput');
const searchResults = document.getElementById('searchResults');

const searchData = [];
document.querySelectorAll('.section').forEach(sec => {
  const sectionTitle = sec.querySelector('h2')?.textContent || '';
  sec.querySelectorAll('p, li, h3, h4, .rc-title, .rc-desc').forEach(p => {
    const text = p.textContent.trim();
    if (text.length > 10) searchData.push({ section: sectionTitle, text, id: sec.id });
  });
});

function openSearch() {
  searchOverlay.classList.add('open');
  searchInput.value = '';
  searchResults.innerHTML = '';
  setTimeout(() => searchInput.focus(), 50);
}
function closeSearch() { searchOverlay.classList.remove('open'); }

searchBtn.addEventListener('click', openSearch);
searchOverlay.addEventListener('click', e => { if (e.target === searchOverlay) closeSearch(); });
document.addEventListener('keydown', e => {
  if ((e.metaKey || e.ctrlKey) && e.key === 'k') { e.preventDefault(); openSearch(); }
  if (e.key === 'Escape') closeSearch();
});

searchInput.addEventListener('input', () => {
  const q = searchInput.value.trim().toLowerCase();
  if (q.length < 2) { searchResults.innerHTML = ''; return; }
  const matches = searchData.filter(d => d.text.toLowerCase().includes(q)).slice(0, 12);
  searchResults.innerHTML = matches.map(m => {
    const idx = m.text.toLowerCase().indexOf(q);
    const start = Math.max(0, idx - 40);
    const end = Math.min(m.text.length, idx + q.length + 60);
    let snippet = (start > 0 ? '…' : '') + m.text.slice(start, end) + (end < m.text.length ? '…' : '');
    snippet = snippet.replace(new RegExp(`(${q.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\\\$&')})`, 'gi'), '<mark>$1</mark>');
    return `<div class="search-result-item" data-id="${m.id}"><div class="sr-section">${m.section}</div><div class="sr-text">${snippet}</div></div>`;
  }).join('') || '<div style="padding:14px 18px;color:var(--text-secondary);font-size:12px;">no results found.</div>';
});

searchResults.addEventListener('click', e => {
  const item = e.target.closest('.search-result-item');
  if (item) {
    const el = document.getElementById(item.getAttribute('data-id'));
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    closeSearch();
  }
});
</script>
</body>
</html>
```

## Component Usage Guide

Use these components contextually in the adaptive middle sections:

| Component | CSS Class | When to Use |
|-----------|-----------|-------------|
| **Concept cards** | `.card-grid` > `.card` | Comparing players, approaches, technologies (2-column grid) |
| **Caution cards** | `.caution-grid` > `.caution-card` | Risks, warnings, limitations, failure modes |
| **Numbered items** | `.practice-item` | Key takeaways, best practices, ranked findings |
| **Resource cards** | `.resource-card` | Sources bibliography, reading/watch list entries |
| **Reading categories** | `.reading-category` > `h3` with `.cat-dot` | Grouping resources by type (blogs, papers, talks, books, etc.) |
| **Tag pills** | `.tag-cloud` > `.tag-pill` | Follow-up questions, related subjects to explore |
| **Confidence badges** | `.confidence-badge.{high,medium,low}` | Inline confidence ratings |
| **ASCII diagrams** | `.arch-diagram` | Architecture diagrams, flow charts, comparisons |

## Important Notes

- Always include the Google Fonts link for IBM Plex Mono in the `<head>`
- The full CSS, HTML structure, and JavaScript must be included in every report — reports must be fully self-contained
- Hero tags should use `t-pink`, `t-green`, and `t-blue` classes — pick 3 relevant topic tags
- The topbar subtitle should always read `research · [month] [year]`
- Keep the same search and dark mode JavaScript in every report
