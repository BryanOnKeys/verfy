#!/usr/bin/env node
/**
 * Builds a single-file preview of the Verfy home page: one .html with the styles, the markup and the interactive parts
 * inlined, that opens straight from disk (fonts come from Google Fonts when online, with system fallbacks offline).
 *
 * It takes the page exactly as the running app renders it, removes the framework's scripts, and adds
 * scripts/preview/runtime.js with the real Verfy engine (src/core/engine), so the console and the tamper demo give the
 * same verdicts and hashes as the app. The file has no other pages, so links to them are replaced: buttons lead to
 * sections of this page with labels that say where they go, links that only make sense in the app are left out, and
 * the build fails if any link to another page is left over. A note at the top says it is a preview.
 *
 *   npm run build && npm start            # or npm run dev
 *   node scripts/build-preview.mjs [base-url] [out-file ...]
 *
 * Defaults: http://localhost:3000, ./verfy-home-preview.html
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repo = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => readFileSync(join(repo, p), "utf8");
const base = (process.argv[2] ?? "http://localhost:3000").replace(/\/$/, "");
const outs = process.argv.slice(3);
if (outs.length === 0) outs.push(join(repo, "verfy-home-preview.html"));

const res = await fetch(`${base}/`, { headers: { cookie: "verfy_theme=light" } });
if (!res.ok) throw new Error(`GET ${base}/ returned ${res.status}`);
const page = await res.text();

/* ---------------------------------------------------------------- markup */
let body = page.slice(page.indexOf("<body"), page.lastIndexOf("</body>")).replace(/^<body[^>]*>/, "");
body = body
  .replace(/<script\b[\s\S]*?<\/script>/g, "")
  .replace(/<div hidden="">(?:<!--[^>]*-->)*<\/div>/g, "")
  .replace(/<(nextjs-portal|next-route-announcer)\b[\s\S]*?<\/\1>/g, "")
  .replace(/<!--[\s\S]*?-->/g, "");
if (!body.includes('class="site-header"') || !body.includes('class="console"')) throw new Error("unexpected page markup");

// the preview is one page, so its menus list the sections of that page
const SECTIONS = [
  ["#product", "Product"],
  ["#how", "How it works"],
  ["#evidence", "Evidence"],
  ["#team", "Team"],
  ["#faq", "Questions"],
];
const navLinks = SECTIONS.map(([href, label]) => `<a href="${href}">${label}</a>`).join("");
body = body
  .replace(/<nav class="nav" aria-label="Main">[\s\S]*?<\/nav>/, `<nav class="nav" aria-label="Main">${navLinks}</nav>`)
  .replace(
    /(<nav id="mobile-nav"[^>]*>)[\s\S]*?<\/nav>/,
    `$1${navLinks}<a class="mobile-cta" href="#install">Install the CLI</a></nav>`,
  )
  .replace(/<a class="btn btn-ghost btn-sm hide-mobile" href="\/auth\/sign-in">[\s\S]*?<\/a>/, "");

// every link to another page of the app is handled here, by what it means in a one-page file
const swaps = [
  // header and hero: the first step that works from this file is installing the CLI
  [/(<a class="btn btn-primary btn-sm hide-mobile") href="\/auth\/sign-up">(<span>)Get started(<\/span>)/, '$1 href="#install">$2Install the CLI$3'],
  [/(<a class="btn btn-primary btn-lg") href="\/auth\/sign-up">(<span>)Get started free(<\/span>)/, '$1 href="#install">$2Install the CLI$3'],
  [/<a class="btn btn-lg" href="\/docs">(<svg[\s\S]*?<\/svg>)<span>Install the CLI<\/span><\/a>/, '<a class="btn btn-lg" href="#how"><span>See how it works</span></a>'],
  // "How Guard works" and the others lead to the features page, which is not in this file
  [/<a class="module-link" href="\/features#[a-z]+">[\s\S]*?<\/a>/g, ""],
  [/ <a href="\/docs">Read the quickstart<\/a>\./, ""],
  [/The <a href="\/security">security model<\/a> lists every limit in detail\./, "Its known limits are listed in docs/SECURITY_LIMITATIONS.md in the repository."],
  // the closing band
  [/(<a class="btn btn-light btn-lg") href="\/auth\/sign-up">(<span>)Create your team(<\/span>)/, '$1 href="#install">$2Install the CLI$3'],
  [/(<a class="btn btn-outline-light btn-lg") href="\/security">(<span>)Security model(<\/span>)/, '$1 href="#faq">$2Read the answers$3'],
  // footer: the columns list the app's pages; here they list this page's sections
  [/<nav class="footer-col"[\s\S]*<\/nav>(\s*<\/div>\s*<div class="shell footer-bottom">)/, `<nav class="footer-col" aria-label="On this page"><h3>On this page</h3><ul>${SECTIONS.map(([href, label]) => `<li><a href="${href}">${label}</a></li>`).join("")}</ul></nav>$1`],
  [/The security model lists what it does not cover\./, "Its known limits are listed in docs/SECURITY_LIMITATIONS.md."],
  [/href="\/"/g, 'href="#main"'],
];
for (const [from, to] of swaps) {
  const before = body;
  body = body.replace(from, to);
  if (body === before) throw new Error(`preview: expected markup not found for ${from}`);
}
const leftover = [...body.matchAll(/href="(\/[^"]*)"/g)].map((m) => m[1]);
if (leftover.length) throw new Error(`preview: links to other pages left over: ${[...new Set(leftover)].join(" ")}`);

