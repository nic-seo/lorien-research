import { useParams } from 'react-router-dom';
import { useDoc } from '../db/hooks';
import type { Report } from '../db/types';
import { useRef, useEffect, useState } from 'react';
import DocHeader from '../components/features/DocHeader';

// ---- Constants ----

const THEME_VAR_NAMES = [
  '--bg', '--surface', '--text', '--text-secondary', '--border', '--border-light',
  '--pink', '--pink-light', '--green', '--green-light', '--yellow', '--yellow-light',
  '--blue', '--blue-light', '--lavender', '--lavender-light', '--coral', '--coral-light',
  '--accent', '--accent-light', '--link', '--tag-bg', '--tag-text',
  '--shadow', '--shadow-lg', '--h2-underline',
];

function buildThemeVarsCSS(): string {
  const appVars = getComputedStyle(document.documentElement);
  const vars = THEME_VAR_NAMES.map(v => `${v}: ${appVars.getPropertyValue(v).trim()}`).join('; ');
  return `:host { ${vars} }`;
}

// ---- Types ----

interface NavItem {
  id: string;
  label: string;
  isSub: boolean;
}

// ---- Inline margin TOC ----

function ReportTOC({
  navItems,
  shadowRoot,
}: {
  navItems: NavItem[];
  shadowRoot: ShadowRoot;
}) {
  const [activeId, setActiveId] = useState(navItems[0]?.id || '');

  // Track which section is in view
  useEffect(() => {
    const sections = navItems
      .map((item) => shadowRoot.getElementById(item.id))
      .filter(Boolean) as Element[];
    if (sections.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible.length > 0) {
          setActiveId(visible[0].target.id);
        }
      },
      { rootMargin: '-10% 0px -75% 0px' },
    );

    sections.forEach((s) => observer.observe(s));
    return () => observer.disconnect();
  }, [shadowRoot, navItems]);

  const handleClick = (id: string) => {
    const el = shadowRoot.getElementById(id);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      setActiveId(id);
    }
  };

  return (
    <nav className="report-toc">
      <div className="report-toc-inner">
        <div className="report-toc-label">Contents</div>

        {navItems.map((item) => (
          <button
            key={item.id}
            className={`report-toc-link ${item.isSub ? 'sub' : ''} ${activeId === item.id ? 'active' : ''}`}
            onClick={() => handleClick(item.id)}
          >
            {item.label}
          </button>
        ))}
      </div>
    </nav>
  );
}

// ---- Main component ----

