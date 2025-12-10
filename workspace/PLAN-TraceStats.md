# TraceStats Implementation Plan

## Overview

Add a **TraceStats** component that aggregates and displays trace-level statistics including token usage, cost estimation, latency percentiles, and error rates. This component will be placed above the TraceTimeline in the TraceView component.

## Goals

1. Surface token usage data (input/output/total) already captured in span attributes
2. Calculate estimated cost using existing model pricing data
3. Compute latency percentiles (P50/P95/P99) from span durations
4. Show error count and success rate
5. Display span breakdown by type (LLM calls vs other)

## Data Available

From `src/tracing/genaiTracer.ts`, spans contain these attributes:

```typescript
// Token usage (from gen_ai semantic conventions)
'gen_ai.usage.input_tokens': number
'gen_ai.usage.output_tokens': number
'gen_ai.usage.total_tokens': number
'gen_ai.usage.cached_tokens': number

// Model identification for pricing
'gen_ai.system': 'openai' | 'anthropic' | 'bedrock' | ...
'gen_ai.request.model': string
'gen_ai.response.model': string

// Status
statusCode: 0 | 1 | 2  // UNSET | OK | ERROR
```

From `src/types/tracing.ts`:

```typescript
interface TraceSpan {
  spanId: string;
  parentSpanId?: string;
  name: string;
  startTime: number; // milliseconds
  endTime?: number; // milliseconds
  attributes?: Record<string, any>;
  statusCode?: number;
  statusMessage?: string;
}
```

## Architecture

### New Files

```
src/app/src/components/traces/
├── TraceStats.tsx          # Stats display component
├── TraceStats.test.tsx     # Tests
└── hooks/
    └── useTraceStats.ts    # Aggregation logic + pricing
```

### Integration Point

Modify `TraceView.tsx` to render `<TraceStats>` above `<TraceTimeline>`:

```tsx
// In TraceView.tsx
return (
  <Box>
    <Box sx={{ display: 'flex', justifyContent: 'flex-end', mb: 2 }}>
      <Button ... >Export Traces</Button>
    </Box>
    <TraceStats traces={filteredTraces} />  {/* NEW */}
    {filteredTraces.map((trace, index) => (
      <TraceTimeline trace={trace} />
    ))}
  </Box>
);
```

## Component Design

### TraceStats Props

```typescript
interface TraceStatsProps {
  traces: Trace[]; // Array of traces (each with spans)
}
```

### Stats to Display

```typescript
interface AggregatedStats {
  // Token usage
  totalInputTokens: number;
  totalOutputTokens: number;
  totalTokens: number;
  cachedTokens: number;

  // Cost
  estimatedCost: number | null; // null if model not recognized
  costBreakdown: { model: string; cost: number }[];

  // Latency
  totalDuration: number; // trace start to end
  spanDurations: number[]; // for percentile calculation
  p50Latency: number;
  p95Latency: number;
  p99Latency: number;
  avgLatency: number;

  // Errors
  errorCount: number;
  successCount: number;
  totalSpans: number;
  errorRate: number; // 0-1

  // Breakdown
  llmSpanCount: number;
  otherSpanCount: number;
}
```

### UI Layout (MUI v7)

```
┌─────────────────────────────────────────────────────────────────┐
│  Trace Statistics                                               │
├─────────────────────────────────────────────────────────────────┤
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐ ┌─────────┐ │
│  │ Tokens       │ │ Cost         │ │ Latency      │ │ Status  │ │
│  │              │ │              │ │              │ │         │ │
│  │ Input: 1,234 │ │ ~$0.0234     │ │ P50: 245ms   │ │ ✓ 12/15 │ │
│  │ Output: 567  │ │              │ │ P95: 890ms   │ │ ✗ 3     │ │
│  │ Total: 1,801 │ │ gpt-4: $0.02 │ │ P99: 1.2s    │ │         │ │
│  │ Cached: 200  │ │ claude: $0.01│ │              │ │ 80% OK  │ │
│  └──────────────┘ └──────────────┘ └──────────────┘ └─────────┘ │
└─────────────────────────────────────────────────────────────────┘
```

Four stat cards in a responsive grid:

1. **Tokens** - Input/Output/Total/Cached counts
2. **Cost** - Total estimated cost with per-model breakdown
3. **Latency** - P50/P95/P99 percentiles
4. **Status** - Success/Error counts with rate

