import { isMissingPackageImportError } from './packageImportErrors';

export { blockExecutableScripts } from './scriptExecution';

export async function loadMcpDependency<T>(dependency: Promise<T>): Promise<T> {
  try {
    return await dependency;
  } catch (error) {
    if (isMissingPackageImportError(error, '@modelcontextprotocol/sdk')) {
      throw new Error(
        'The @modelcontextprotocol/sdk package is required for MCP server support. Install it with: npm install @modelcontextprotocol/sdk',
      );
    }
    throw error;
  }
}