export default function ReportView() {
  const { projectId, reportId } = useParams<{ projectId: string; reportId: string }>();
  const { doc: report, loading } = useDoc<Report>(reportId || null);
  const hostRef = useRef<HTMLDivElement>(null);
  const shadowRef = useRef<ShadowRoot | null>(null);
  const [navItems, setNavItems] = useState<NavItem[]>([]);
  const [shadowRoot, setShadowRoot] = useState<ShadowRoot | null>(null);

  // Sync dark-mode from <html data-theme> → shadow host + push CSS variables
  // Also sync font mode from <html data-font> → shadow DOM font override
  const themeStyleRef = useRef<HTMLStyleElement | null>(null);
  const fontStyleRef = useRef<HTMLStyleElement | null>(null);

  function buildFontCSS(): string {
    const isSerif = document.documentElement.getAttribute('data-font') === 'serif';
    if (!isSerif) return '';
    return `
      :host {
        font-family: 'Crimson Text', Georgia, 'Times New Roman', serif !important;
        font-size: 16px !important;
        line-height: 1.7 !important;
      }
      :host h1, :host h2, :host h3, :host h4 {
        font-family: 'Crimson Text', Georgia, 'Times New Roman', serif !important;
      }
      :host p, :host li, :host blockquote, :host td, :host th {
        font-family: 'Crimson Text', Georgia, 'Times New Roman', serif !important;
        font-size: 16px !important;
      }
      :host code, :host pre {
        font-family: 'IBM Plex Mono', monospace !important;
      }
    `;
  }

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const syncTheme = () => {
      const theme = document.documentElement.getAttribute('data-theme');
      if (theme) host.setAttribute('data-theme', theme);
      else host.removeAttribute('data-theme');

      // Push the app's computed CSS variables into the shadow DOM so all
      // report elements pick up the correct theme colors automatically.
      if (themeStyleRef.current && shadowRef.current) {
        themeStyleRef.current.textContent = buildThemeVarsCSS();
      }
    };

    const syncFont = () => {
      if (fontStyleRef.current) {
        fontStyleRef.current.textContent = buildFontCSS();
      }
    };

    syncTheme();
    syncFont();
    const observer = new MutationObserver((mutations) => {
      for (const m of mutations) {
        if (m.attributeName === 'data-theme') syncTheme();
        if (m.attributeName === 'data-font') syncFont();
      }
    });
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme', 'data-font'],
    });
    return () => observer.disconnect();
  }, []);

  // Render report HTML into shadow DOM
  useEffect(() => {
    if (!report?.htmlContent || !hostRef.current) return;

    // Attach shadow root once
    if (!shadowRef.current) {
      shadowRef.current = hostRef.current.attachShadow({ mode: 'open' });
    }
    const shadow = shadowRef.current;
    shadow.innerHTML = '';

    // Parse the stored HTML document
    const parser = new DOMParser();
    const doc = parser.parseFromString(report.htmlContent, 'text/html');

    // --- Google Fonts: add to both shadow DOM and document head ---
    doc.querySelectorAll('link[href*="fonts.googleapis"]').forEach((link) => {
      const href = link.getAttribute('href');
      if (href && !document.querySelector(`link[href="${href}"]`)) {
        const docLink = document.createElement('link');
        docLink.rel = 'stylesheet';
        docLink.href = href;
        document.head.appendChild(docLink);
      }
      shadow.appendChild(link.cloneNode(true));
    });

    // --- Styles: adapt selectors for shadow DOM ---
    doc.querySelectorAll('style').forEach((style) => {
      const el = document.createElement('style');
      let css = style.textContent || '';

      // :root → :host (CSS variables)
      css = css.replace(/:root\s*\{/g, ':host {');
      // body → :host (font, background, color)
      css = css.replace(/\bbody\s*\{/g, ':host {');
      // [data-theme="dark"] { → :host([data-theme="dark"]) {
      css = css.replace(/\[data-theme="dark"\]\s*\{/g, ':host([data-theme="dark"]) {');
      // [data-theme="dark"] .foo → :host([data-theme="dark"]) .foo
      css = css.replace(/\[data-theme="dark"\]\s+/g, ':host([data-theme="dark"]) ');

      el.textContent = css;
      shadow.appendChild(el);
    });

    // --- Theme variables: a dedicated <style> that gets updated on theme toggle ---
    // Populate immediately with current theme variables so dark mode works on first render.
    const themeStyle = document.createElement('style');
    themeStyle.textContent = buildThemeVarsCSS();
    themeStyleRef.current = themeStyle;
    shadow.appendChild(themeStyle);

    // --- Font override: a dedicated <style> that gets updated on font toggle ---
    const fontStyle = document.createElement('style');
    fontStyle.textContent = buildFontCSS();
    fontStyleRef.current = fontStyle;
    shadow.appendChild(fontStyle);

    // Sync the data-theme attribute on the host element for :host([data-theme="dark"]) selectors
    const host = hostRef.current;
    if (host) {
      const theme = document.documentElement.getAttribute('data-theme');
      if (theme) host.setAttribute('data-theme', theme);
      else host.removeAttribute('data-theme');
    }

    // --- Override: strip report chrome, adapt layout for inline rendering ---
    const override = document.createElement('style');
    override.textContent = `
      :host {
        display: block;
        line-height: 1.75;
        background: var(--bg) !important;
        color: var(--text) !important;
      }
      .sidebar       { display: none !important; }
      .topbar        { display: none !important; }
      .search-overlay { display: none !important; }
      .main          { margin-left: 0 !important; width: 100% !important; min-height: auto !important; }
      .layout        { display: block !important; }
      .content       { max-width: 800px; margin: 0 auto; padding: 0 !important; }
      .hero          { margin-top: 0 !important; padding-top: 24px !important; }
      .hero-tag      { display: none !important; }
    `;
    shadow.appendChild(override);

    // --- Body content: clone into shadow DOM ---
    if (doc.body) {
      Array.from(doc.body.children).forEach((child) => {
        shadow.appendChild(child.cloneNode(true));
      });
    }

    // --- Extract nav items for the margin TOC ---
    const items: NavItem[] = [];
    doc.querySelectorAll('.nav-item').forEach((el) => {
      const id = el.getAttribute('data-section') || '';
      const label = el.textContent?.trim() || '';
      const isSub = el.classList.contains('sub');
      if (id && label) items.push({ id, label, isSub });
    });

    setNavItems(items);
    setShadowRoot(shadow);
  }, [report?.htmlContent]);

  if (loading) return <div className="page-loading">Loading…</div>;
  if (!report) return <div className="page-loading">Report not found.</div>;

  return (
    <div className="report-page">
      <DocHeader
        backPath={`/project/${projectId}`}
        docId={reportId}
        docType="report"
        projectId={projectId}
      />

      <div className="report-content">
        <div className="report-toc-trigger" />
        {navItems.length > 0 && shadowRoot && (
          <ReportTOC navItems={navItems} shadowRoot={shadowRoot} />
        )}
        <div className="report-layout">
          <div className="report-main">
            <div ref={hostRef} className="report-shadow-host" />
          </div>
        </div>
      </div>
    </div>
  );
}