## Implementation Details

### useTraceStats Hook

```typescript
// src/app/src/components/traces/hooks/useTraceStats.ts

import { useMemo } from 'react';
import type { Trace } from '../TraceView';

// Import model pricing from backend (shared module)
// This requires exposing pricing data to frontend
import { MODEL_PRICING } from '@app/utils/modelPricing';

export interface TraceStats {
  // ... as defined above
}

export function useTraceStats(traces: Trace[]): TraceStats {
  return useMemo(() => {
    const allSpans = traces.flatMap((t) => t.spans ?? []);

    // Aggregate token usage from span attributes
    let inputTokens = 0;
    let outputTokens = 0;
    let cachedTokens = 0;

    // Collect durations and errors
    const durations: number[] = [];
    let errorCount = 0;
    let llmSpanCount = 0;

    // Track cost per model
    const modelUsage = new Map<string, { input: number; output: number }>();

    for (const span of allSpans) {
      const attrs = span.attributes ?? {};

      // Token usage
      if (typeof attrs['gen_ai.usage.input_tokens'] === 'number') {
        inputTokens += attrs['gen_ai.usage.input_tokens'];
      }
      if (typeof attrs['gen_ai.usage.output_tokens'] === 'number') {
        outputTokens += attrs['gen_ai.usage.output_tokens'];
      }
      if (typeof attrs['gen_ai.usage.cached_tokens'] === 'number') {
        cachedTokens += attrs['gen_ai.usage.cached_tokens'];
      }

      // Track model usage for cost calculation
      const model = attrs['gen_ai.response.model'] || attrs['gen_ai.request.model'];
      if (model && (attrs['gen_ai.usage.input_tokens'] || attrs['gen_ai.usage.output_tokens'])) {
        const existing = modelUsage.get(model) ?? { input: 0, output: 0 };
        modelUsage.set(model, {
          input: existing.input + (attrs['gen_ai.usage.input_tokens'] ?? 0),
          output: existing.output + (attrs['gen_ai.usage.output_tokens'] ?? 0),
        });
        llmSpanCount++;
      }

      // Duration
      if (span.startTime && span.endTime) {
        durations.push(span.endTime - span.startTime);
      }

      // Errors (statusCode 2 = ERROR in OpenTelemetry)
      if (span.statusCode === 2) {
        errorCount++;
      }
    }

    // Calculate percentiles
    const sortedDurations = [...durations].sort((a, b) => a - b);
    const p50 = percentile(sortedDurations, 50);
    const p95 = percentile(sortedDurations, 95);
    const p99 = percentile(sortedDurations, 99);
    const avg = durations.length > 0 ? durations.reduce((a, b) => a + b, 0) / durations.length : 0;

    // Calculate cost
    let totalCost = 0;
    const costBreakdown: { model: string; cost: number }[] = [];

    for (const [model, usage] of modelUsage) {
      const pricing = MODEL_PRICING[model];
      if (pricing) {
        const cost = pricing.input * usage.input + pricing.output * usage.output;
        totalCost += cost;
        costBreakdown.push({ model, cost });
      }
    }

    return {
      totalInputTokens: inputTokens,
      totalOutputTokens: outputTokens,
      totalTokens: inputTokens + outputTokens,
      cachedTokens,
      estimatedCost: costBreakdown.length > 0 ? totalCost : null,
      costBreakdown,
      p50Latency: p50,
      p95Latency: p95,
      p99Latency: p99,
      avgLatency: avg,
      spanDurations: durations,
      errorCount,
      successCount: allSpans.length - errorCount,
      totalSpans: allSpans.length,
      errorRate: allSpans.length > 0 ? errorCount / allSpans.length : 0,
      llmSpanCount,
      otherSpanCount: allSpans.length - llmSpanCount,
      totalDuration: calculateTotalDuration(traces),
    };
  }, [traces]);
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, idx)];
}

function calculateTotalDuration(traces: Trace[]): number {
  let min = Infinity;
  let max = -Infinity;
  for (const trace of traces) {
    for (const span of trace.spans ?? []) {
      if (span.startTime < min) min = span.startTime;
      if (span.endTime && span.endTime > max) max = span.endTime;
    }
  }
  return max > min ? max - min : 0;
}
```

