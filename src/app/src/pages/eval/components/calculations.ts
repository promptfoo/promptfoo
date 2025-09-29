/**
 * Utilities for calculating metrics from filtered evaluation results in real-time.
 *
 * This module provides functions to compute evaluation metrics (pass rates, costs, latency, etc.)
 * dynamically based on the current filter state, enabling real-time metric updates in the UI.
 */

import type { EvaluateTableRow, EvalResultsFilterMode } from '@promptfoo/types';
import type { ResultsFilter } from './store';

export interface FilteredMetrics {
  testPassCount: number;
  testFailCount: number;
  assertPassCount: number;
  assertFailCount: number;
  avgLatencyMs: number;
  totalCost: number;
  passRate: number;
  totalLatencyMs: number;
  numRequests: number;
  tokenUsage: {
    total: number;
    prompt: number;
    completion: number;
    cached: number;
  };
  namedScores: Record<string, number>;
}

/**
 * Calculates comprehensive metrics for a specific prompt across filtered results.
 */
export function calculateFilteredMetrics(
  filteredRows: EvaluateTableRow[],
  promptIndex: number,
): FilteredMetrics {
  if (filteredRows.length === 0) {
    return {
      testPassCount: 0,
      testFailCount: 0,
      assertPassCount: 0,
      assertFailCount: 0,
      avgLatencyMs: 0,
      totalCost: 0,
      passRate: 0,
      totalLatencyMs: 0,
      numRequests: 0,
      tokenUsage: { total: 0, prompt: 0, completion: 0, cached: 0 },
      namedScores: {},
    };
  }

  let testPassCount = 0;
  let testFailCount = 0;
  let assertPassCount = 0;
  let assertFailCount = 0;
  let totalLatencyMs = 0;
  let totalCost = 0;
  let numRequests = 0;
  let numWithLatency = 0; // Track how many outputs have latency data
  const namedScores: Record<string, number> = {};
  const namedScoreCounts: Record<string, number> = {};

  const tokenUsage = {
    total: 0,
    prompt: 0,
    completion: 0,
    cached: 0,
  };

  for (const row of filteredRows) {
    const output = row.outputs[promptIndex];
    if (!output) {
      continue;
    }

    numRequests++;

    // Test pass/fail counts
    if (output.pass) {
      testPassCount++;
    } else {
      testFailCount++;
    }

    // Assertion counts from gradingResult component results
    if (output.gradingResult?.componentResults) {
      for (const component of output.gradingResult.componentResults) {
        if (component.pass) {
          assertPassCount++;
        } else {
          assertFailCount++;
        }
      }
    }

    // Latency - only count outputs that have latency data
    if (output.latencyMs) {
      totalLatencyMs += output.latencyMs;
      numWithLatency++;
    }

    // Cost
    totalCost += output.cost || 0;

    // Token usage
    if (output.tokenUsage) {
      tokenUsage.total += output.tokenUsage.total || 0;
      tokenUsage.prompt += output.tokenUsage.prompt || 0;
      tokenUsage.completion += output.tokenUsage.completion || 0;
      tokenUsage.cached += output.tokenUsage.cached || 0;
    }

    // Named scores - aggregate with averages
    if (output.namedScores) {
      for (const [name, score] of Object.entries(output.namedScores)) {
        if (typeof score === 'number' && !isNaN(score)) {
          namedScores[name] = (namedScores[name] || 0) + score;
          namedScoreCounts[name] = (namedScoreCounts[name] || 0) + 1;
        }
      }
    }
  }

  // Calculate averages for named scores
  for (const [name, total] of Object.entries(namedScores)) {
    namedScores[name] = total / (namedScoreCounts[name] || 1);
  }

  const totalTests = testPassCount + testFailCount;
  const passRate = totalTests > 0 ? (testPassCount / totalTests) * 100 : 0;
  const avgLatencyMs = numWithLatency > 0 ? totalLatencyMs / numWithLatency : 0;

  return {
    testPassCount,
    testFailCount,
    assertPassCount,
    assertFailCount,
    avgLatencyMs,
    totalCost,
    passRate,
    totalLatencyMs,
    numRequests,
    tokenUsage,
    namedScores,
  };
}

