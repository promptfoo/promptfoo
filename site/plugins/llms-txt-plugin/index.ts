import * as fs from 'fs';
import * as path from 'path';
import type { LoadContext, Plugin } from '@docusaurus/types';

interface PluginContent {
  allMdx: string[];
}

interface RouteMetadata {
  title?: string;
  description?: string;
  permalink?: string;
}

export default function llmsTxtPlugin(context: LoadContext): Plugin<PluginContent> {
  return {
    name: 'llms-txt-plugin',
    loadContent: async (): Promise<PluginContent> => {
      const { siteDir } = context;
      const docsDir = path.join(siteDir, 'docs');
      const allMdx: string[] = [];

      // Recursive function to get all mdx/md files
      const getMdFiles = async (dir: string): Promise<void> => {
        const entries = await fs.promises.readdir(dir, { withFileTypes: true });

        for (const entry of entries) {
          const fullPath = path.join(dir, entry.name);
          if (entry.isDirectory()) {
            await getMdFiles(fullPath);
          } else if (entry.name.endsWith('.md') || entry.name.endsWith('.mdx')) {
            const content = await fs.promises.readFile(fullPath, 'utf8');
            allMdx.push(content);
          }
        }
      };

      await getMdFiles(docsDir);
      return { allMdx };
    },
    postBuild: async ({ content, routesPaths, outDir }) => {
      const { allMdx } = content;

      // Write concatenated MDX content
      const concatenatedPath = path.join(outDir, 'llms-full.txt');
      await fs.promises.writeFile(concatenatedPath, allMdx.join('\n\n---\n\n'));

      // Process routes - use routesPaths which is a string[] of all routes
      const docsRoutes: string[] = [];

      // Filter for docs paths and generate entries
      // This is a simpler approach than the original since we don't have access to all route metadata
      // but it provides the basic structure needed for llms.txt
      for (const routePath of routesPaths) {
        if (routePath.startsWith('/docs/')) {
          // Extract a title from the route path as fallback
          const pathParts = routePath.split('/').filter(Boolean);
          const lastPart = pathParts[pathParts.length - 1];
          const title = lastPart
            .split('-')
            .map(part => part.charAt(0).toUpperCase() + part.slice(1))
            .join(' ');
          
          docsRoutes.push(`- [${title}](${routePath})`);
        }
      }

      // Build up llms.txt file
      const llmsTxt = `# ${context.siteConfig.title}\n\n## Docs\n\n${docsRoutes.join('\n')}`;

      // Write llms.txt file
      const llmsTxtPath = path.join(outDir, 'llms.txt');
      try {
        fs.writeFileSync(llmsTxtPath, llmsTxt);
        console.log('Successfully created llms.txt and llms-full.txt files.');
      } catch (err) {
        console.error('Error writing llms.txt file:', err);
        throw err;
      }
    },
  };
} 