import fs from 'node:fs';
import path from 'node:path';

import { globSync } from 'glob';
import ts from 'typescript';
import { checkBorderRequiresColor } from './style-lint/rules/borderRequiresColor';
import config, { type StyleLintConfig, type StyleLintSeverity } from './style-lint.config';

type RuleId = 'border-requires-color';

type StyleRule = {
  id: RuleId;
  run(tokens: string[]): string | null;
};

type ClassGroup = {
  node: ts.Node;
  tokens: string[];
};

type Diagnostic = {
  ruleId: RuleId;
  severity: StyleLintSeverity;
  message: string;
  filePath: string;
  line: number;
  column: number;
};

const RULES: Record<RuleId, StyleRule> = {
  'border-requires-color': {
    id: 'border-requires-color',
    run: checkBorderRequiresColor,
  },
};

function tokenizeClassList(value: string): string[] {
  return value
    .split(/\s+/)
    .map((token) => token.trim())
    .filter(Boolean);
}

function mergeTokens(...tokenLists: string[][]): string[] {
  return Array.from(new Set(tokenLists.flat().filter(Boolean)));
}

function isClassAttributeName(name: ts.JsxAttributeName): boolean {
  return ts.isIdentifier(name) && (name.text === 'className' || name.text === 'class');
}

function isIdentifierWithName(node: ts.LeftHandSideExpression, name: string): boolean {
  return ts.isIdentifier(node) && node.text === name;
}

function extractTokensFromTemplateExpression(expression: ts.TemplateExpression): string[] {
  const textParts = [
    expression.head.text,
    ...expression.templateSpans.map((span) => span.literal.text),
  ];
  return tokenizeClassList(textParts.join(' '));
}

function extractTokensFromExpression(
  expression: ts.Expression | undefined,
  lintConfig: StyleLintConfig,
): string[] {
  if (!expression) {
    return [];
  }

  if (ts.isStringLiteralLike(expression)) {
    return tokenizeClassList(expression.text);
  }

  if (ts.isTemplateExpression(expression)) {
    return extractTokensFromTemplateExpression(expression);
  }

  if (ts.isParenthesizedExpression(expression)) {
    return extractTokensFromExpression(expression.expression, lintConfig);
  }

  if (ts.isConditionalExpression(expression)) {
    return mergeTokens(
      extractTokensFromExpression(expression.whenTrue, lintConfig),
      extractTokensFromExpression(expression.whenFalse, lintConfig),
    );
  }

  if (
    ts.isBinaryExpression(expression) &&
    expression.operatorToken.kind === ts.SyntaxKind.PlusToken
  ) {
    return mergeTokens(
      extractTokensFromExpression(expression.left, lintConfig),
      extractTokensFromExpression(expression.right, lintConfig),
    );
  }

  if (ts.isArrayLiteralExpression(expression)) {
    return mergeTokens(
      ...expression.elements.map((element) =>
        ts.isExpression(element) ? extractTokensFromExpression(element, lintConfig) : [],
      ),
    );
  }

  if (ts.isAsExpression(expression) || ts.isTypeAssertionExpression(expression)) {
    return extractTokensFromExpression(expression.expression, lintConfig);
  }

  if (ts.isSatisfiesExpression(expression)) {
    return extractTokensFromExpression(expression.expression, lintConfig);
  }

  if (ts.isObjectLiteralExpression(expression)) {
    return mergeTokens(
      ...expression.properties.map((property) => {
        if (ts.isPropertyAssignment(property)) {
          return extractTokensFromExpression(property.initializer, lintConfig);
        }
        return [];
      }),
    );
  }

  if (ts.isCallExpression(expression)) {
    if (
      lintConfig.classComposerFunctions.some((name) =>
        isIdentifierWithName(expression.expression, name),
      )
    ) {
      return mergeTokens(
        ...expression.arguments.map((argument) =>
          extractTokensFromExpression(argument, lintConfig),
        ),
      );
    }
  }

  return [];
}

function isWithinClassAttribute(node: ts.Node): boolean {
  let current: ts.Node | undefined = node.parent;
  while (current) {
    if (ts.isJsxAttribute(current) && isClassAttributeName(current.name)) {
      return true;
    }
    current = current.parent;
  }
  return false;
}

