// Use the isolated formatter's Markdown parser for reference links, titles, code and nested labels.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const plugin = resolve(process.argv[2], 'node_modules/prettier/plugins/markdown.mjs');
const { parsers } = await import(pathToFileURL(plugin));
const root = await parsers.markdown.parse(readFileSync(0, 'utf8'));
const urls = [];
const html = [];
const used = new Set();
const definitions = new Map();

function visit(node) {
  if (node.type === 'link' || node.type === 'image') {
    urls.push(node.url);
  } else if (node.type === 'linkReference' || node.type === 'imageReference') {
    used.add(node.identifier);
  } else if (node.type === 'definition' && !definitions.has(node.identifier)) {
    definitions.set(node.identifier, node.url);
  } else if (node.type === 'html') {
    html.push(node.value);
  }
  node.children?.forEach(visit);
}

visit(root);
for (const id of used) {
  if (definitions.has(id)) {
    urls.push(definitions.get(id));
  }
}
process.stdout.write(JSON.stringify({ urls, html }));
