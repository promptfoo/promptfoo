const fs = require('node:fs');

// Repair the pre-#9790 CLI links. Tags with the fix already applied must use
// a normal tag_name dispatch, which retains all container-contract checks.
const dockerfilePath = 'Dockerfile';
let dockerfile = fs.readFileSync(dockerfilePath, 'utf8');
const oldCliLinks =
  'RUN npm link promptfoo && \\\n    chown promptfoo:promptfoo /app/node_modules/promptfoo && \\';
if (!dockerfile.includes(oldCliLinks)) {
  throw new Error(
    'Dockerfile has no legacy `npm link promptfoo` stage, so this tag does not need ' +
      'legacy_backfill. Republish it with a plain tag_name dispatch instead.',
  );
}

const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));
if (!packageJson.bin?.promptfoo || !packageJson.bin?.pf) {
  throw new Error('Historical package does not declare promptfoo and pf binaries');
}

const nodeModulesCopy =
  'COPY --from=builder --chown=promptfoo:promptfoo /app/node_modules ./node_modules';
const packageJsonCopy =
  'COPY --from=builder --chown=promptfoo:promptfoo /app/package.json ./package.json';
if (!dockerfile.includes(nodeModulesCopy)) {
  throw new Error('Could not locate the historical runtime dependency copy');
}
if (!dockerfile.includes(packageJsonCopy)) {
  dockerfile = dockerfile.replace(nodeModulesCopy, nodeModulesCopy + '\n' + packageJsonCopy);
}

dockerfile = dockerfile.replace(
  oldCliLinks,
  [
    'ARG OS_PACKAGE_REFRESH=',
    'RUN apk upgrade --no-cache',
    'RUN ln -s /app /app/node_modules/promptfoo && \\',
    '    chown -h promptfoo:promptfoo /app/node_modules/promptfoo && \\',
    '    ln -s /app/' + packageJson.bin.promptfoo + ' /usr/local/bin/promptfoo && \\',
    '    ln -s /app/' + packageJson.bin.pf + ' /usr/local/bin/pf && \\',
  ].join('\n'),
);

if (process.env.PYTHON_VERSION) {
  const pythonPackage = /python3~=\d+\.\d+/;
  if (!dockerfile.includes('python3~=${PYTHON_VERSION}')) {
    if (!pythonPackage.test(dockerfile)) {
      throw new Error('Could not locate the historical Python minor pin');
    }
    dockerfile = dockerfile
      .replace(/^(\s*RUN apk add)/m, 'ARG PYTHON_VERSION\n$1')
      .replace(pythonPackage, 'python3~=${PYTHON_VERSION}');
  }
}

fs.writeFileSync(dockerfilePath, dockerfile);
console.log('Linked the historical release CLI from local build artifacts');

if (process.env.EXCLUDE_LEGACY_FRONTEND_TESTS === 'true') {
  // Insert exclude without rewriting historical JSONC comments or include entries.
  const file = 'src/app/tsconfig.app.json';
  const original = fs.readFileSync(file, 'utf8');
  if (/^\s*"exclude"\s*:/m.test(original)) {
    throw new Error(file + ' already declares "exclude"; reconcile the overlap by hand');
  }
  const updated = original.replace(
    /^(\uFEFF?\s*\{)/,
    '$1\n  "exclude": ["**/*.test.ts", "**/*.test.tsx"],',
  );
  if (updated === original) {
    throw new Error('Could not locate the root object in ' + file);
  }
  fs.writeFileSync(file, updated);
  console.log('Excluded historical test-only frontend dependencies');
}
