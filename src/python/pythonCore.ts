
// Re-export everything from legacy for now, then we can optimize internally
export {
  state,
  tryPath,
  validatePythonPath,
  getSysExecutable,
  runPython as runPythonLegacy,
} from './pythonUtils.legacy';

/**
 * Enhanced Python error messages with context and suggestions
 */
export class PythonExecutionError extends Error {
  constructor(
    message: string,
    public readonly pythonPath?: string,
    public readonly functionName?: string,
    public readonly cause?: Error,
    public readonly suggestions?: string[],
  ) {
    super(message);
    this.name = 'PythonExecutionError';
  }

  static fromPythonError(
    originalError: Error,
    context: {
      pythonPath?: string;
      functionName?: string;
      content?: string;
    },
  ): PythonExecutionError {
    const suggestions: string[] = [];

    if (originalError.message.includes('is not defined')) {
      suggestions.push('Check function name spelling and availability');
      if (context.content) {
        const functions = extractFunctionNames(context.content);
        if (functions.length > 0) {
          suggestions.push(`Available functions: ${functions.join(', ')}`);
        }
      }
    }

    if (originalError.message.includes('SyntaxError')) {
      suggestions.push('Check Python syntax and indentation');
      suggestions.push('Ensure code is properly formatted');
    }

    if (originalError.message.includes('ModuleNotFoundError')) {
      suggestions.push('Install missing Python package or check import statement');
    }

    return new PythonExecutionError(
      originalError.message,
      context.pythonPath,
      context.functionName,
      originalError,
      suggestions,
    );
  }

  toString(): string {
    let errorMsg = `${this.name}: ${this.message}`;

    if (this.functionName) {
      errorMsg += `\nFunction: ${this.functionName}`;
    }

    if (this.suggestions && this.suggestions.length > 0) {
      errorMsg += `\nSuggestions:\n  - ${this.suggestions.join('\n  - ')}`;
    }

    return errorMsg;
  }
}

/**
 * Python AST-style analyzer for code structure detection
 */
export interface PythonASTNode {
  type: 'function' | 'class' | 'import' | 'variable' | 'expression';
  name: string;
  line: number;
  args?: string[];
  decorators?: string[];
}

export class PythonAST {
  /**
   * Parse Python code and extract structural information
   */
  static parse(content: string): PythonASTNode[] {
    const lines = content.split('\n');
    const nodes: PythonASTNode[] = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmedLine = line.trim();

      // Function definitions
      const funcMatch = trimmedLine.match(/^def\s+(\w+)\s*\(([^)]*)\)\s*:/);
      if (funcMatch) {
        const args = funcMatch[2]
          .split(',')
          .map((arg) => arg.trim().split('=')[0].split(':')[0].trim())
          .filter(Boolean);

        nodes.push({
          type: 'function',
          name: funcMatch[1],
          line: i + 1,
          args,
        });
      }

      // Class definitions
      const classMatch = trimmedLine.match(/^class\s+(\w+)(?:\([^)]*\))?\s*:/);
      if (classMatch) {
        nodes.push({
          type: 'class',
          name: classMatch[1],
          line: i + 1,
        });
      }

      // Import statements
      const importMatch = trimmedLine.match(/^(?:from\s+\w+\s+)?import\s+(.+)/);
      if (importMatch) {
        const imports = importMatch[1].split(',').map((imp) => imp.trim());
        imports.forEach((imp) => {
          nodes.push({
            type: 'import',
            name: imp.split(' as ')[0].trim(),
            line: i + 1,
          });
        });
      }
    }

    return nodes;
  }

  /**
   * Extract all function names from Python content
   */
  static getFunctionNames(content: string): string[] {
    return this.parse(content)
      .filter((node) => node.type === 'function')
      .map((node) => node.name);
  }

  /**
   * Check if content has complete function definitions
   */
  static hasFunctions(content: string): boolean {
    return this.parse(content).some((node) => node.type === 'function');
  }

  /**
   * Detect if content is a Python expression vs complete code
   */
  static isExpression(content: string): boolean {
    const nodes = this.parse(content);
    const hasStructuralElements = nodes.some((node) => ['function', 'class'].includes(node.type));

    // If no structural elements, it's likely an expression
    return !hasStructuralElements;
  }
}

// Re-export shared utilities with enhanced names
export const extractFunctionNames = PythonAST.getFunctionNames;
export const hasPythonFunctions = PythonAST.hasFunctions;
export const isPythonExpression = PythonAST.isExpression;
