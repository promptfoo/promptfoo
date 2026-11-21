import { eq, type SQL, type SQLWrapper, sql } from 'drizzle-orm';
import { getDb } from '../database';
import { evalResultsTable, evalsTable } from '../database/tables';

import type { getStripFlags } from './evalResult';

export const MAX_REPORT_TEXT_LENGTH = 10_240;

// Keep tests, prompts, provider credentials and tool parameter schemas in SQLite.
// A string policy needs its original bytes to derive the same ID used when grading.
export function reportConfigProjection() {
  const cfg = evalsTable.config;
  return sql`json_object(
    'description', substr(json_extract(${cfg}, '$.description'),1,${MAX_REPORT_TEXT_LENGTH}),
    'env', json((SELECT json_group_object(key, value) FROM json_each(${cfg}, '$.env')
                 WHERE key GLOB 'PROMPTFOO_STRIP_*')),
    'redteam', CASE WHEN json_type(${cfg}, '$.redteam') = 'object' THEN json_object(
      'injectVar', json_extract(${cfg}, '$.redteam.injectVar'),
      'frameworks', json_extract(${cfg}, '$.redteam.frameworks'),
      'plugins', json((SELECT json_group_array(json(CASE p.type
        WHEN 'text' THEN json_quote(p.value)
        ELSE json_object(
          'id',json_extract(p.value,'$.id'), 'severity',json_extract(p.value,'$.severity'),
          'config', CASE WHEN json_extract(p.value,'$.id')='policy' THEN
            json_object('policy',json_extract(p.value,'$.config.policy')) END
        ) END))
        FROM json_each(${cfg}, '$.redteam.plugins') p WHERE p.type IN ('text','object')))
    ) END,
    'providers',json_array(json_object(
      'id',substr(json_extract(${cfg}, '$.providers[0].id'),1,${MAX_REPORT_TEXT_LENGTH}),
      'label',substr(json_extract(${cfg}, '$.providers[0].label'),1,${MAX_REPORT_TEXT_LENGTH}),
      'config',json_object('tools', CASE json_type(${cfg}, '$.providers[0].config.tools')
        WHEN 'array' THEN json((SELECT json_group_array(json(CASE tool.type
          WHEN 'text' THEN json_quote(tool.value)
          ELSE json_object(
            'name',json_extract(tool.value,'$.name'), 'type',json_extract(tool.value,'$.type'),
            'preset',json_extract(tool.value,'$.preset'),
            'description',substr(json_extract(tool.value,'$.description'),1,${MAX_REPORT_TEXT_LENGTH}),
            'function',json_object(
              'name',json_extract(tool.value,'$.function.name'),
              'description',substr(json_extract(tool.value,'$.function.description'),1,${MAX_REPORT_TEXT_LENGTH})
            )
          ) END))
          FROM json_each(${cfg}, '$.providers[0].config.tools') tool WHERE tool.type IN ('text','object')))
        WHEN 'object' THEN json_object(
          'type', json_extract(${cfg}, '$.providers[0].config.tools.type'),
          'preset', json_extract(${cfg}, '$.providers[0].config.tools.preset')
        ) END)
    ))
  )`.mapWith(evalsTable.config);
}

function jsonObjectOrEmpty(value: SQLWrapper): SQL {
  return sql`CASE WHEN json_valid(${value}) THEN CASE WHEN json_type(${value}) = 'object' THEN ${value} ELSE json('{}') END ELSE json('{}') END`;
}

export function jsonObjectFieldOrEmpty(value: SQLWrapper, path: string): SQL {
  const object = jsonObjectOrEmpty(value);
  return sql`CASE WHEN json_type(${object}, ${path}) = 'object' THEN json_extract(${object}, ${path}) ELSE json('{}') END`;
}

function jsonIsObject(value: SQLWrapper): SQL<number> {
  return sql<number>`CASE WHEN json_valid(${value}) THEN CASE WHEN json_type(${value}) = 'object' THEN 1 ELSE 0 END ELSE 0 END`;
}