### Model Pricing Data

Create a shared pricing module for the frontend:

```typescript
// src/app/src/utils/modelPricing.ts

// Pricing in cost per token (already divided by 1M)
// Sourced from src/providers/openai/util.ts and src/providers/anthropic/util.ts

export interface ModelPrice {
  input: number;
  output: number;
}

export const MODEL_PRICING: Record<string, ModelPrice> = {
  // OpenAI
  'gpt-4o': { input: 2.5e-6, output: 10e-6 },
  'gpt-4o-mini': { input: 0.15e-6, output: 0.6e-6 },
  'gpt-4-turbo': { input: 10e-6, output: 30e-6 },
  'gpt-4': { input: 30e-6, output: 60e-6 },
  'gpt-3.5-turbo': { input: 0.5e-6, output: 1.5e-6 },
  o1: { input: 15e-6, output: 60e-6 },
  'o1-mini': { input: 1.1e-6, output: 4.4e-6 },
  'o3-mini': { input: 1.1e-6, output: 4.4e-6 },

  // Anthropic
  'claude-opus-4-5-20251101': { input: 5e-6, output: 25e-6 },
  'claude-sonnet-4-20250514': { input: 3e-6, output: 15e-6 },
  'claude-3-5-sonnet-latest': { input: 3e-6, output: 15e-6 },
  'claude-3-5-haiku-latest': { input: 0.8e-6, output: 4e-6 },
  'claude-3-opus-latest': { input: 15e-6, output: 75e-6 },

  // ... more models as needed
};

// Fuzzy match for model variants (e.g., 'gpt-4o-2024-08-06' -> 'gpt-4o')
export function getModelPrice(model: string): ModelPrice | undefined {
  // Direct match
  if (MODEL_PRICING[model]) {
    return MODEL_PRICING[model];
  }

  // Try prefix matching (remove date suffixes)
  const baseModel = model.replace(/-\d{4}-\d{2}-\d{2}.*$/, '');
  if (MODEL_PRICING[baseModel]) {
    return MODEL_PRICING[baseModel];
  }

  // Try common prefixes
  for (const [key, price] of Object.entries(MODEL_PRICING)) {
    if (model.startsWith(key)) {
      return price;
    }
  }

  return undefined;
}
```

### TraceStats Component

```typescript
// src/app/src/components/traces/TraceStats.tsx

import { useMemo } from 'react';
import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Grid from '@mui/material/Grid';
import Typography from '@mui/material/Typography';
import Tooltip from '@mui/material/Tooltip';
import { useTheme } from '@mui/material/styles';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';

import { useTraceStats } from './hooks/useTraceStats';
import type { Trace } from './TraceView';

interface TraceStatsProps {
  traces: Trace[];
}

const formatNumber = (n: number): string => {
  return n.toLocaleString();
};

const formatCost = (cost: number): string => {
  if (cost < 0.01) {
    return `$${cost.toFixed(4)}`;
  }
  return `$${cost.toFixed(2)}`;
};

const formatDuration = (ms: number): string => {
  if (ms < 1) return '<1ms';
  if (ms < 1000) return `${Math.round(ms)}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
};

