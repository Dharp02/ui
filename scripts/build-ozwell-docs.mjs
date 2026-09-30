#!/usr/bin/env node
/**
 * Build the docs corpus the embedded Ozwell assistant answers
 * "how do I use X?" questions from (.storybook/manager-head.html,
 * get_component_docs tool).
 *
 * Extracts, into .storybook/public/ozwell/docs.json:
 * - src/catalog/*.mdx        → per-category selection guidance ("Which one?")
 * - src/components/** JSDoc  → per-component description + @example snippets
 *
 * Runs as part of `storybook`/`build-storybook`; the output is generated,
 * not committed.
 */
import { readFileSync, readdirSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, '.storybook/public/ozwell/docs.json');

/** Strip a JSDoc block to plain text lines (without comment markers). */
function jsdocLines(block) {
  return block
    .split('\n')
    .map((l) => l.replace(/^\s*\/?\*+\/?\s?/, '').replace(/\*\/\s*$/, ''))
    .join('\n')
    .trim()
    .split('\n');
}

/** Parse a JSDoc block into { description, examples[] }. */
function parseJsdoc(block) {
  const lines = jsdocLines(block);
  const description = [];
  const examples = [];
  let example = null;
  for (const line of lines) {
    if (/^@example\b/.test(line)) {
      if (example) examples.push(example.trim());
      example = '';
    } else if (/^@\w+/.test(line)) {
      if (example) examples.push(example.trim());
      example = null; // other tags (@param, @see…) end the example and are skipped
    } else if (example !== null) {
      example += line + '\n';
    } else {
      description.push(line);
    }
  }
  if (example) examples.push(example.trim());
  return { description: description.join('\n').trim(), examples };
}

// --- Category guidance from src/catalog/*.mdx ---------------------------
const categories = {};
const catalogDir = join(root, 'src/catalog');
for (const file of readdirSync(catalogDir)) {
  if (!file.endsWith('.mdx')) continue;
  const raw = readFileSync(join(catalogDir, file), 'utf8');
  const metaTag = raw.match(/<Meta[^>]*\/>/);
  const title = raw.match(/<Meta\s+title="([^"]+)"/)?.[1];
  if (!title || !metaTag) continue;
  // Drop only the MDX preamble (imports + <Meta/>); a global import strip
  // would also delete import lines inside fenced usage examples.
  const content = raw
    .slice(raw.indexOf(metaTag[0]) + metaTag[0].length)
    .trim();
  // 'Inputs/Actions/Overview' → key 'Inputs/Actions'
  const key = title.replace(/\/Overview$/, '');
  categories[key] = { title, content };
}

// --- Component JSDoc from src/components/**/*.tsx -----------------------
const components = {};
const componentsDir = join(root, 'src/components');
const files = readdirSync(componentsDir, { recursive: true })
  .filter(
    (f) =>
      f.endsWith('.tsx') &&
      !/\.(stories|test|spec)\.tsx$/.test(f) &&
      !f.includes('__tests__')
  )
  .map((f) => join(componentsDir, f));

// Matches a JSDoc block (no `*/` inside) directly above a capitalized
// function/const declaration; `export` is optional because many components
// are declared unexported (e.g. React.forwardRef) and exported at the
// bottom of the file.
const exportRe =
  /\/\*\*((?:[^*]|\*(?!\/))*)\*\/\s*(?:export )?(?:function|const) ([A-Z][A-Za-z0-9]*)/g;

for (const file of files) {
  const src = readFileSync(file, 'utf8');
  for (const m of src.matchAll(exportRe)) {
    const [, block, name] = m;
    const { description, examples } = parseJsdoc('/**' + block + '*/');
    if (!description && !examples.length) continue;
    // Keep the richest doc if a name is exported from several files.
    const existing = components[name];
    const score = description.length + examples.join('').length;
    const existingScore = existing
      ? existing.description.length + existing.examples.join('').length
      : -1;
    if (score > existingScore) components[name] = { description, examples };
  }
}

// --- Storybook docs metadata from src/**/*.stories.tsx -------------------
// The `docs.description.component` blocks in the stories files are this
// repo's canonical user-facing guidance (use/don't-use, limitations,
// relationships) and the meta carries the title ↔ export mapping (e.g.
// story 'ReconciliationPanel' → export `AIReconciliationPanel`).
const stories = {};
const srcDir = join(root, 'src');
const storyFiles = readdirSync(srcDir, { recursive: true })
  .filter((f) => f.endsWith('.stories.tsx'))
  .map((f) => join(srcDir, f));

for (const file of storyFiles) {
  const src = readFileSync(file, 'utf8');
  const title = src.match(/\btitle:\s*['"]([^'"]+)['"]/)?.[1];
  if (!title) continue;
  const componentName = src.match(/\bcomponent:\s*([A-Za-z0-9_]+)/)?.[1] ?? null;
  const descMatch = src.match(
    /description:\s*\{\s*component:\s*(?:`((?:[^`\\]|\\[\s\S])*)`|'((?:[^'\\]|\\.)*)')/
  );
  let description = descMatch ? (descMatch[1] ?? descMatch[2]) : null;
  if (description) description = description.replace(/\\([`$'\\])/g, '$1').trim();
  if (componentName || description) {
    stories[title] = { component: componentName, description };
  }
}

mkdirSync(dirname(out), { recursive: true });
writeFileSync(
  out,
  JSON.stringify({
    generatedAt: new Date().toISOString(),
    categories,
    components,
    stories,
  })
);
console.log(
  `ozwell docs: ${Object.keys(components).length} components, ` +
    `${Object.keys(stories).length} story guides, ` +
    `${Object.keys(categories).length} category guides → ${out.replace(root + '/', '')}`
);