function jsonTextOrNull(value: SQLWrapper, path: string): SQL<string | null> {
  return sql<
    string | null
  >`CASE WHEN json_type(${value}, ${path}) = 'text' THEN json_extract(${value}, ${path}) ELSE NULL END`;
}

function jsonBoundedTextOrNull(value: SQLWrapper, path: string): SQL<string | null> {
  return sql<
    string | null
  >`CASE WHEN json_type(${value}, ${path}) = 'text' THEN substr(json_extract(${value}, ${path}), 1, ${MAX_REPORT_TEXT_LENGTH}) ELSE NULL END`;
}

function jsonBooleanOrNull(value: SQLWrapper, path: string): SQL<number | null> {
  return sql<
    number | null
  >`CASE WHEN json_type(${value}, ${path}) IN ('true', 'false') THEN json_extract(${value}, ${path}) ELSE NULL END`;
}

function jsonNumberOrNull(value: SQLWrapper, path: string): SQL<number | null> {
  return sql<
    number | null
  >`CASE WHEN json_type(${value}, ${path}) IN ('integer', 'real') THEN json_extract(${value}, ${path}) ELSE NULL END`;
}

function jsonBoundedValueOrNull(value: SQLWrapper, path: string): SQL<string | null> {
  return sql<string | null>`CASE
    WHEN json_type(${value}, ${path}) = 'text'
      THEN json_quote(substr(json_extract(${value}, ${path}), 1, ${MAX_REPORT_TEXT_LENGTH}))
    WHEN json_type(${value}, ${path}) IN ('integer', 'real', 'true', 'false', 'null')
      THEN ${value} -> ${path}
    WHEN json_type(${value}, ${path}) IN ('array', 'object')
      THEN CASE WHEN length(${value} -> ${path}) <= ${MAX_REPORT_TEXT_LENGTH}
        THEN ${value} -> ${path}
        ELSE json_quote(substr(${value} -> ${path}, 1, ${MAX_REPORT_TEXT_LENGTH})) END
    ELSE NULL END`;
}

function jsonSuggestionsOrNull(value: SQLWrapper, path: string): SQL<string | null> {
  return sql<string | null>`CASE
    WHEN json_type(${value}, ${path}) = 'array'
    THEN (
      SELECT json_group_array(
        json_object(
          'type', json_extract(report_suggestion.value, '$.type'),
          'action', json_extract(report_suggestion.value, '$.action'),
          'value', substr(json_extract(report_suggestion.value, '$.value'), 1, ${MAX_REPORT_TEXT_LENGTH})
        )
      )
      FROM (
        SELECT suggestion.value
        FROM json_each(${value}, ${path}) AS suggestion
        WHERE suggestion.type = 'object'
          AND json_type(suggestion.value, '$.type') = 'text'
          AND json_type(suggestion.value, '$.action') = 'text'
          AND json_extract(suggestion.value, '$.action') IN (
            'replace-prompt', 'pre-filter', 'post-filter', 'note'
          )
          AND json_type(suggestion.value, '$.value') = 'text'
        ORDER BY suggestion.key LIMIT 25
      ) AS report_suggestion
    )
    ELSE NULL
  END`;
}

