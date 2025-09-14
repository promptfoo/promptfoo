#!/usr/bin/env node

const fs = require('fs');

// Specific import fixes based on the build errors
const fixes = [
  // Files with TS2834 errors (consider adding extension to import path)
  {
    file: 'test/util/config/load.test.ts',
    pattern: "from '../../../src/util/config/load'",
    replacement: "from '../../../src/util/config/load.js'",
  },
  {
    file: 'test/util/exportToFile/index.test.ts',
    pattern: "from '../../../src/util/exportToFile'",
    replacement: "from '../../../src/util/exportToFile/index.js'",
  },
  {
    file: 'test/util/index.test.ts',
    pattern: "from '../../src/util'",
    replacement: "from '../../src/util/index.js'",
  },

  // Files with TS2835 errors that were missed
  {
    file: 'test/util/file.test.ts',
    pattern: "from '../../src/util/file'",
    replacement: "from '../../src/util/file.js'",
  },
  {
    file: 'test/util/file.test.ts',
    pattern: "from '../../src/util/fileExtensions'",
    replacement: "from '../../src/util/fileExtensions.js'",
  },
  {
    file: 'test/util/functions/loadFunction.test.ts',
    pattern: "from '../../../src/util/functions/loadFunction'",
    replacement: "from '../../../src/util/functions/loadFunction.js'",
  },
  {
    file: 'test/util/json.test.ts',
    pattern: "from '../../src/util/json'",
    replacement: "from '../../src/util/json.js'",
  },
  {
    file: 'test/util/server.test.ts',
    pattern: "from '../../src/util/server'",
    replacement: "from '../../src/util/server.js'",
  },
  {
    file: 'test/util/templates.test.ts',
    pattern: "from '../../src/util/templates'",
    replacement: "from '../../src/util/templates.js'",
  },
  {
    file: 'test/util/testCaseReader.test.ts',
    pattern: "from '../../src/util/testCaseReader'",
    replacement: "from '../../src/util/testCaseReader.js'",
  },
  {
    file: 'test/util/tokenUsageUtils.test.ts',
    pattern: "from '../../src/util/tokenUsageUtils'",
    replacement: "from '../../src/util/tokenUsageUtils.js'",
  },
  {
    file: 'test/utils/modelAuditCliParser.test.ts',
    pattern: "from '../../src/util/modelAuditCliParser'",
    replacement: "from '../../src/util/modelAuditCliParser.js'",
  },
  {
    file: 'test/validators/redteam.test.ts',
    pattern: "from '../../src/redteam/constants'",
    replacement: "from '../../src/redteam/constants.js'",
  },
  {
    file: 'test/validators/redteam.test.ts',
    pattern: "from '../../src/validators/redteam'",
    replacement: "from '../../src/validators/redteam.js'",
  },
];

let totalFixed = 0;

fixes.forEach(({ file, pattern, replacement }) => {
  if (fs.existsSync(file)) {
    const content = fs.readFileSync(file, 'utf8');
    if (content.includes(pattern)) {
      const newContent = content.replace(
        new RegExp(pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'),
        replacement,
      );
      fs.writeFileSync(file, newContent);
      console.log(`Fixed ${file}: ${pattern} -> ${replacement}`);
      totalFixed++;
    }
  } else {
    console.log(`File not found: ${file}`);
  }
});

console.log(`\nFixed ${totalFixed} specific import issues.`);
