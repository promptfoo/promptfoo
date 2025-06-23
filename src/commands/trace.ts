import type { Command } from 'commander';
import { randomBytes } from 'crypto';
import { eq } from 'drizzle-orm';
import logger from '../logger';
import telemetry from '../telemetry';
import { setupEnv } from '../util';

export function traceCommand(program: Command) {
  const traceCmd = program.command('trace').description('Manage OpenTelemetry tracing');

  traceCmd
    .command('selftest')
    .description('Test OTLP receiver with a sample trace')
    .option('--port <port>', 'OTLP receiver port', '4318')
    .option('--host <host>', 'OTLP receiver host', 'localhost')
    .option('--env-file, --env-path <path>', 'Path to .env file')
    .action(async (cmdObj: { port: string; host: string; envPath?: string }) => {
      setupEnv(cmdObj.envPath);
      logger.info('[Trace] Starting self-test...');

      let testEvaluationId: string | undefined;
      let traceId: string | undefined;
      let db: any;
      let evalsTable: any;

      try {
        // Start the OTLP receiver
        logger.info('[Trace] Starting OTLP receiver...');
        const { startOTLPReceiver } = await import('../tracing/otlpReceiver');
        const port = Number.parseInt(cmdObj.port);
        startOTLPReceiver(port, '0.0.0.0');

        // Wait for receiver to start
        await new Promise((resolve) => setTimeout(resolve, 1000));

        // Generate test trace data
        traceId = randomBytes(16).toString('hex');
        const spanId = randomBytes(8).toString('hex');
        testEvaluationId = `test-eval-${Date.now()}`;
        const testCaseId = `test-case-${Date.now()}`;

        logger.info(`[Trace] Creating test evaluation: ${testEvaluationId}`);

        // Create a dummy evaluation in the database first
        const dbModule = await import('../database');
        const tablesModule = await import('../database/tables');
        db = dbModule.getDb();
        evalsTable = tablesModule.evalsTable;

        await db.insert(evalsTable).values({
          id: testEvaluationId,
          author: 'trace-selftest',
          description: 'Test evaluation for trace selftest',
          results: {},
          config: {
            description: 'Trace selftest evaluation',
          },
          prompts: [],
          vars: [],
        });

        logger.info(`[Trace] Creating test trace: ${traceId}`);

        // Create trace in the store
        const { getTraceStore } = await import('../tracing/store');
        const traceStore = getTraceStore();

        await traceStore.createTrace({
          traceId,
          evaluationId: testEvaluationId,
          testCaseId,
          metadata: {
            source: 'selftest',
            timestamp: new Date().toISOString(),
          },
        });

        // Send OTLP spans
        logger.info('[Trace] Sending test spans to OTLP receiver...');

        const otlpPayload = {
          resourceSpans: [
            {
              resource: {
                attributes: [
                  { key: 'service.name', value: { stringValue: 'promptfoo-selftest' } },
                  { key: 'service.version', value: { stringValue: '1.0.0' } },
                ],
              },
              scopeSpans: [
                {
                  scope: {
                    name: 'promptfoo.selftest',
                    version: '1.0.0',
                  },
                  spans: [
                    {
                      traceId: Buffer.from(traceId, 'hex').toString('base64'),
                      spanId: Buffer.from(spanId, 'hex').toString('base64'),
                      name: 'selftest-root-span',
                      kind: 1, // SPAN_KIND_INTERNAL
                      startTimeUnixNano: (Date.now() * 1_000_000).toString(),
                      endTimeUnixNano: ((Date.now() + 100) * 1_000_000).toString(),
                      attributes: [
                        { key: 'test.type', value: { stringValue: 'selftest' } },
                        { key: 'test.status', value: { stringValue: 'running' } },
                      ],
                      status: {
                        code: 0, // STATUS_CODE_UNSET
                      },
                    },
                    {
                      traceId: Buffer.from(traceId, 'hex').toString('base64'),
                      spanId: Buffer.from(randomBytes(8).toString('hex'), 'hex').toString('base64'),
                      parentSpanId: Buffer.from(spanId, 'hex').toString('base64'),
                      name: 'selftest-child-span',
                      kind: 1, // SPAN_KIND_INTERNAL
                      startTimeUnixNano: ((Date.now() + 10) * 1_000_000).toString(),
                      endTimeUnixNano: ((Date.now() + 90) * 1_000_000).toString(),
                      attributes: [
                        { key: 'operation', value: { stringValue: 'test-operation' } },
                        { key: 'result', value: { stringValue: 'success' } },
                      ],
                      status: {
                        code: 0, // STATUS_CODE_UNSET
                      },
                    },
                  ],
                },
              ],
            },
          ],
        };

        // Send to OTLP receiver
        const response = await fetch(`http://${cmdObj.host}:${cmdObj.port}/v1/traces`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(otlpPayload),
        });

        if (!response.ok) {
          throw new Error(`OTLP receiver returned ${response.status}: ${await response.text()}`);
        }

        logger.info('[Trace] Spans sent successfully');

        // Wait a moment for processing
        await new Promise((resolve) => setTimeout(resolve, 500));

        // Verify the trace was stored
        logger.info('[Trace] Verifying trace storage...');
        const storedTrace = await traceStore.getTrace(traceId);

        if (!storedTrace) {
          throw new Error('Trace not found in store');
        }

        if (!storedTrace.spans || storedTrace.spans.length === 0) {
          throw new Error('No spans found for trace');
        }

        logger.info(
          `[Trace] ✅ Self-test passed! Found trace with ${storedTrace.spans.length} spans`,
        );
        logger.info(`[Trace] Trace ID: ${traceId}`);
        logger.info(`[Trace] Evaluation ID: ${testEvaluationId}`);
        logger.info('[Trace] Spans:');
        for (const span of storedTrace.spans) {
          logger.info(`[Trace]   - ${span.name} (${span.spanId})`);
        }

        telemetry.record('command_used', {
          name: 'trace_selftest',
          status: 'success',
        });

        // Clean up test evaluation and traces
        if (testEvaluationId && db && evalsTable) {
          logger.info(`[Trace] Cleaning up test data...`);

          const { tracesTable, spansTable } = await import('../database/tables');

          // First delete spans that reference the trace
          await db.delete(spansTable).where(eq(spansTable.traceId, traceId));

          // Then delete traces that reference this evaluation
          await db.delete(tracesTable).where(eq(tracesTable.evaluationId, testEvaluationId));

          // Finally delete the evaluation
          await db.delete(evalsTable).where(eq(evalsTable.id, testEvaluationId));
          logger.info(`[Trace] Test data cleaned up successfully`);
        }
      } catch (error) {
        logger.error(`[Trace] ❌ Self-test failed: ${error}`);

        // Try to clean up test evaluation if it was created
        if (testEvaluationId && db && evalsTable) {
          try {
            logger.info(`[Trace] Cleaning up test data after error...`);

            const { tracesTable, spansTable } = await import('../database/tables');

            // First delete spans if trace was created
            if (traceId) {
              await db.delete(spansTable).where(eq(spansTable.traceId, traceId));
            }

            // Then delete traces that reference this evaluation
            await db.delete(tracesTable).where(eq(tracesTable.evaluationId, testEvaluationId));

            // Finally delete the evaluation
            await db.delete(evalsTable).where(eq(evalsTable.id, testEvaluationId));
            logger.info(`[Trace] Test data cleaned up successfully`);
          } catch (cleanupError) {
            logger.error(`[Trace] Failed to clean up test data: ${cleanupError}`);
          }
        }

        telemetry.record('command_used', {
          name: 'trace_selftest',
          status: 'failure',
          error: String(error),
        });
        process.exit(1);
      } finally {
        await telemetry.send();
      }

      // Exit cleanly after a short delay to ensure all logs are flushed
      setTimeout(() => process.exit(0), 100);
    });

  traceCmd
    .command('list')
    .description('List traces for an evaluation')
    .argument('<evaluationId>', 'Evaluation ID to list traces for')
    .option('--env-file, --env-path <path>', 'Path to .env file')
    .action(async (evaluationId: string, cmdObj: { envPath?: string }) => {
      setupEnv(cmdObj.envPath);

      try {
        const { getTraceStore } = await import('../tracing/store');
        const traceStore = getTraceStore();

        const traces = await traceStore.getTracesByEvaluation(evaluationId);

        if (traces.length === 0) {
          logger.info(`No traces found for evaluation ${evaluationId}`);
          return;
        }

        logger.info(`Found ${traces.length} traces for evaluation ${evaluationId}:`);
        for (const trace of traces) {
          logger.info(`\nTrace ID: ${trace.traceId}`);
          logger.info(`Test Case: ${trace.testCaseId}`);
          logger.info(`Created: ${new Date(trace.createdAt).toISOString()}`);
          if (trace.spans && trace.spans.length > 0) {
            logger.info(`Spans (${trace.spans.length}):`);
            for (const span of trace.spans) {
              logger.info(`  - ${span.name} (${span.spanId})`);
            }
          }
        }

        telemetry.record('command_used', {
          name: 'trace_list',
          trace_count: traces.length,
        });
      } catch (error) {
        logger.error(`Failed to list traces: ${error}`);
        process.exit(1);
      } finally {
        await telemetry.send();
      }
    });

  traceCmd
    .command('show')
    .description('Show details for a specific trace')
    .argument('<traceId>', 'Trace ID to display')
    .option('--env-file, --env-path <path>', 'Path to .env file')
    .action(async (traceId: string, cmdObj: { envPath?: string }) => {
      setupEnv(cmdObj.envPath);

      try {
        const { getTraceStore } = await import('../tracing/store');
        const traceStore = getTraceStore();

        const trace = await traceStore.getTrace(traceId);

        if (!trace) {
          logger.error(`Trace ${traceId} not found`);
          process.exit(1);
        }

        logger.info(`Trace Details:`);
        logger.info(`ID: ${trace.traceId}`);
        logger.info(`Evaluation: ${trace.evaluationId}`);
        logger.info(`Test Case: ${trace.testCaseId}`);
        logger.info(`Created: ${new Date(trace.createdAt).toISOString()}`);

        if (trace.metadata) {
          logger.info(`Metadata: ${JSON.stringify(trace.metadata, null, 2)}`);
        }

        if (trace.spans && trace.spans.length > 0) {
          logger.info(`\nSpans (${trace.spans.length}):`);
          for (const span of trace.spans) {
            logger.info(`\n  Span: ${span.name}`);
            logger.info(`  ID: ${span.spanId}`);
            if (span.parentSpanId) {
              logger.info(`  Parent: ${span.parentSpanId}`);
            }
            logger.info(`  Start: ${new Date(span.startTime).toISOString()}`);
            if (span.endTime) {
              logger.info(`  End: ${new Date(span.endTime).toISOString()}`);
              logger.info(`  Duration: ${span.endTime - span.startTime}ms`);
            }
            if (span.statusCode !== undefined) {
              logger.info(`  Status: ${span.statusCode} ${span.statusMessage || ''}`);
            }
            if (span.attributes && Object.keys(span.attributes).length > 0) {
              logger.info(`  Attributes: ${JSON.stringify(span.attributes, null, 4)}`);
            }
          }
        }

        telemetry.record('command_used', {
          name: 'trace_show',
        });
      } catch (error) {
        logger.error(`Failed to show trace: ${error}`);
        process.exit(1);
      } finally {
        await telemetry.send();
      }
    });
}