function extractClassGroupsFromSource(
  sourceFile: ts.SourceFile,
  lintConfig: StyleLintConfig,
): ClassGroup[] {
  const groups: ClassGroup[] = [];

  const visit = (node: ts.Node): void => {
    if (ts.isJsxAttribute(node) && isClassAttributeName(node.name)) {
      if (node.initializer && ts.isStringLiteral(node.initializer)) {
        const tokens = tokenizeClassList(node.initializer.text);
        if (tokens.length > 0) {
          groups.push({ node, tokens });
        }
      } else if (node.initializer && ts.isJsxExpression(node.initializer)) {
        const tokens = extractTokensFromExpression(node.initializer.expression, lintConfig);
        if (tokens.length > 0) {
          groups.push({ node, tokens });
        }
      }
    }

    if (
      ts.isCallExpression(node) &&
      !isWithinClassAttribute(node) &&
      isIdentifierWithName(node.expression, 'cva')
    ) {
      const tokens = mergeTokens(
        ...node.arguments.map((argument) => extractTokensFromExpression(argument, lintConfig)),
      );
      if (tokens.length > 0) {
        groups.push({ node, tokens });
      }
    }

    ts.forEachChild(node, visit);
  };

  visit(sourceFile);
  return groups;
}

function discoverFiles(lintConfig: StyleLintConfig): string[] {
  const fileSet = new Set<string>();

  for (const pattern of lintConfig.include) {
    const files = globSync(pattern, {
      cwd: process.cwd(),
      absolute: true,
      nodir: true,
      ignore: lintConfig.exclude,
    });

    for (const filePath of files) {
      fileSet.add(path.normalize(filePath));
    }
  }

  return Array.from(fileSet).sort();
}

function getLineAndColumn(
  sourceFile: ts.SourceFile,
  node: ts.Node,
): { line: number; column: number } {
  const position = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
  return {
    line: position.line + 1,
    column: position.character + 1,
  };
}

function runStyleLint(lintConfig: StyleLintConfig): Diagnostic[] {
  const files = discoverFiles(lintConfig);
  const diagnostics: Diagnostic[] = [];

  for (const filePath of files) {
    const sourceText = fs.readFileSync(filePath, 'utf8');
    const sourceFile = ts.createSourceFile(filePath, sourceText, ts.ScriptTarget.Latest, true);
    const classGroups = extractClassGroupsFromSource(sourceFile, lintConfig);

    for (const group of classGroups) {
      for (const [ruleId, ruleConfig] of Object.entries(lintConfig.rules) as [
        RuleId,
        { severity: StyleLintSeverity },
      ][]) {
        if (ruleConfig.severity === 'off') {
          continue;
        }
        const rule = RULES[ruleId];
        const message = rule.run(group.tokens);

        if (!message) {
          continue;
        }

        const { line, column } = getLineAndColumn(sourceFile, group.node);
        diagnostics.push({
          ruleId,
          severity: ruleConfig.severity,
          message,
          filePath: path.relative(process.cwd(), filePath),
          line,
          column,
        });
      }
    }
  }

  return diagnostics;
}

function printDiagnostics(diagnostics: Diagnostic[], lintConfig: StyleLintConfig): number {
  const sorted = diagnostics.sort((a, b) => {
    if (a.filePath !== b.filePath) {
      return a.filePath.localeCompare(b.filePath);
    }
    if (a.line !== b.line) {
      return a.line - b.line;
    }
    return a.column - b.column;
  });

  const shown = sorted.slice(0, lintConfig.maxDiagnostics);
  for (const diagnostic of shown) {
    console.log(
      `${diagnostic.filePath}:${diagnostic.line}:${diagnostic.column} ${diagnostic.severity} ${diagnostic.ruleId} ${diagnostic.message}`,
    );
  }

  if (sorted.length > shown.length) {
    console.log(
      `style-lint: output truncated (${shown.length}/${sorted.length}). Increase maxDiagnostics in scripts/style-lint.config.ts.`,
    );
  }

  const warningCount = diagnostics.filter((diagnostic) => diagnostic.severity === 'warn').length;
  const errorCount = diagnostics.filter((diagnostic) => diagnostic.severity === 'error').length;
  console.log(`style-lint: ${errorCount} errors, ${warningCount} warnings.`);

  return errorCount;
}

function main(): void {
  const diagnostics = runStyleLint(config);
  const errorCount = printDiagnostics(diagnostics, config);
  if (errorCount > 0) {
    process.exitCode = 1;
  }
}

main();
