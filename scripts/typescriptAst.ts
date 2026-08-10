import { type Node, type Program, parseSync, visitorKeys } from 'oxc-parser';

export function parseTypeScriptSource(filePath: string, sourceText: string): Program {
  const result = parseSync(filePath, sourceText);
  if (result.errors.length > 0) {
    throw new Error(`Could not parse ${filePath}: ${result.errors[0].message}`);
  }
  return result.program;
}

export function forEachTypeScriptChild(node: Node, callback: (child: Node) => void): void {
  const properties = node as unknown as Record<string, unknown>;

  for (const key of visitorKeys[node.type] ?? []) {
    const children = properties[key];
    if (Array.isArray(children)) {
      for (const child of children) {
        if (isAstNode(child)) {
          callback(child);
        }
      }
    } else if (isAstNode(children)) {
      callback(children);
    }
  }
}

function isAstNode(value: unknown): value is Node {
  return typeof value === 'object' && value !== null && 'type' in value;
}
