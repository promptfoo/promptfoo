import { type Expression, parseExpressionAt } from 'acorn';

type ScoreFormula = (scores: Record<string, number>) => number;

const comparisons = new Map<string, (left: number, right: number) => number>([
  ['>', (a, b) => Number(a > b)],
  ['>=', (a, b) => Number(a >= b)],
  ['<', (a, b) => Number(a < b)],
  ['<=', (a, b) => Number(a <= b)],
  ['==', (a, b) => Number(a === b)],
  ['!=', (a, b) => Number(a !== b)],
]);

const operations = new Map<string, (left: number, right: number) => number>([
  ['+', (a, b) => a + b],
  ['-', (a, b) => a - b],
  ['*', (a, b) => a * b],
  ['/', (a, b) => a / b],
  ...comparisons,
]);

function isUnparenthesizedComparison(node: Expression): boolean {
  return node.type === 'BinaryExpression' && comparisons.has(node.operator);
}

function compile(node: Expression): ScoreFormula {
  switch (node.type) {
    case 'Literal': {
      const value = node.value;
      if (typeof value === 'number' && Number.isFinite(value)) {
        return () => value;
      }
      break;
    }
    case 'Identifier':
      return (scores) => {
        const value = Object.hasOwn(scores, node.name) ? scores[node.name] : undefined;
        if (typeof value !== 'number') {
          throw new Error(`Missing numeric score: ${node.name}`);
        }
        return value;
      };
    case 'ParenthesizedExpression':
      return compile(node.expression);
    case 'UnaryExpression': {
      const operand = compile(node.argument);
      if (node.operator === '+') {
        return operand;
      }
      if (node.operator === '-') {
        return (scores) => -operand(scores);
      }
      break;
    }
    case 'BinaryExpression': {
      const operation = operations.get(node.operator);
      if (operation && node.left.type !== 'PrivateIdentifier') {
        if (
          comparisons.has(node.operator) &&
          (isUnparenthesizedComparison(node.left) || isUnparenthesizedComparison(node.right))
        ) {
          throw new Error(
            'Use separate comparisons in a conditional instead of a comparison chain',
          );
        }
        const left = compile(node.left);
        const right = compile(node.right);
        return (scores) => operation(left(scores), right(scores));
      }
      break;
    }
    case 'ConditionalExpression': {
      const condition = compile(node.test);
      const consequent = compile(node.consequent);
      const alternate = compile(node.alternate);
      return (scores) => (condition(scores) ? consequent(scores) : alternate(scores));
    }
  }
  throw new Error('Expected arithmetic over numeric scores');
}

/** Parse once per evaluation. Only the numeric operations above can run for each row. */
export function compileDerivedMetricFormula(name: string, formula: string): ScoreFormula {
  try {
    if (formula.length > 1024) {
      throw new Error('Formula exceeds 1024 characters');
    }
    const source = formula.trim();
    const expression = parseExpressionAt(source, 0, { ecmaVersion: 2022, preserveParens: true });
    if (expression.end !== source.length) {
      throw new Error('Expected a single expression');
    }
    return compile(expression);
  } catch (cause) {
    const reason = cause instanceof Error ? cause.message : 'Invalid expression';
    throw new Error(`Invalid formula for derived metric "${name}": ${reason}`, { cause });
  }
}