/**
 * Applies client-side filtering to table rows based on current filter state.
 * This replicates the server-side filtering logic for real-time calculation.
 */
export function applyClientSideFiltering(
  rows: EvaluateTableRow[],
  filterMode: EvalResultsFilterMode,
  searchText: string,
  appliedFilters: ResultsFilter[],
): EvaluateTableRow[] {
  // DEBUG: Log filter application
  if (process.env.NODE_ENV === 'development' && appliedFilters.length > 0) {
    console.log('🚀 Applying Client-Side Filtering:', {
      totalRows: rows.length,
      filterMode,
      searchText,
      appliedFilters: appliedFilters.map(f => ({ type: f.type, operator: f.operator, value: f.value, field: f.field })),
    });
  }

  let filteredRows = [...rows];

  // Apply filter mode
  if (filterMode === 'failures') {
    filteredRows = filteredRows.filter((row) => row.outputs.some((output) => !output.pass));
  } else if (filterMode === 'errors') {
    filteredRows = filteredRows.filter((row) =>
      row.outputs.some((output) => output.failureReason !== undefined),
    );
  } else if (filterMode === 'different') {
    // For 'different' mode, we need to compare outputs between prompts
    filteredRows = filteredRows.filter((row) => {
      if (row.outputs.length < 2) {
        return false;
      }
      const firstOutput = row.outputs[0]?.text || '';
      return row.outputs.slice(1).some((output) => (output?.text || '') !== firstOutput);
    });
  }

  // Apply search text filter
  if (searchText.trim()) {
    try {
      const searchRegex = new RegExp(searchText, 'i');
      filteredRows = filteredRows.filter((row) => {
        // Search in output text, variables, and description
        const searchableContent = [
          ...(row.description ? [row.description] : []),
          ...row.vars,
          ...row.outputs.map((output) => output.text || ''),
        ].join(' ');

        return searchRegex.test(searchableContent);
      });
    } catch (_error) {
      // If regex is invalid, fall back to simple string search
      const searchLower = searchText.toLowerCase();
      filteredRows = filteredRows.filter((row) => {
        const searchableContent = [
          ...(row.description ? [row.description] : []),
          ...row.vars,
          ...row.outputs.map((output) => output.text || ''),
        ].join(' ').toLowerCase();

        return searchableContent.includes(searchLower);
      });
    }
  }

  // Apply custom filters
  if (appliedFilters.length > 0) {
    filteredRows = filteredRows.filter((row) => {
      // Group filters by logic operator
      const andFilters = appliedFilters.filter((f) => f.logicOperator === 'and');
      const orFilters = appliedFilters.filter((f) => f.logicOperator === 'or');

      // All AND filters must pass
      const andPassed =
        andFilters.length === 0 || andFilters.every((filter) => applyFilterToRow(row, filter));

      // At least one OR filter must pass (if any OR filters exist)
      const orPassed =
        orFilters.length === 0 || orFilters.some((filter) => applyFilterToRow(row, filter));

      return andPassed && orPassed;
    });
  }

  // DEBUG: Log final filtering result
  if (process.env.NODE_ENV === 'development' && appliedFilters.length > 0) {
    console.log('✅ Client-Side Filtering Complete:', {
      originalRowCount: rows.length,
      filteredRowCount: filteredRows.length,
      filtersApplied: appliedFilters.length,
    });
  }

  return filteredRows;
}

/**
 * Applies a single filter to a row to determine if it passes.
 */
