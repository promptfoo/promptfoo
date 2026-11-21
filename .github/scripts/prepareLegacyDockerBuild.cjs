const fs = require('node:fs');

const dockerfilePath = 'Dockerfile';
let dockerfile = fs.readFileSync(dockerfilePath, 'utf8');
const oldCliLinks =
  'RUN npm link promptfoo && \\\n    chown promptfoo:promptfoo /app/node_modules/promptfoo && \\';
const manifest = JSON.parse(fs.readFileSync('package.json', 'utf8'));

// Read-only validation can exercise older releases. Publication always runs
// the workflow revision's complete final-image and update-guidance checks.
if (process.env.RUN_CURRENT_IMAGE_CHECKS === 'true') {
  const missing = ['PROMPTFOO_RUNNING_IN_DOCKER', 'PROMPTFOO_OFFICIAL_DOCKER_IMAGE'].filter(
    (name) => !dockerfile.includes(`ENV ${name}=`),
  );
  if (!manifest.exports?.['./contracts']) {
    missing.push('promptfoo/contracts');
  }
  if (missing.length) {
    throw new Error(
      `Release ${manifest.version} lacks ${missing.join(', ')}. Disable publish_legacy_image to validate only.`,
    );
  }
}

if (dockerfile.includes(oldCliLinks)) {
  repairLegacyLinks();
} else {
  if (process.env.PYTHON_VERSION || process.env.EXCLUDE_LEGACY_FRONTEND_TESTS === 'true') {
    throw new Error('Build overrides require the historical npm-link stage');
  }
  console.log('Building the tagged source without changes');
}

function repairLegacyLinks() {
  // Only these two CLI paths shipped before #9790. Never interpolate arbitrary
  // paths from the tagged package.json into a Dockerfile RUN instruction.
  const cli = manifest.bin?.promptfoo;
  if (!['dist/src/main.js', 'dist/src/entrypoint.js'].includes(cli) || manifest.bin.pf !== cli) {
    throw new Error('Unrecognized historical promptfoo and pf binaries');
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
      '    ln -s /app/' + cli + ' /usr/local/bin/promptfoo && \\',
      '    ln -s /app/' + cli + ' /usr/local/bin/pf && \\',
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

  fs.writeFileSync(dockerfilePath, dockerfile);
  console.log('Linked the historical release CLI from local build artifacts');
}
