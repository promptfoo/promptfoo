import type {
  CompatibilityStatus,
  ContractDiffResult,
  ContractDriftChange,
  JsonSchema,
  McpServerContract,
  NormalizedToolContract,
} from './types';

/**
 * Computes Jaccard similarity between two sets of property names.
 */
function computePropertySimilarity(aKeys: string[], bKeys: string[]): number {
  if (aKeys.length === 0 && bKeys.length === 0) {
    return 1.0;
  }
  const setA = new Set(aKeys);
  const setB = new Set(bKeys);
  let intersectionCount = 0;
  for (const k of setA) {
    if (setB.has(k)) {
      intersectionCount++;
    }
  }
  const unionCount = new Set([...aKeys, ...bKeys]).size;
  return unionCount === 0 ? 1.0 : intersectionCount / unionCount;
}

/**
 * Compares two JSON Schemas property by property to find fine-grained drift.
 */
export function diffToolSchemas(
  toolName: string,
  baseline: NormalizedToolContract,
  current: NormalizedToolContract,
): ContractDriftChange[] {
  const changes: ContractDriftChange[] = [];

  // 1. Description change
  if (baseline.description !== current.description) {
    changes.push({
      code: 'DESCRIPTION_CHANGED',
      severity: 'DESCRIPTION_ONLY',
      toolName,
      message: `Tool description changed from "${baseline.description}" to "${current.description}"`,
      oldValue: baseline.description,
      newValue: current.description,
      remediation: 'Verify whether agent prompt semantics or tool selection are affected.',
    });
  }

  const baseSchema = baseline.canonicalSchema;
  const currSchema = current.canonicalSchema;

  // 2. Type change at root
  if (baseSchema.type && currSchema.type && baseSchema.type !== currSchema.type) {
    changes.push({
      code: 'PROPERTY_TYPE_CHANGED',
      severity: 'BREAKING',
      toolName,
      propertyPath: '#',
      message: `Root inputSchema type changed from ${JSON.stringify(baseSchema.type)} to ${JSON.stringify(currSchema.type)}`,
      oldValue: baseSchema.type,
      newValue: currSchema.type,
      remediation: 'Update agent callers to conform to the new root input structure.',
    });
  }

  const baseProps = (baseSchema.properties || {}) as Record<string, JsonSchema>;
  const currProps = (currSchema.properties || {}) as Record<string, JsonSchema>;

  const baseRequired = new Set(baseSchema.required || []);
  const currRequired = new Set(currSchema.required || []);

  const allPropKeys = Array.from(new Set([...Object.keys(baseProps), ...Object.keys(currProps)]));

  for (const propName of allPropKeys) {
    const baseProp = baseProps[propName];
    const currProp = currProps[propName];
    const path = `#/properties/${propName}`;

    // Case A: Property added
    if (!baseProp && currProp) {
      if (currRequired.has(propName)) {
        changes.push({
          code: 'REQUIRED_PROPERTY_ADDED',
          severity: 'BREAKING',
          toolName,
          propertyPath: path,
          message: `New required property "${propName}" was added. Existing agents that do not supply this property will fail schema validation.`,
          newValue: currProp,
          remediation: `Provide default values or update agent tool calls to include "${propName}".`,
        });
      } else {
        changes.push({
          code: 'OPTIONAL_PROPERTY_ADDED',
          severity: 'NON_BREAKING',
          toolName,
          propertyPath: path,
          message: `New optional property "${propName}" was added. Existing agent calls remain valid.`,
          newValue: currProp,
          remediation: 'Optionally update agents to leverage the new property if beneficial.',
        });
      }
      continue;
    }

    // Case B: Property removed
    if (baseProp && !currProp) {
      if (baseRequired.has(propName)) {
        changes.push({
          code: 'REQUIRED_PROPERTY_REMOVED',
          severity: 'NON_BREAKING',
          toolName,
          propertyPath: path,
          message: `Required property "${propName}" was removed from the schema. Existing callers supplying it will still be valid if additionalProperties is permitted.`,
          oldValue: baseProp,
          remediation: 'Consider deprecating the argument in agent prompts gracefully.',
        });
      } else {
        changes.push({
          code: 'OPTIONAL_PROPERTY_REMOVED',
          severity: 'NON_BREAKING',
          toolName,
          propertyPath: path,
          message: `Optional property "${propName}" was removed.`,
          oldValue: baseProp,
          remediation: 'Remove references to this property from agent instructions.',
        });
      }
      continue;
    }

    // Case C: Property present in both - check required status transition
    if (baseProp && currProp) {
      const wasRequired = baseRequired.has(propName);
      const isRequired = currRequired.has(propName);

      if (!wasRequired && isRequired) {
        changes.push({
          code: 'REQUIRED_PROPERTY_ADDED',
          severity: 'BREAKING',
          toolName,
          propertyPath: path,
          message: `Existing property "${propName}" transitioned from optional to required. Calls omitting it will fail.`,
          remediation: `Ensure all agent pipelines supply "${propName}".`,
        });
      } else if (wasRequired && !isRequired) {
        changes.push({
          code: 'REQUIRED_PROPERTY_REMOVED',
          severity: 'NON_BREAKING',
          toolName,
          propertyPath: path,
          message: `Existing property "${propName}" relaxed from required to optional.`,
          remediation: 'No immediate action needed; existing pipelines continue to work.',
        });
      }

      // Check type mutation
      if (baseProp.type && currProp.type && baseProp.type !== currProp.type) {
        changes.push({
          code: 'PROPERTY_TYPE_CHANGED',
          severity: 'BREAKING',
          toolName,
          propertyPath: `${path}/type`,
          message: `Property "${propName}" type changed from ${JSON.stringify(baseProp.type)} to ${JSON.stringify(currProp.type)}`,
          oldValue: baseProp.type,
          newValue: currProp.type,
          remediation: `Update agent prompt type-casting to produce ${JSON.stringify(currProp.type)}.`,
        });
      }

      // Check enum mutations
      if (baseProp.enum && currProp.enum) {
        const baseEnumSet = new Set(baseProp.enum);
        const currEnumSet = new Set(currProp.enum);

        const removedEnumValues = baseProp.enum.filter((v) => !currEnumSet.has(v));
        const addedEnumValues = currProp.enum.filter((v) => !baseEnumSet.has(v));

        if (removedEnumValues.length > 0) {
          changes.push({
            code: 'ENUM_RESTRICTED',
            severity: 'BREAKING',
            toolName,
            propertyPath: `${path}/enum`,
            message: `Property "${propName}" enum values removed: ${JSON.stringify(removedEnumValues)}. Agents generating these values will fail.`,
            oldValue: baseProp.enum,
            newValue: currProp.enum,
            remediation: `Remove deprecated enum options from agent prompts.`,
          });
        }

        if (addedEnumValues.length > 0) {
          changes.push({
            code: 'ENUM_EXPANDED',
            severity: 'NON_BREAKING',
            toolName,
            propertyPath: `${path}/enum`,
            message: `Property "${propName}" enum values expanded with: ${JSON.stringify(addedEnumValues)}. Existing values remain valid.`,
            oldValue: baseProp.enum,
            newValue: currProp.enum,
          });
        }
      }

      // Check numeric constraints
      if (baseProp.minimum !== undefined && currProp.minimum !== undefined && currProp.minimum > baseProp.minimum) {
        changes.push({
          code: 'CONSTRAINT_TIGHTENED',
          severity: 'BREAKING',
          toolName,
          propertyPath: `${path}/minimum`,
          message: `Minimum constraint tightened from ${baseProp.minimum} to ${currProp.minimum}`,
          oldValue: baseProp.minimum,
          newValue: currProp.minimum,
        });
      }
      if (baseProp.maximum !== undefined && currProp.maximum !== undefined && currProp.maximum < baseProp.maximum) {
        changes.push({
          code: 'CONSTRAINT_TIGHTENED',
          severity: 'BREAKING',
          toolName,
          propertyPath: `${path}/maximum`,
          message: `Maximum constraint tightened from ${baseProp.maximum} to ${currProp.maximum}`,
          oldValue: baseProp.maximum,
          newValue: currProp.maximum,
        });
      }

      // Check string constraints
      if (baseProp.minLength !== undefined && currProp.minLength !== undefined && currProp.minLength > baseProp.minLength) {
        changes.push({
          code: 'CONSTRAINT_TIGHTENED',
          severity: 'BREAKING',
          toolName,
          propertyPath: `${path}/minLength`,
          message: `Minimum length tightened from ${baseProp.minLength} to ${currProp.minLength}`,
          oldValue: baseProp.minLength,
          newValue: currProp.minLength,
        });
      }

      if (baseProp.pattern !== currProp.pattern && currProp.pattern) {
        changes.push({
          code: 'CONSTRAINT_TIGHTENED',
          severity: 'BREAKING',
          toolName,
          propertyPath: `${path}/pattern`,
          message: `Pattern regex updated from ${JSON.stringify(baseProp.pattern)} to ${JSON.stringify(currProp.pattern)}`,
          oldValue: baseProp.pattern,
          newValue: currProp.pattern,
        });
      }
    }
  }

  return changes;
}