function applyFilterToRow(row: EvaluateTableRow, filter: ResultsFilter): boolean {
  const { type, operator, value, field } = filter;

  switch (type) {
    case 'metric':
      // Check named scores in outputs
      return row.outputs.some((output) => {
        if (!output.namedScores) {
          return false;
        }
        return Object.keys(output.namedScores).some((metricName) => {
          if (operator === 'equals') {
            return metricName === value;
          } else if (operator === 'contains') {
            return metricName.toLowerCase().includes(value.toLowerCase());
          } else if (operator === 'not_contains') {
            return !metricName.toLowerCase().includes(value.toLowerCase());
          }
          return false;
        });
      });

    case 'metadata':
      if (!field) {
        return false;
      }
      return row.outputs.some((output) => {
        const metadataValue = output.metadata?.[field];
        if (metadataValue === undefined || metadataValue === null) {
          return false;
        }
        const stringValue = typeof metadataValue === 'object'
          ? JSON.stringify(metadataValue)
          : String(metadataValue);

        if (operator === 'equals') {
          return stringValue === value;
        } else if (operator === 'contains') {
          return stringValue.toLowerCase().includes(value.toLowerCase());
        } else if (operator === 'not_contains') {
          return !stringValue.toLowerCase().includes(value.toLowerCase());
        }
        return false;
      });

    case 'plugin':
      // Plugin filter: follow the same logic as getPluginIdFromResult in shared.ts
      return row.outputs.some((output) => {
        let pluginId: string | null = null;

        // DEBUG: Log the data structure we're working with
        if (process.env.NODE_ENV === 'development') {
          console.log('🔍 Plugin Filter Debug:', {
            outputMetadata: output.metadata,
            testMetadata: row.test?.metadata,
            testCaseMetadata: output.testCase?.metadata,
            gradingResultComponents: output.gradingResult?.componentResults?.map(r => r.assertion?.metric),
            filterValue: value,
            operator
          });
        }

        // 1. Check output metadata for pluginId (primary location)
        if (output.metadata?.pluginId) {
          pluginId = output.metadata.pluginId as string;
        }

        // 2. Check for harmCategory (fallback)
        else {
          const harmCategory = output.metadata?.harmCategory;
          if (harmCategory) {
            // This would need category aliases mapping, for now use harmCategory directly
            pluginId = harmCategory as string;
          }
        }

        // 3. Try to derive from gradingResult component metrics
        if (!pluginId) {
          const metricNames = output.gradingResult?.componentResults?.map((result) => result.assertion?.metric) || [];
          for (const metric of metricNames) {
            if (metric) {
              const metricParts = metric.split('/');
              const baseName = metricParts[0];
              if (baseName) {
                // For now, use the base metric name as plugin identifier
                pluginId = baseName;
                break;
              }
            }
          }
        }

        // 4. Check test metadata for pluginConfig (secondary)
        if (!pluginId) {
          const pluginConfig = row.test?.metadata?.pluginConfig;
          if (pluginConfig && typeof pluginConfig === 'object' && 'id' in pluginConfig) {
            pluginId = String(pluginConfig.id);
          }
        }

        // 5. Check testCase metadata for pluginId
        if (!pluginId) {
          const testCasePluginId = output.testCase?.metadata?.pluginId;
          if (testCasePluginId) {
            pluginId = testCasePluginId as string;
          }
        }

        // DEBUG: Log the extracted pluginId and result
        if (process.env.NODE_ENV === 'development') {
          console.log('🔍 Plugin Filter Result:', {
            extractedPluginId: pluginId,
            filterValue: value,
            operator,
            matches: pluginId ? (
              operator === 'equals' ? pluginId === value :
              operator === 'contains' ? pluginId.toLowerCase().includes(value.toLowerCase()) :
              operator === 'not_contains' ? !pluginId.toLowerCase().includes(value.toLowerCase()) :
              false
            ) : false
          });
        }

        // Now apply the operator logic
        if (pluginId) {
          if (operator === 'equals') {
            return pluginId === value;
          } else if (operator === 'contains') {
            return pluginId.toLowerCase().includes(value.toLowerCase());
          } else if (operator === 'not_contains') {
            return !pluginId.toLowerCase().includes(value.toLowerCase());
          }
        }

        return false;
      });

    case 'strategy':
      // Strategy filter: follow the same logic as getStrategyIdFromTest in shared.ts
      return row.outputs.some((output) => {
        let strategyId: string = 'basic'; // Default fallback

        // 1. Check output metadata for strategyId (primary location)
        if (output.metadata?.strategyId) {
          strategyId = output.metadata.strategyId as string;
        }

        // 2. Check testCase metadata for strategyId
        else if (output.testCase?.metadata?.strategyId) {
          strategyId = output.testCase.metadata.strategyId as string;
        }

        // 3. Check test metadata for strategyId
        else if (row.test?.metadata?.strategyId) {
          strategyId = row.test.metadata.strategyId as string;
        }

        // 4. Check test metadata for strategyConfig
        else {
          const strategyConfig = row.test?.metadata?.strategyConfig;
          if (strategyConfig && typeof strategyConfig === 'object' && 'id' in strategyConfig) {
            strategyId = String(strategyConfig.id);
          }
        }

        // Apply the operator logic (strategyId is never null due to 'basic' default)
        if (operator === 'equals') {
          return strategyId === value;
        } else if (operator === 'contains') {
          return strategyId.toLowerCase().includes(value.toLowerCase());
        } else if (operator === 'not_contains') {
          return !strategyId.toLowerCase().includes(value.toLowerCase());
        }

        return false;
      });

    case 'severity':
      // Severity filter: check output metadata or test metadata
      return row.outputs.some((output) => {
        const severityValue = output.metadata?.severity ||
                             output.gradingResult?.metadata?.severity ||
                             row.test?.metadata?.severity;

        if (severityValue === undefined || severityValue === null) {
          return false;
        }

        const stringValue = typeof severityValue === 'object'
          ? JSON.stringify(severityValue)
          : String(severityValue);

        if (operator === 'equals') {
          return stringValue === value;
        } else if (operator === 'contains') {
          return stringValue.toLowerCase().includes(value.toLowerCase());
        } else if (operator === 'not_contains') {
          return !stringValue.toLowerCase().includes(value.toLowerCase());
        }
        return false;
      });

    default:
      return true;
  }
}

