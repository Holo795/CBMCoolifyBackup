#!/usr/bin/env node
// Build the GitHub wiki from docs/: one page per file, links rewritten to wiki
// pages, screenshots copied, plus a sidebar and a footer. docs/ stays the source
// (versioned with the code); .github/workflows/wiki.yml publishes the result.
//
//   node scripts/build-wiki.mjs [docsDir] [outDir]
import { mkdir, readdir, readFile, rm, writeFile, copyFile } from "node:fs/promises";
import { join } from "node:path";

const DOCS = process.argv[2] ?? "docs";
const OUT = process.argv[3] ?? "wiki-out";
const REPO = `https://github.com/${process.env.GITHUB_REPOSITORY ?? "Holo795/CBMCoolifyBackup"}`;

/** docs file -> wiki page name (the page's URL and file name). */
const PAGES = {
  "README.md": "Home",
  "installation.md": "Installation",
  "configuration.md": "Configuration",
  "accounts.md": "Accounts-and-roles",
  "email.md": "Email-SMTP",
  "destinations.md": "Destinations",
  "backups.md": "Backups",
  "restore.md": "Restore",
  "disaster-recovery.md": "Disaster-recovery",
  "reconciliation-retention.md": "Reconciliation-and-retention",
  "multi-server.md": "Multi-server",
  "alerts.md": "Alerts",
  "mcp.md": "MCP-server",
  "security.md": "Security",
  "troubleshooting.md": "Troubleshooting",
};

/** Sidebar sections: [title, [docs file, label][]]. */
const SIDEBAR = [
  ["Getting started", [["installation.md", "Installation"], ["configuration.md", "Configuration"], ["accounts.md", "Accounts & roles"], ["email.md", "Email (SMTP)"]]],
  ["Backups", [["destinations.md", "Destinations"], ["backups.md", "Backups"], ["restore.md", "Restore"], ["disaster-recovery.md", "Disaster recovery"], ["reconciliation-retention.md", "Reconciliation & retention"]]],
  ["Running CBM", [["multi-server.md", "Multi-server"], ["alerts.md", "Alerts"], ["mcp.md", "MCP server"], ["security.md", "Security"], ["troubleshooting.md", "Troubleshooting / FAQ"]]],
];

/** A link target as written in docs/ -> its target in the wiki. */
export function wikiTarget(target) {
  if (/^[a-z]+:|^#|^mailto:/i.test(target)) return target; // absolute URL or same-page anchor
  const [path, anchor] = target.split("#");
  const page = PAGES[path];
  if (page) return anchor ? `${page}#${anchor}` : page;
  if (path.startsWith("screenshots/")) return `images/${path.slice("screenshots/".length)}`;
  if (path.startsWith("../")) {
    const file = path.slice(3);
    const kind = file === "" || file.endsWith("/") ? "tree" : "blob";
    return `${REPO}/${kind}/main/${file}${anchor ? `#${anchor}` : ""}`;
  }
  throw new Error(`docs link with no wiki target: ${target}`);
}

/** Rewrite every markdown link and image of a page (outside code spans/blocks). */
export function rewriteLinks(md) {
  const parts = md.split(/(```[\s\S]*?```|`[^`\n]*`)/);
  return parts.map((p, i) => (i % 2 ? p : p.replace(/(!?\[[^\]]*\])\(([^)\s]+)\)/g, (_, text, t) => `${text}(${wikiTarget(t)})`))).join("");
}

/** GitHub's anchor for a heading (as github-slugger does it). */
export function slug(heading) {
  return heading
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s_-]/gu, "")
    .replace(/\s/g, "-");
}

/** Anchors of a page's headings (outside code blocks), duplicates numbered like GitHub. */
export function anchors(md) {
  const seen = new Map();
  const out = new Set();
  for (const line of md.replace(/```[\s\S]*?```/g, "").split("\n")) {
    const m = /^#{1,6}\s+(.+?)\s*#*\s*$/.exec(line);
    if (!m) continue;
    const base = slug(m[1].replace(/`/g, ""));
    const n = seen.get(base) ?? 0;
    seen.set(base, n + 1);
    out.add(n ? `${base}-${n}` : base);
  }
  return out;
}

/** Links to an anchor that no heading of the target page has. */
export function brokenAnchors(docs) {
  const byFile = new Map(Object.entries(docs).map(([f, md]) => [f, anchors(md)]));
  const broken = [];
  for (const [f, md] of Object.entries(docs)) {
    const text = md.replace(/```[\s\S]*?```|`[^`\n]*`/g, "");
    for (const [, target] of text.matchAll(/\]\(([^)\s]+)\)/g)) {
      const [path, anchor] = target.split("#");
      if (!anchor || /^[a-z]+:/i.test(target)) continue;
      const page = path === "" ? f : path;
      if (byFile.has(page) && !byFile.get(page).has(anchor)) broken.push(`${f}: ${target}`);
    }
  }
  return broken;
}

async function main() {
  const files = (await readdir(DOCS)).filter((f) => f.endsWith(".md"));
  const missing = files.filter((f) => !PAGES[f]);
  if (missing.length) throw new Error(`docs page(s) not mapped to a wiki page in scripts/build-wiki.mjs: ${missing.join(", ")}`);
  const docs = Object.fromEntries(await Promise.all(files.map(async (f) => [f, await readFile(join(DOCS, f), "utf8")])));
  const broken = brokenAnchors(docs);
  if (broken.length) throw new Error(`link(s) to a heading that doesn't exist:\n  ${broken.join("\n  ")}`);
  await rm(OUT, { recursive: true, force: true });
  await mkdir(join(OUT, "images"), { recursive: true });
  for (const f of files) await writeFile(join(OUT, `${PAGES[f]}.md`), rewriteLinks(docs[f]));
  for (const img of await readdir(join(DOCS, "screenshots")).catch(() => [])) {
    await copyFile(join(DOCS, "screenshots", img), join(OUT, "images", img));
  }
  const sidebar = [
    "**[Home](Home)**",
    "",
    ...SIDEBAR.flatMap(([title, items]) => [`**${title}**`, "", ...items.map(([f, label]) => `- [${label}](${PAGES[f]})`), ""]),
    `[Repository](${REPO}) · [Releases](${REPO}/releases)`,
  ];
  await writeFile(join(OUT, "_Sidebar.md"), `${sidebar.join("\n")}\n`);
  await writeFile(
    join(OUT, "_Footer.md"),
    `These pages are generated from [\`docs/\`](${REPO}/tree/main/docs) on every change to \`main\`: ` +
      `edit the files there (a change made here is overwritten).\n`,
  );
  console.log(`wiki: ${files.length} page(s) in ${OUT}`);
}

if (import.meta.url === `file://${process.argv[1]}`) await main();