export async function selectReportRows(
  evalId: string,
  legacy: boolean,
  injectVar: string,
  stripFlags: ReturnType<typeof getStripFlags>,
  jsonReportIdentityMetric: (value: SQLWrapper, selectIndex?: boolean) => SQL<string | null>,
) {
  const reportVarKeys = [...new Set([injectVar, 'prompt', 'query', 'question', 'harmCategory'])];
  const db = await getDb();
  const sources = legacy
    ? {
        id: sql<string>`json_extract(report_result.value, '$.id')`,
        promptIdx: sql<number>`COALESCE(json_extract(report_result.value, '$.promptIdx'), 0)`,
        testIdx: sql<number>`COALESCE(json_extract(report_result.value, '$.testIdx'), report_result.key)`,
        promptId: sql<string>`json_extract(report_result.value, '$.promptId')`,
        provider: sql<string>`json_extract(report_result.value, '$.provider')`,
        prompt: sql<string>`json_extract(report_result.value, '$.prompt')`,
        testCase: sql<string>`json_extract(report_result.value, '$.testCase')`,
        response: sql<string>`json_extract(report_result.value, '$.response')`,
        gradingResult: sql<string>`json_extract(report_result.value, '$.gradingResult')`,
        metadata: sql<string>`json_extract(report_result.value, '$.metadata')`,
        error: sql<string>`json_extract(report_result.value, '$.error')`,
        failureReason: sql<number>`json_extract(report_result.value, '$.failureReason')`,
        success: sql<boolean>`json_extract(report_result.value, '$.success')`.mapWith(Boolean),
        score: sql<number>`json_extract(report_result.value, '$.score')`,
        latencyMs: sql<number>`json_extract(report_result.value, '$.latencyMs')`,
      }
    : evalResultsTable;
  const validProviderJson = jsonObjectOrEmpty(sources.provider);
  const validPromptJson = jsonObjectOrEmpty(sources.prompt);
  const validTestCaseJson = jsonObjectOrEmpty(sources.testCase);
  const validResponseJson = jsonObjectOrEmpty(sources.response);
  const validGradingResultJson = jsonObjectOrEmpty(sources.gradingResult);
  const validMetadataJson = jsonObjectOrEmpty(sources.metadata);
  const validTestCaseVarsJson = legacy
    ? sql`CASE WHEN json_type(report_result.value, '$.vars') = 'object' THEN json_extract(report_result.value, '$.vars') ELSE ${jsonObjectFieldOrEmpty(validTestCaseJson, '$.vars')} END`
    : sql`CASE WHEN json_type(${validTestCaseJson}, '$.vars') = 'object' THEN json_extract(${validTestCaseJson}, '$.vars') ELSE json('{}') END`;
  const validReportComponentJson = sql`CASE WHEN report_component.type = 'object' THEN report_component.value ELSE json('{}') END`;
  const columns = {
    id: sources.id,
    legacyResultIndex: legacy ? sql<number | null>`report_result.key` : sql<number | null>`NULL`,
    promptIdx: sources.promptIdx,
    testIdx: sources.testIdx,
    promptId:
      legacy && stripFlags.shouldStripPromptText ? sql<string | null>`NULL` : sources.promptId,
    providerId: jsonBoundedTextOrNull(validProviderJson, '$.id'),
    providerLabel: jsonBoundedTextOrNull(validProviderJson, '$.label'),
    promptObjectId: sql<
      string | null
    >`CASE WHEN json_type(${validPromptJson}, '$.id') = 'text' THEN json_extract(${validPromptJson}, '$.id') ELSE NULL END`,
    promptRaw: stripFlags.shouldStripPromptText
      ? sql<string | null>`'[prompt stripped]'`
      : sql<
          string | null
        >`CASE WHEN json_type(${validPromptJson}, '$.raw') = 'text' THEN substr(json_extract(${validPromptJson}, '$.raw'), 1, ${MAX_REPORT_TEXT_LENGTH}) ELSE NULL END`,
    promptLabel: stripFlags.shouldStripPromptText
      ? sql<string | null>`'[prompt stripped]'`
      : sql<
          string | null
        >`CASE WHEN json_type(${validPromptJson}, '$.label') = 'text' THEN substr(json_extract(${validPromptJson}, '$.label'), 1, ${MAX_REPORT_TEXT_LENGTH}) ELSE NULL END`,
    promptDisplay: stripFlags.shouldStripPromptText
      ? sql<
          string | null
        >`CASE WHEN json_type(${validPromptJson}, '$.display') = 'text' THEN '[prompt stripped]' ELSE NULL END`
      : sql<
          string | null
        >`CASE WHEN json_type(${validPromptJson}, '$.display') = 'text' THEN substr(json_extract(${validPromptJson}, '$.display'), 1, ${MAX_REPORT_TEXT_LENGTH}) ELSE NULL END`,
    vars: stripFlags.shouldStripTestVars
      ? sql<string | null>`NULL`
      : sql<string | null>`(
          SELECT json_group_object(
            report_vars.key,
            CASE report_vars.type
              WHEN 'true' THEN json('true')
              WHEN 'false' THEN json('false')
              WHEN 'null' THEN json('null')
              WHEN 'integer' THEN json(report_vars.value)
              WHEN 'real' THEN json(report_vars.value)
              WHEN 'array' THEN json(report_vars.value)
              WHEN 'object' THEN json(report_vars.value)
              ELSE substr(report_vars.value, 1, ${MAX_REPORT_TEXT_LENGTH})
            END
          )
          FROM json_each(${validTestCaseVarsJson}) AS report_vars
          WHERE report_vars.key IN (${sql.join(
            reportVarKeys.map((key) => sql`${key}`),
            sql`, `,
          )})
            AND (
              report_vars.type NOT IN ('array', 'object')
              OR length(report_vars.value) <= ${MAX_REPORT_TEXT_LENGTH}
            )
        )`,
    responseExists: jsonIsObject(sources.response),
    responseOutput: stripFlags.shouldStripResponseOutput
      ? sql<string | null>`NULL`
      : jsonBoundedValueOrNull(validResponseJson, '$.output'),
    responsePrompt: stripFlags.shouldStripPromptText
      ? sql<string | null>`NULL`
      : jsonBoundedValueOrNull(validResponseJson, '$.prompt'),
    responseRedteamFinalPrompt:
      stripFlags.shouldStripMetadata || stripFlags.shouldStripPromptText
        ? sql<string | null>`NULL`
        : jsonBoundedTextOrNull(validResponseJson, '$.metadata.redteamFinalPrompt'),
    errorExists: sql<number>`CASE
          WHEN ${sources.error} IS NOT NULL AND ${sources.error} <> '' THEN 1
          ELSE 0
        END`,
    failureReason: sources.failureReason,
    success: sources.success,
    score: sources.score,
    latencyMs: sources.latencyMs,
    gradingResultExists: stripFlags.shouldStripGradingResult
      ? sql<number>`0`
      : jsonIsObject(sources.gradingResult),
    gradingPass: stripFlags.shouldStripGradingResult
      ? sql<number | null>`NULL`
      : jsonBooleanOrNull(validGradingResultJson, '$.pass'),
    gradingScore: stripFlags.shouldStripGradingResult
      ? sql<number | null>`NULL`
      : jsonNumberOrNull(validGradingResultJson, '$.score'),
    gradingReason: stripFlags.shouldStripGradingResult
      ? sql<string | null>`NULL`
      : sql<string | null>`CASE
              WHEN json_type(${validGradingResultJson}, '$.reason') = 'text'
              THEN substr(json_extract(${validGradingResultJson}, '$.reason'), 1, ${MAX_REPORT_TEXT_LENGTH})
              ELSE NULL
            END`,
    gradingAssertionType: stripFlags.shouldStripGradingResult
      ? sql<string | null>`NULL`
      : jsonTextOrNull(validGradingResultJson, '$.assertion.type'),
    gradingAssertionMetric: stripFlags.shouldStripGradingResult
      ? sql<string | null>`NULL`
      : jsonTextOrNull(validGradingResultJson, '$.assertion.metric'),
    gradingSuggestions: stripFlags.shouldStripGradingResult
      ? sql<string | null>`NULL`
      : jsonSuggestionsOrNull(validGradingResultJson, '$.suggestions'),
    // Materialization keeps representative searches outside the component loop.
    gradingComponentResults: stripFlags.shouldStripGradingResult
      ? sql<string | null>`NULL`
      : sql<string | null>`CASE
          WHEN json_type(${validGradingResultJson}, '$.componentResults') = 'array'
          THEN (
            WITH report_indices AS MATERIALIZED (
              SELECT
                ${jsonReportIdentityMetric(validGradingResultJson, true)} AS identity_index,
                (
                  SELECT moderation_component.key
                  FROM json_each(${validGradingResultJson}, '$.componentResults') AS moderation_component
                  WHERE moderation_component.type = 'object'
                    AND json_extract(moderation_component.value, '$.assertion.type') = 'moderation'
                    AND json_type(moderation_component.value, '$.pass') = 'false'
                  ORDER BY moderation_component.key LIMIT 1
                ) AS moderation_index,
                (
                  SELECT suggestion_component.key
                  FROM json_each(${validGradingResultJson}, '$.componentResults') AS suggestion_component
                  WHERE json_array_length(${jsonSuggestionsOrNull(
                    sql`CASE WHEN suggestion_component.type = 'object' THEN suggestion_component.value ELSE NULL END`,
                    '$.suggestions',
                  )}) > 0
                  ORDER BY suggestion_component.key LIMIT 1
                ) AS suggestion_index
            )
            SELECT json_group_array(
              json_patch(
                json_patch(
                  json_object(
                    'pass', ${jsonBooleanOrNull(validReportComponentJson, '$.pass')},
                    'score', ${jsonNumberOrNull(validReportComponentJson, '$.score')},
                    'reason', CASE
                      WHEN json_type(${validReportComponentJson}, '$.reason') = 'text'
                      THEN substr(json_extract(${validReportComponentJson}, '$.reason'), 1, ${MAX_REPORT_TEXT_LENGTH})
                      ELSE NULL
                    END
                  ),
                  CASE
                    WHEN json_type(${validReportComponentJson}, '$.assertion') = 'object'
                    THEN json_object(
                      'assertion',
                      json_object(
                        'type', ${jsonTextOrNull(validReportComponentJson, '$.assertion.type')},
                        'metric', ${jsonTextOrNull(validReportComponentJson, '$.assertion.metric')}
                      )
                    )
                    ELSE json('{}')
                  END
                ),
                  CASE
                    WHEN json_type(${validReportComponentJson}, '$.suggestions') = 'array'
                    THEN json_object(
                      'suggestions',
                      json(${jsonSuggestionsOrNull(validReportComponentJson, '$.suggestions')})
                    )
                  ELSE json('{}')
                END
              )
            )
            FROM report_indices CROSS JOIN json_each(
              json_extract(${validGradingResultJson}, '$.componentResults')
            ) AS report_component
            WHERE report_component.type = 'object'
              AND (
                report_component.key < 25
                OR report_component.key = report_indices.identity_index
                OR report_component.key = report_indices.moderation_index
                OR report_component.key = report_indices.suggestion_index
              )
          )
          ELSE NULL
        END`,
    identityMetric:
      !stripFlags.shouldStripGradingResult || stripFlags.shouldStripMetadata
        ? sql<string | null>`NULL`
        : jsonReportIdentityMetric(validGradingResultJson),
    metadataPluginId: jsonTextOrNull(validMetadataJson, '$.pluginId'),
    metadataPolicyId: jsonTextOrNull(validMetadataJson, '$.policyId'),
    metadataHarmCategory: jsonTextOrNull(validMetadataJson, '$.harmCategory'),
    metadataRedteamFinalPrompt:
      stripFlags.shouldStripMetadata || stripFlags.shouldStripPromptText
        ? sql<string | null>`NULL`
        : jsonBoundedTextOrNull(validMetadataJson, '$.redteamFinalPrompt'),
    testCasePluginId: jsonTextOrNull(validTestCaseJson, '$.metadata.pluginId'),
    testCaseStrategyId: jsonTextOrNull(validTestCaseJson, '$.metadata.strategyId'),
    testCasePolicyId: jsonTextOrNull(validTestCaseJson, '$.metadata.policyId'),
  };
  return legacy
    ? await db
        .select(columns)
        .from(
          sql`${evalsTable}, json_each(CASE WHEN json_valid(${evalsTable.results}) AND json_type(${evalsTable.results}, '$.results') = 'array' THEN json_extract(${evalsTable.results}, '$.results') ELSE json('[]') END) AS report_result`,
        )
        .where(sql`${evalsTable.id} = ${evalId} AND report_result.type = 'object'`)
        .orderBy(sources.testIdx, sources.promptIdx, sources.id)
        .all()
    : await db
        .select(columns)
        .from(evalResultsTable)
        .where(eq(evalResultsTable.evalId, evalId))
        .orderBy(evalResultsTable.testIdx, evalResultsTable.promptIdx, evalResultsTable.id)
        .all();
}
