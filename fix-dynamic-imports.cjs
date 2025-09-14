#!/usr/bin/env node

const fs = require('fs');

// Fix dynamic require() calls and remaining import issues
const fixes = [
  // telemetry.test.ts dynamic requires
  {
    file: 'test/telemetry.test.ts',
    pattern: "require('../src/telemetry')",
    replacement: "require('../src/telemetry.js')"
  },
  {
    file: 'test/telemetry.test.ts',
    pattern: "require('../src/logger')",
    replacement: "require('../src/logger.js')"
  },
  {
    file: 'test/telemetry.test.ts',
    pattern: "require('../src/constants')",
    replacement: "require('../src/constants.js')"
  },

  // Other remaining import issues
  {
    file: 'test/tracing/evaluatorTracing.test.ts',
    pattern: "from '../../src/tracing/evaluatorTracing'",
    replacement: "from '../../src/tracing/evaluatorTracing.js'"
  },
  {
    file: 'test/tracing/integration.test.ts',
    pattern: "from '../../src/index'",
    replacement: "from '../../src/index.js'"
  },
  {
    file: 'test/tracing/store.test.ts',
    pattern: "from '../../src/tracing/store'",
    replacement: "from '../../src/tracing/store.js'"
  },
  {
    file: 'test/types/index.test.ts',
    pattern: "from '../../src/types'",
    replacement: "from '../../src/types/index.js'"
  },
  {
    file: 'test/updates.test.ts',
    pattern: "from '../src/updates'",
    replacement: "from '../src/updates.js'"
  },
  {
    file: 'test/util/cloud.test.ts',
    pattern: "from '../../src/util/cloud'",
    replacement: "from '../../src/util/cloud.js'"
  },

  // Fix JSON import in updates.test.ts
  {
    file: 'test/updates.test.ts',
    pattern: "from '../package.json'",
    replacement: "from '../package.json' with { type: 'json' }"
  },

  // Fix remaining util/index imports
  {
    file: 'test/util/index.test.ts',
    pattern: "from '../../src/util'",
    replacement: "from '../../src/util/index.js'"
  },
];

let totalFixed = 0;

fixes.forEach(({ file, pattern, replacement }) => {
  if (fs.existsSync(file)) {
    let content = fs.readFileSync(file, 'utf8');
    if (content.includes(pattern)) {
      content = content.replace(new RegExp(pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), replacement);
      fs.writeFileSync(file, content);
      console.log(`Fixed ${file}: ${pattern} -> ${replacement}`);
      totalFixed++;
    }
  } else {
    console.log(`File not found: ${file}`);
  }
});

console.log(`\nFixed ${totalFixed} dynamic import/require issues.`);