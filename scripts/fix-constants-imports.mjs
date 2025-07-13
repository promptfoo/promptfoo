#!/usr/bin/env node

import { readFile, writeFile } from 'fs/promises';
import { glob } from 'glob';

console.log('Fixing constants imports...');

const files = await glob('dist/**/*.js');

for (const file of files) {
  let content = await readFile(file, 'utf-8');
  let modified = false;

  // Fix imports from './constants/index.js' to './constants.js'
  const regex1 = /from\s+(['"])\.\/constants\/index\.js\1/g;
  if (regex1.test(content)) {
    content = content.replace(regex1, 'from $1./constants.js$1');
    modified = true;
  }

  // Fix incorrect imports in globalConfig directory - they should use '../' instead of './'
  if (file.includes('globalConfig/')) {
    // Fix './constants.js' to '../constants.js'
    if (content.includes("from './constants.js'")) {
      content = content.replace(/from\s+(['"])\.\/constants\.js\1/g, 'from $1../constants.js$1');
      modified = true;
    }
    // Fix './envars.js' to '../envars.js'
    if (content.includes("from './envars.js'")) {
      content = content.replace(/from\s+(['"])\.\/envars\.js\1/g, 'from $1../envars.js$1');
      modified = true;
    }
    // Fix './fetch.js' to '../fetch.js'
    if (content.includes("from './fetch.js'")) {
      content = content.replace(/from\s+(['"])\.\/fetch\.js\1/g, 'from $1../fetch.js$1');
      modified = true;
    }
    // Fix './generated-constants.js' to '../generated-constants.js'
    if (content.includes("from './generated-constants.js'")) {
      content = content.replace(
        /from\s+(['"])\.\/generated-constants\.js\1/g,
        'from $1../generated-constants.js$1',
      );
      modified = true;
    }
    // Fix './logger.js' to '../logger.js'
    if (content.includes("from './logger.js'")) {
      content = content.replace(/from\s+(['"])\.\/logger\.js\1/g, 'from $1../logger.js$1');
      modified = true;
    }
    // Remove circular import of globalConfig/accounts.js
    if (content.includes("from './globalConfig/accounts.js'")) {
      content = content.replace(
        /import\s+\{[^}]+\}\s+from\s+['"]\.\/globalConfig\/accounts\.js['"];\s*/g,
        '',
      );
      modified = true;
    }
  }

  // Fix imports from '../constants/index.js' to '../constants.js'
  const regex2 = /from\s+(['"])\.\.\/constants\/index\.js\1/g;
  if (regex2.test(content)) {
    content = content.replace(regex2, 'from $1../constants.js$1');
    modified = true;
  }

  // Also fix '../../constants/index.js' to '../../constants.js'
  const regex3 = /from\s+(['"])\.\.\/\.\.\/constants\/index\.js\1/g;
  if (regex3.test(content)) {
    content = content.replace(regex3, 'from $1../../constants.js$1');
    modified = true;
  }

  // Fix '../redteam/constants/index.js' to '../redteam/constants.js'
  const regex4 = /from\s+(['"])\.\.\/redteam\/constants\/index\.js\1/g;
  if (regex4.test(content)) {
    content = content.replace(regex4, 'from $1../redteam/constants.js$1');
    modified = true;
  }

  // Fix './redteam/constants/index.js' to './redteam/constants.js'
  const regex5 = /from\s+(['"])\.\/redteam\/constants\/index\.js\1/g;
  if (regex5.test(content)) {
    content = content.replace(regex5, 'from $1./redteam/constants.js$1');
    modified = true;
  }

  if (modified) {
    await writeFile(file, content);
    console.log(`Fixed constants imports in: ${file}`);
  }
}

console.log('Constants import fixing complete!');
