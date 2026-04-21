#!/usr/bin/env node

import fs from 'node:fs';

fs.writeFileSync(process.env.PROMPTFOO_CAPTURE_PATH, process.argv[2] || '');
process.stdout.write('{"verdict":"yes"}');
