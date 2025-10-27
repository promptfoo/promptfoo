import invariant from '../util/invariant';

import type { AssertionParams, GradingResult } from '../types/index';

/**
 * Validates that a ChatKit tool was called
 * Value can be:
 * - string: tool name
 * - object: { name: string, arguments?: object }
 */
export function handleChatKitToolCalled({
  assertion,
  renderedValue,
  providerResponse,
}: AssertionParams): GradingResult {
  const value = renderedValue ?? assertion.value;
  invariant(
    typeof value === 'string' || typeof value === 'object',
    '"chatkit-tool-called" assertion type must have a string or object value',
  );

  const toolCalls = providerResponse.metadata?.toolCalls;
  if (!Array.isArray(toolCalls) || toolCalls.length === 0) {
    return {
      pass: false,
      score: 0,
      reason: 'No tool calls found in ChatKit response',
      assertion,
    };
  }

  // Simple string match on tool name
  if (typeof value === 'string') {
    const toolFound = toolCalls.some((call: any) => call.name === value);
    return {
      pass: toolFound,
      score: toolFound ? 1 : 0,
      reason: toolFound
        ? `Tool "${value}" was called`
        : `Expected tool "${value}" but found: ${toolCalls.map((c: any) => c.name).join(', ')}`,
      assertion,
    };
  }

  // Object match with name and optional arguments
  const { name, arguments: expectedArgs } = value as { name: string; arguments?: object };
  invariant(typeof name === 'string', 'Tool name must be a string');

  const matchingCall = toolCalls.find((call: any) => call.name === name);
  if (!matchingCall) {
    return {
      pass: false,
      score: 0,
      reason: `Expected tool "${name}" but found: ${toolCalls.map((c: any) => c.name).join(', ')}`,
      assertion,
    };
  }

  // If arguments are specified, validate them
  if (expectedArgs) {
    const actualArgs = matchingCall.arguments || {};
    const mismatches: string[] = [];

    for (const [key, expectedValue] of Object.entries(expectedArgs)) {
      const actualValue = actualArgs[key];
      if (JSON.stringify(actualValue) !== JSON.stringify(expectedValue)) {
        mismatches.push(
          `${key}: expected ${JSON.stringify(expectedValue)}, got ${JSON.stringify(actualValue)}`,
        );
      }
    }

    if (mismatches.length > 0) {
      return {
        pass: false,
        score: 0,
        reason: `Tool "${name}" was called but arguments didn't match:\n${mismatches.join('\n')}`,
        assertion,
      };
    }
  }

  return {
    pass: true,
    score: 1,
    reason: `Tool "${name}" was called${expectedArgs ? ' with matching arguments' : ''}`,
    assertion,
  };
}

/**
 * Validates that a ChatKit widget was rendered
 * Value can be:
 * - string: widget type
 * - object: { widget?: object } for more specific matching
 */
export function handleChatKitWidgetRendered({
  assertion,
  renderedValue,
  providerResponse,
}: AssertionParams): GradingResult {
  const value = renderedValue ?? assertion.value;

  const widgets = providerResponse.metadata?.widgets;
  if (!Array.isArray(widgets) || widgets.length === 0) {
    return {
      pass: false,
      score: 0,
      reason: 'No widgets found in ChatKit response',
      assertion,
    };
  }

  // If no value specified, just check that any widget was rendered
  if (!value) {
    return {
      pass: true,
      score: 1,
      reason: `Found ${widgets.length} widget(s)`,
      assertion,
    };
  }

  // String match on widget type
  if (typeof value === 'string') {
    const widgetFound = widgets.some((w: any) => w.widget?.type === value);
    return {
      pass: widgetFound,
      score: widgetFound ? 1 : 0,
      reason: widgetFound
        ? `Widget of type "${value}" was rendered`
        : `Expected widget type "${value}" but found: ${widgets.map((w: any) => w.widget?.type).join(', ')}`,
      assertion,
    };
  }

  // Object match for more complex validation
  if (typeof value === 'object') {
    const { widget: expectedWidget } = value as { widget?: object };
    if (expectedWidget) {
      const matchingWidget = widgets.find((w: any) => {
        return Object.entries(expectedWidget).every(([key, val]) => {
          return JSON.stringify(w.widget?.[key]) === JSON.stringify(val);
        });
      });

      if (matchingWidget) {
        return {
          pass: true,
          score: 1,
          reason: 'Widget with matching properties was rendered',
          assertion,
        };
      }
      return {
        pass: false,
        score: 0,
        reason: 'No widget matching the specified properties was found',
        assertion,
      };
    }
  }

  return {
    pass: true,
    score: 1,
    reason: `Found ${widgets.length} widget(s)`,
    assertion,
  };
}

/**
 * Validates that a ChatKit workflow was executed
 * Value can be:
 * - string: workflow ID
 * - object: { workflow?: object } for more specific matching
 */
export function handleChatKitWorkflowExecuted({
  assertion,
  renderedValue,
  providerResponse,
}: AssertionParams): GradingResult {
  const value = renderedValue ?? assertion.value;

  const workflows = providerResponse.metadata?.workflows;
  if (!Array.isArray(workflows) || workflows.length === 0) {
    return {
      pass: false,
      score: 0,
      reason: 'No workflows found in ChatKit response',
      assertion,
    };
  }

  // If no value specified, just check that any workflow was executed
  if (!value) {
    return {
      pass: true,
      score: 1,
      reason: `Found ${workflows.length} workflow(s)`,
      assertion,
    };
  }

  // String match on workflow ID
  if (typeof value === 'string') {
    const workflowFound = workflows.some((w: any) => w.workflow?.id === value);
    return {
      pass: workflowFound,
      score: workflowFound ? 1 : 0,
      reason: workflowFound
        ? `Workflow "${value}" was executed`
        : `Expected workflow "${value}" but found: ${workflows.map((w: any) => w.workflow?.id).join(', ')}`,
      assertion,
    };
  }

  // Object match for more complex validation
  if (typeof value === 'object') {
    const { workflow: expectedWorkflow } = value as { workflow?: object };
    if (expectedWorkflow) {
      const matchingWorkflow = workflows.find((w: any) => {
        return Object.entries(expectedWorkflow).every(([key, val]) => {
          return JSON.stringify(w.workflow?.[key]) === JSON.stringify(val);
        });
      });

      if (matchingWorkflow) {
        return {
          pass: true,
          score: 1,
          reason: 'Workflow with matching properties was executed',
          assertion,
        };
      }
      return {
        pass: false,
        score: 0,
        reason: 'No workflow matching the specified properties was found',
        assertion,
      };
    }
  }

  return {
    pass: true,
    score: 1,
    reason: `Found ${workflows.length} workflow(s)`,
    assertion,
  };
}