const note =
  '<div class="preview-bar" role="note"><div class="shell">Preview: the Verfy home page in one file. The console and the chain demo run the real Verfy rules in your browser. Sign-up and the team dashboard are part of the web app.</div></div>';

/* ---------------------------------------------------------------- styles */
const css = [
  read("src/app/globals.css"),
  `:root { --font-inter: "Inter"; --font-source-serif: "Source Serif 4"; --font-plex-mono: "IBM Plex Mono"; }
.preview-bar { background: var(--text); color: var(--bg); font-family: var(--font-mono); font-size: 0.74rem; line-height: 1.5; letter-spacing: 0.01em; padding: 9px 0; }
.nav a[aria-current="location"] { color: var(--text); }
.nav a[aria-current="location"]::after { content: ""; position: absolute; left: 12px; right: 12px; bottom: -16px; height: 2px; background: var(--accent); }
.mobile-nav a[aria-current="location"] { color: var(--accent); }`,
].join("\n");

/* ---------------------------------------------------------------- scripts */
const engineSource = read("src/core/engine/verfy-engine.mjs");
if ((engineSource.match(/^export\b/gm) ?? []).length !== 1) throw new Error("verfy-engine.mjs: expected exactly one export");
const iconSource = read("src/components/icons.tsx");
const ICON_NAMES = ["check", "x", "alert", "shieldCheck", "history", "file", "copy", "menu", "link"];
const icons = Object.fromEntries(
  ICON_NAMES.map((name) => {
    const m = iconSource.match(new RegExp(`\\n  ${name}: "([^"]+)"`));
    if (!m) throw new Error(`icon ${name} not found`);
    return [name, m[1]];
  }),
);
const json = (v) => JSON.stringify(v).replace(/</g, "\\u003c");
const runtime = [
  "(() => {",
  engineSource.replace(/^export function createEngine/m, "function createEngine"),
  `const PATTERNS = ${json(JSON.parse(read("verfy-cli/src/verfy/data/patterns.json")))};`,
  `const DEFAULT_POLICY = ${json(JSON.parse(read("verfy-cli/src/verfy/data/default_policy.json")))};`,
  `const ICONS = ${json(icons)};`,
  read("scripts/preview/runtime.js"),
  "})();",
].join("\n");
if (runtime.includes("</script")) throw new Error("inlined script would close its tag early");

// theme from the last visit, and motion only when the visitor allows it (removed again if the runtime never starts)
const boot = `(function(){var r=document.documentElement;try{var t=localStorage.getItem("verfy_theme");if(t==="dark"||t==="light")r.dataset.theme=t;if(t==="dark")document.querySelector('meta[name="theme-color"]').content="#0d0e11"}catch(e){}if(!window.matchMedia("(prefers-reduced-motion: reduce)").matches){r.dataset.fx="";setTimeout(function(){if(!r.dataset.fxReady)delete r.dataset.fx},2500)}})();`;

const favicon = `data:image/svg+xml,${encodeURIComponent(read("src/app/icon.svg").trim())}`;
const html = `<!doctype html>
<html lang="en" data-theme="light">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="description" content="Verfy sits between your coding agent and its tools: deterministic allow, ask or deny for every step, and signed receipts that prove what happened.">
<meta name="theme-color" content="#f6f5f1">
<title>Preview · Verfy: control what your AI agents do, and prove what they did</title>
<link rel="icon" href="${favicon}">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500&family=Inter:wght@400..700&family=Source+Serif+4:opsz,wght@8..60,600..700&display=swap" rel="stylesheet">
<script>${boot}</script>
<style>
${css}
</style>
</head>
<body>
${note}
${body}
<script>
${runtime}
</script>
</body>
</html>
`;

for (const out of outs) {
  writeFileSync(out, html);
  console.log(`wrote ${out} (${Math.round(Buffer.byteLength(html) / 1024)} KB)`);
}
