import fs from 'fs';
import path from 'path';

export function isLocalDev(): boolean {
  // If we're inside node_modules, it's definitely NOT local dev
  if (__dirname.includes('node_modules')) {
    return false;
  }

  try {
    // Check if we're in the promptfoo development directory by looking for specific dev files
    const projectRoot = path.resolve(__dirname, '..', '..');
    const devFileChecks = [
      // Check for development-specific files that wouldn't be in the published package
      path.join(projectRoot, '.git'),
    ];

    // If any of these dev files exist, we're in the development environment
    return devFileChecks.some((file) => fs.existsSync(file));
  } catch {
    // If there's any error in checking (e.g., permission issues), assume we're not in dev
    return false;
  }
}
