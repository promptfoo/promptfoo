import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), 'repos');
const fixtures = {
  catalog: ['ideas.md', 'main.mjs', 'package.json'],
  connection: ['contract.md'],
  monorepo: [
    'apps/billing/main.mjs',
    'apps/image-worker/main.mjs',
    'apps/image-worker/worker.mjs',
    'apps/image-worker/gateway.mjs',
  ],
  partial: ['checkout.md', 'deployment.yaml'],
  'support-agent': ['app.mjs', 'retrieved-content.txt'],
};

// Render and grade against the same finite snapshot. Model-supplied paths never reach fs.
export function sources(repo) {
  if (!Object.hasOwn(fixtures, repo)) {
    throw new Error('Unknown fixture repository');
  }
  return new Map(
    fixtures[repo].map((name) => {
      const file = path.join(root, repo, name);
      const stat = fs.lstatSync(file);
      if (fs.realpathSync(file) !== file || !stat.isFile() || stat.size > 32_768) {
        throw new Error('Invalid fixture file');
      }
      return [name, fs.readFileSync(file, 'utf8').split(/\r?\n/)];
    }),
  );
}

export default function includeSources(vars) {
  const source = Array.from(sources(vars.repo), ([name, lines]) =>
    [name, ...lines.map((line, i) => `${i + 1} ${line}`)].join('\n'),
  ).join('\n\n');
  return { ...vars, source };
}
