import fs from 'fs';
import yaml from 'js-yaml';
import path from 'path';

/**
 * Represents the structure of package.json file
 */
interface PackageJson {
  license: string;
  version: string;
  description: string;
}

/**
 * Represents the structure of CITATION.cff file
 */
interface Citation {
  'cff-version': string;
  message: string;
  authors: Array<{
    'family-names': string;
    'given-names': string;
  }>;
  title: string;
  version: string;
  'date-released': string;
  url: string;
  'repository-code': string;
  license: string;
  type: string;
  description: string;
  keywords: string[];
}

/**
 * Creates a default Citation object with information from package.json
 * @param packageJson - The parsed package.json file
 * @returns A default Citation object
 */
const createDefaultCitation = (packageJson: PackageJson): Citation => ({
  'cff-version': '1.2.0',
  message: 'If you use this software, please cite it as below.',
  authors: [
    {
      'family-names': 'Webster',
      'given-names': 'Ian',
    },
  ],
  title: 'promptfoo',
  version: packageJson.version,
  'date-released': new Date().toISOString().slice(0, 10),
  url: 'https://promptfoo.dev',
  'repository-code': 'https://github.com/promptfoo/promptfoo',
  license: packageJson.license,
  type: 'software',
  description: packageJson.description,
  keywords: ['llm', 'evaluation', 'evals', 'testing', 'prompt-engineering', 'red-team'],
});

/**
 * Fetches the release date for a specific version from GitHub
 * @param version The version to fetch the release date for
 * @returns Promise<string> The release date in ISO format, or null if not found
 */
async function getReleaseDate(version: string): Promise<string | null> {
  try {
    const response = await fetch(
      `https://api.github.com/repos/promptfoo/promptfoo/releases/tags/${version}`,
    );
    if (!response.ok) {
      if (response.status === 404) {
        console.warn(`No release found for version ${version}`);
        return null;
      }
      throw new Error(`GitHub API request failed: ${response.statusText}`);
    }
    const data = await response.json();
    return data.published_at ? new Date(data.published_at).toISOString().slice(0, 10) : null;
  } catch (error) {
    console.error(`Error fetching release date for version ${version}:`, error);
    return null;
  }
}

/**
 * Updates the CITATION.cff file with the latest information from package.json and GitHub
 * @throws {Error} If there's an issue reading or writing files
 */
export const updateCitation = async (): Promise<void> => {
  const packageJsonPath: string = path.join(__dirname, '../package.json');
  const citationPath: string = path.join(__dirname, '../CITATION.cff');

  const packageJson: PackageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));

  let citation: Citation;
  try {
    citation = yaml.load(fs.readFileSync(citationPath, 'utf8')) as Citation;
  } catch {
    citation = createDefaultCitation(packageJson);
  }
  citation['version'] = packageJson.version;

  const releaseDate = await getReleaseDate(packageJson.version);
  citation['date-released'] = releaseDate || new Date().toISOString().slice(0, 10);

  fs.writeFileSync(citationPath, yaml.dump(citation, { lineWidth: -1 }));

  console.log('CITATION.cff file has been updated.');
};

if (require.main === module) {
  updateCitation().catch(console.error);
}
