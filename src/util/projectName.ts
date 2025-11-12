import * as path from 'path';
import * as fs from 'fs';

/**
 * Gets the project name for the current application
 * This will be used to filter results in the dashboard
 */
export function getProjectName(): string {
  // Check if there's an explicit project name set via environment variable
  const explicitProjectName = process.env.PROMPTFOO_PROJECT_NAME;
  if (explicitProjectName) {
    return explicitProjectName;
  }

  // Try to get project name from package.json in the current working directory
  try {
    const cwd = process.cwd();
    const packageJsonPath = path.join(cwd, 'package.json');
    
    if (fs.existsSync(packageJsonPath)) {
      const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
      if (packageJson.name) {
        // Clean up the package name (remove scope prefix, replace special chars)
        return packageJson.name.replace(/^@[^/]+\//, '').replace(/[^a-zA-Z0-9_-]/g, '_');
      }
    }
  } catch (error) {
    // If package.json reading fails, continue to fallback
  }

  // Try to get project name from the current directory name
  try {
    const cwd = process.cwd();
    const dirName = path.basename(cwd);
    if (dirName && dirName !== '/' && dirName !== '.') {
      return dirName.replace(/[^a-zA-Z0-9_-]/g, '_');
    }
  } catch (error) {
    // If directory name fails, continue to fallback
  }

  // Final fallback
  return 'unknown_project';
}

/**
 * Enhances metadata with project identification information
 */
export function enhanceMetadataWithProjectInfo(
  metadata: Record<string, any> = {}
): Record<string, any> {
  const projectName = getProjectName();
  
  return {
    ...metadata,
    projectName,
    // Add timestamp for when this metadata was enhanced
    projectMetadataTimestamp: new Date().toISOString(),
  };
}