export default function TraceStats({ traces }: TraceStatsProps) {
  const theme = useTheme();
  const stats = useTraceStats(traces);

  // Don't show stats if no spans
  if (stats.totalSpans === 0) {
    return null;
  }

  const hasTokenData = stats.totalTokens > 0;
  const hasCostData = stats.estimatedCost !== null;
  const hasLatencyData = stats.spanDurations.length > 0;

  return (
    <Box sx={{ mb: 3 }}>
      <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 1.5 }}>
        Trace Statistics
      </Typography>

      <Grid container spacing={2}>
        {/* Tokens Card */}
        {hasTokenData && (
          <Grid size={{ xs: 12, sm: 6, md: 3 }}>
            <Card variant="outlined">
              <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
                <Typography variant="caption" color="text.secondary">
                  Tokens
                </Typography>
                <Box sx={{ mt: 0.5 }}>
                  <Typography variant="body2">
                    Input: <strong>{formatNumber(stats.totalInputTokens)}</strong>
                  </Typography>
                  <Typography variant="body2">
                    Output: <strong>{formatNumber(stats.totalOutputTokens)}</strong>
                  </Typography>
                  {stats.cachedTokens > 0 && (
                    <Typography variant="body2" color="text.secondary">
                      Cached: {formatNumber(stats.cachedTokens)}
                    </Typography>
                  )}
                </Box>
              </CardContent>
            </Card>
          </Grid>
        )}

        {/* Cost Card */}
        {hasCostData && (
          <Grid size={{ xs: 12, sm: 6, md: 3 }}>
            <Card variant="outlined">
              <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
                <Typography variant="caption" color="text.secondary">
                  Estimated Cost
                </Typography>
                <Typography variant="h6" sx={{ mt: 0.5 }}>
                  {formatCost(stats.estimatedCost!)}
                </Typography>
                {stats.costBreakdown.length > 1 && (
                  <Box sx={{ mt: 0.5 }}>
                    {stats.costBreakdown.map(({ model, cost }) => (
                      <Typography
                        key={model}
                        variant="caption"
                        color="text.secondary"
                        sx={{ display: 'block' }}
                      >
                        {model}: {formatCost(cost)}
                      </Typography>
                    ))}
                  </Box>
                )}
              </CardContent>
            </Card>
          </Grid>
        )}

        {/* Latency Card */}
        {hasLatencyData && (
          <Grid size={{ xs: 12, sm: 6, md: 3 }}>
            <Card variant="outlined">
              <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
                <Typography variant="caption" color="text.secondary">
                  Latency
                </Typography>
                <Box sx={{ mt: 0.5 }}>
                  <Tooltip title="50th percentile (median)">
                    <Typography variant="body2">
                      P50: <strong>{formatDuration(stats.p50Latency)}</strong>
                    </Typography>
                  </Tooltip>
                  <Tooltip title="95th percentile">
                    <Typography variant="body2">
                      P95: <strong>{formatDuration(stats.p95Latency)}</strong>
                    </Typography>
                  </Tooltip>
                  <Tooltip title="99th percentile">
                    <Typography variant="body2">
                      P99: <strong>{formatDuration(stats.p99Latency)}</strong>
                    </Typography>
                  </Tooltip>
                </Box>
              </CardContent>
            </Card>
          </Grid>
        )}

        {/* Status Card */}
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <Card variant="outlined">
            <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
              <Typography variant="caption" color="text.secondary">
                Status
              </Typography>
              <Box sx={{ mt: 0.5, display: 'flex', alignItems: 'center', gap: 1 }}>
                <CheckCircleOutlineIcon
                  fontSize="small"
                  sx={{ color: theme.palette.success.main }}
                />
                <Typography variant="body2">
                  <strong>{stats.successCount}</strong>
                </Typography>
                {stats.errorCount > 0 && (
                  <>
                    <ErrorOutlineIcon
                      fontSize="small"
                      sx={{ color: theme.palette.error.main, ml: 1 }}
                    />
                    <Typography variant="body2">
                      <strong>{stats.errorCount}</strong>
                    </Typography>
                  </>
                )}
              </Box>
              <Typography variant="caption" color="text.secondary">
                {stats.totalSpans} spans ({stats.llmSpanCount} LLM)
              </Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    </Box>
  );
}
```

## Test Plan

### Unit Tests for useTraceStats

```typescript
// src/app/src/components/traces/hooks/useTraceStats.test.ts

import { renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useTraceStats } from './useTraceStats';