/**
 * Compares a baseline McpServerContract against a current McpServerContract
 * and produces a comprehensive ContractDiffResult.
 */
export function compareContracts(
  baseline: McpServerContract,
  current: McpServerContract,
): ContractDiffResult {
  const changes: ContractDriftChange[] = [];

  const baseTools = baseline.tools || {};
  const currTools = current.tools || {};

  const baseToolNames = Object.keys(baseTools);
  const currToolNames = Object.keys(currTools);

  const baseToolSet = new Set(baseToolNames);
  const currToolSet = new Set(currToolNames);

  const addedToolNames = currToolNames.filter((t) => !baseToolSet.has(t));
  const removedToolNames = baseToolNames.filter((t) => !currToolSet.has(t));
  const commonToolNames = baseToolNames.filter((t) => currToolSet.has(t));

  // Check for potential renamed tools (heuristic based on property structure similarity)
  const handledAdded = new Set<string>();
  const handledRemoved = new Set<string>();

  for (const removedName of removedToolNames) {
    const removedTool = baseTools[removedName];
    const removedProps = Object.keys(removedTool.canonicalSchema?.properties || {});

    for (const addedName of addedToolNames) {
      if (handledAdded.has(addedName)) {
        continue;
      }
      const addedTool = currTools[addedName];
      const addedProps = Object.keys(addedTool.canonicalSchema?.properties || {});

      const similarity = computePropertySimilarity(removedProps, addedProps);
      if (similarity >= 0.8 && removedProps.length > 0) {
        changes.push({
          code: 'TOOL_RENAMED',
          severity: 'BREAKING',
          toolName: addedName,
          message: `Tool "${removedName}" appears to have been renamed to "${addedName}" (${Math.round(similarity * 100)}% parameter overlap). Agent calls targeting "${removedName}" will fail.`,
          oldValue: removedName,
          newValue: addedName,
          remediation: `Update agent tool references from "${removedName}" to "${addedName}".`,
        });
        handledRemoved.add(removedName);
        handledAdded.add(addedName);
        break;
      }
    }
  }

  // Record remaining removed tools
  for (const removedName of removedToolNames) {
    if (handledRemoved.has(removedName)) {
      continue;
    }
    changes.push({
      code: 'TOOL_REMOVED',
      severity: 'BREAKING',
      toolName: removedName,
      message: `Tool "${removedName}" was removed from the MCP server. Any agent workflows calling this tool will encounter ToolNotFoundError.`,
      oldValue: baseTools[removedName],
      remediation: `Ensure callers no longer invoke "${removedName}" or restore the tool to the MCP server.`,
    });
  }

  // Record remaining added tools
  for (const addedName of addedToolNames) {
    if (handledAdded.has(addedName)) {
      continue;
    }
    changes.push({
      code: 'TOOL_ADDED',
      severity: 'NON_BREAKING',
      toolName: addedName,
      message: `New tool "${addedName}" added to the MCP server. Backwards-compatible expansion.`,
      newValue: currTools[addedName],
      remediation: 'Update agent prompts or tools definitions if you wish to expose this tool.',
    });
  }

  // Diff common tools
  for (const toolName of commonToolNames) {
    const baseTool = baseTools[toolName];
    const currTool = currTools[toolName];

    if (baseTool.fullFingerprint === currTool.fullFingerprint) {
      continue;
    }

    const toolChanges = diffToolSchemas(toolName, baseTool, currTool);
    changes.push(...toolChanges);
  }

  let breakingCount = 0;
  let nonBreakingCount = 0;
  let descriptionOnlyCount = 0;

  for (const change of changes) {
    if (change.severity === 'BREAKING') {
      breakingCount++;
    } else if (change.severity === 'NON_BREAKING') {
      nonBreakingCount++;
    } else if (change.severity === 'DESCRIPTION_ONLY') {
      descriptionOnlyCount++;
    }
  }

  let status: CompatibilityStatus = 'IDENTICAL';
  if (breakingCount > 0) {
    status = 'BREAKING';
  } else if (nonBreakingCount > 0) {
    status = 'NON_BREAKING';
  } else if (descriptionOnlyCount > 0) {
    status = 'DESCRIPTION_ONLY';
  }

  const summary =
    status === 'IDENTICAL'
      ? `Contract identical (fingerprint: ${current.overallFingerprint.slice(0, 12)})`
      : status === 'BREAKING'
        ? `🚨 BREAKING DRIFT: ${breakingCount} breaking change(s) detected across MCP tools.`
        : status === 'NON_BREAKING'
          ? `✅ NON-BREAKING: ${nonBreakingCount} compatible addition(s) detected.`
          : `ℹ️ DESCRIPTION ONLY: ${descriptionOnlyCount} documentation update(s) detected.`;

  return {
    serverId: current.serverId,
    status,
    baselineFingerprint: baseline.overallFingerprint,
    currentFingerprint: current.overallFingerprint,
    baselineTimestamp: baseline.generatedAt,
    currentTimestamp: current.generatedAt,
    hasBreakingChanges: breakingCount > 0,
    totalChanges: changes.length,
    breakingCount,
    nonBreakingCount,
    descriptionOnlyCount,
    changes,
    summary,
  };
}

