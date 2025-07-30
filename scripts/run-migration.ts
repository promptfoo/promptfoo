#!/usr/bin/env node
import { up, down } from '../src/migrations/001_add_eval_results_indices';

async function runMigration() {
  const command = process.argv[2];
  
  if (command === 'up') {
    console.log('🚀 Running migration UP...\n');
    await up();
  } else if (command === 'down') {
    console.log('🔽 Running migration DOWN...\n');
    await down();
  } else {
    console.log('Usage: npm run migration:indices [up|down]');
    console.log('  up   - Create indices');
    console.log('  down - Remove indices');
    process.exit(1);
  }
}

runMigration().catch(error => {
  console.error('Migration failed:', error);
  process.exit(1);
});