describe('useTraceStats', () => {
  it('should aggregate token usage from span attributes', () => {
    const traces = [
      {
        traceId: 'test-1',
        spans: [
          {
            spanId: '1',
            name: 'llm-call',
            startTime: 0,
            endTime: 100,
            attributes: {
              'gen_ai.usage.input_tokens': 100,
              'gen_ai.usage.output_tokens': 50,
              'gen_ai.request.model': 'gpt-4o',
            },
          },
          {
            spanId: '2',
            name: 'llm-call-2',
            startTime: 100,
            endTime: 200,
            attributes: {
              'gen_ai.usage.input_tokens': 200,
              'gen_ai.usage.output_tokens': 100,
              'gen_ai.request.model': 'gpt-4o',
            },
          },
        ],
      },
    ];

    const { result } = renderHook(() => useTraceStats(traces));

    expect(result.current.totalInputTokens).toBe(300);
    expect(result.current.totalOutputTokens).toBe(150);
    expect(result.current.totalTokens).toBe(450);
  });

  it('should calculate latency percentiles correctly', () => {
    // Create 100 spans with durations 1-100ms
    const spans = Array.from({ length: 100 }, (_, i) => ({
      spanId: `span-${i}`,
      name: `span-${i}`,
      startTime: i * 100,
      endTime: i * 100 + (i + 1), // duration = i+1 ms
    }));

    const traces = [{ traceId: 'test-1', spans }];
    const { result } = renderHook(() => useTraceStats(traces));

    expect(result.current.p50Latency).toBe(50);
    expect(result.current.p95Latency).toBe(95);
    expect(result.current.p99Latency).toBe(99);
  });

  it('should count errors correctly', () => {
    const traces = [
      {
        traceId: 'test-1',
        spans: [
          { spanId: '1', name: 'ok', startTime: 0, endTime: 100, statusCode: 1 },
          { spanId: '2', name: 'error', startTime: 0, endTime: 100, statusCode: 2 },
          { spanId: '3', name: 'unset', startTime: 0, endTime: 100, statusCode: 0 },
        ],
      },
    ];

    const { result } = renderHook(() => useTraceStats(traces));

    expect(result.current.errorCount).toBe(1);
    expect(result.current.successCount).toBe(2);
    expect(result.current.totalSpans).toBe(3);
  });

  it('should calculate cost for known models', () => {
    const traces = [
      {
        traceId: 'test-1',
        spans: [
          {
            spanId: '1',
            name: 'llm',
            startTime: 0,
            endTime: 100,
            attributes: {
              'gen_ai.usage.input_tokens': 1000,
              'gen_ai.usage.output_tokens': 500,
              'gen_ai.request.model': 'gpt-4o',
            },
          },
        ],
      },
    ];

    const { result } = renderHook(() => useTraceStats(traces));

    // gpt-4o: $2.5/1M input, $10/1M output
    // (1000 * 2.5e-6) + (500 * 10e-6) = 0.0025 + 0.005 = 0.0075
    expect(result.current.estimatedCost).toBeCloseTo(0.0075, 6);
  });

  it('should return null cost for unknown models', () => {
    const traces = [
      {
        traceId: 'test-1',
        spans: [
          {
            spanId: '1',
            name: 'llm',
            startTime: 0,
            endTime: 100,
            attributes: {
              'gen_ai.usage.input_tokens': 1000,
              'gen_ai.request.model': 'unknown-model-xyz',
            },
          },
        ],
      },
    ];

    const { result } = renderHook(() => useTraceStats(traces));

    expect(result.current.estimatedCost).toBeNull();
  });

  it('should handle empty traces', () => {
    const { result } = renderHook(() => useTraceStats([]));

    expect(result.current.totalSpans).toBe(0);
    expect(result.current.totalTokens).toBe(0);
  });

  it('should handle traces with no spans', () => {
    const traces = [{ traceId: 'test-1', spans: [] }];
    const { result } = renderHook(() => useTraceStats(traces));

    expect(result.current.totalSpans).toBe(0);
  });
});
```

### Component Tests for TraceStats

```typescript
// src/app/src/components/traces/TraceStats.test.tsx

import { createTheme, ThemeProvider } from '@mui/material/styles';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import TraceStats from './TraceStats';