/**
 * Generic function to calculate arrays of metrics for all prompts from filtered data.
 * This prevents code duplication across specific metric calculation functions.
 */
function calculateFilteredMetricsForAllPrompts<T>(
  filteredRows: EvaluateTableRow[],
  numPrompts: number,
  extractor: (metrics: FilteredMetrics) => T,
): T[] {
  const results: T[] = [];

  for (let promptIndex = 0; promptIndex < numPrompts; promptIndex++) {
    const metrics = calculateFilteredMetrics(filteredRows, promptIndex);
    results.push(extractor(metrics));
  }

  return results;
}

/**
 * Calculate pass rates for all prompts from filtered data.
 */
export function calculateFilteredPassRates(
  filteredRows: EvaluateTableRow[],
  numPrompts: number,
): number[] {
  return calculateFilteredMetricsForAllPrompts(
    filteredRows,
    numPrompts,
    (metrics) => metrics.passRate,
  );
}

/**
 * Calculate test counts for all prompts from filtered data.
 */
export function calculateFilteredTestCounts(
  filteredRows: EvaluateTableRow[],
  numPrompts: number,
): number[] {
  return calculateFilteredMetricsForAllPrompts(
    filteredRows,
    numPrompts,
    (metrics) => metrics.testPassCount + metrics.testFailCount,
  );
}

/**
 * Calculate passing test counts for all prompts from filtered data.
 */
export function calculateFilteredPassingTestCounts(
  filteredRows: EvaluateTableRow[],
  numPrompts: number,
): number[] {
  return calculateFilteredMetricsForAllPrompts(
    filteredRows,
    numPrompts,
    (metrics) => metrics.testPassCount,
  );
}