describe('TraceStats', () => {
  const theme = createTheme();

  const renderWithTheme = (traces: any[]) => {
    return render(
      <ThemeProvider theme={theme}>
        <TraceStats traces={traces} />
      </ThemeProvider>
    );
  };

  it('should not render when no spans', () => {
    const { container } = renderWithTheme([]);
    expect(container.firstChild).toBeNull();
  });

  it('should display token counts', () => {
    const traces = [{
      traceId: 'test-1',
      spans: [{
        spanId: '1',
        name: 'llm',
        startTime: 0,
        endTime: 100,
        attributes: {
          'gen_ai.usage.input_tokens': 1234,
          'gen_ai.usage.output_tokens': 567,
          'gen_ai.request.model': 'gpt-4o',
        },
      }],
    }];

    renderWithTheme(traces);

    expect(screen.getByText(/Input:/)).toBeInTheDocument();
    expect(screen.getByText('1,234')).toBeInTheDocument();
    expect(screen.getByText(/Output:/)).toBeInTheDocument();
    expect(screen.getByText('567')).toBeInTheDocument();
  });

  it('should display estimated cost', () => {
    const traces = [{
      traceId: 'test-1',
      spans: [{
        spanId: '1',
        name: 'llm',
        startTime: 0,
        endTime: 100,
        attributes: {
          'gen_ai.usage.input_tokens': 10000,
          'gen_ai.usage.output_tokens': 5000,
          'gen_ai.request.model': 'gpt-4o',
        },
      }],
    }];

    renderWithTheme(traces);

    expect(screen.getByText('Estimated Cost')).toBeInTheDocument();
    // Cost displayed in some format
    expect(screen.getByText(/\$/)).toBeInTheDocument();
  });

  it('should display latency percentiles', () => {
    const traces = [{
      traceId: 'test-1',
      spans: [
        { spanId: '1', name: 'span', startTime: 0, endTime: 100 },
        { spanId: '2', name: 'span', startTime: 0, endTime: 200 },
        { spanId: '3', name: 'span', startTime: 0, endTime: 300 },
      ],
    }];

    renderWithTheme(traces);

    expect(screen.getByText(/P50:/)).toBeInTheDocument();
    expect(screen.getByText(/P95:/)).toBeInTheDocument();
    expect(screen.getByText(/P99:/)).toBeInTheDocument();
  });

  it('should display error count with error styling', () => {
    const traces = [{
      traceId: 'test-1',
      spans: [
        { spanId: '1', name: 'ok', startTime: 0, endTime: 100, statusCode: 1 },
        { spanId: '2', name: 'error', startTime: 0, endTime: 100, statusCode: 2 },
      ],
    }];

    renderWithTheme(traces);

    expect(screen.getByText('Status')).toBeInTheDocument();
    // Check success and error icons are rendered
    expect(screen.getByTestId('CheckCircleOutlineIcon')).toBeInTheDocument();
    expect(screen.getByTestId('ErrorOutlineIcon')).toBeInTheDocument();
  });
});
```

## Implementation Steps

1. **Create model pricing utility** (`src/app/src/utils/modelPricing.ts`)
   - Extract common model prices from provider files
   - Add fuzzy matching for model variants

2. **Create useTraceStats hook** (`src/app/src/components/traces/hooks/useTraceStats.ts`)
   - Token aggregation from span attributes
   - Cost calculation using pricing data
   - Percentile calculations
   - Error counting

3. **Create TraceStats component** (`src/app/src/components/traces/TraceStats.tsx`)
   - Four-card grid layout
   - Conditional rendering based on available data
   - Responsive design

4. **Write tests** for hook and component

5. **Integrate into TraceView** - Add TraceStats above TraceTimeline

6. **Manual testing** with real traces to verify data accuracy

## Future Enhancements (Out of Scope)

- Cost comparison across different model choices
- Latency breakdown by span type (LLM vs retrieval vs tool)
- Time-series charts for multi-trace views
- Export stats to CSV/JSON
- Cost alerting/thresholds

## Files to Create/Modify

| File                                                        | Action                  |
| ----------------------------------------------------------- | ----------------------- |
| `src/app/src/utils/modelPricing.ts`                         | Create                  |
| `src/app/src/components/traces/hooks/useTraceStats.ts`      | Create                  |
| `src/app/src/components/traces/hooks/useTraceStats.test.ts` | Create                  |
| `src/app/src/components/traces/TraceStats.tsx`              | Create                  |
| `src/app/src/components/traces/TraceStats.test.tsx`         | Create                  |
| `src/app/src/components/traces/TraceView.tsx`               | Modify (add TraceStats) |

## Risks & Mitigations

| Risk                                    | Mitigation                                                                    |
| --------------------------------------- | ----------------------------------------------------------------------------- |
| Model pricing data gets stale           | Add `PRICING_LAST_UPDATED` const, link to "pricing may be inaccurate" tooltip |
| Unknown model returns null cost         | Show "N/A" or hide cost card entirely                                         |
| Very large trace (1000+ spans) slows UI | useMemo already handles this; add virtualization if needed later              |
| Spans missing token data                | Only show token card if at least one span has token data                      |
