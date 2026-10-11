import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';

import listenerEvidence from './listener-evidence.js';

/** Prepare an independent caller review without replaying or changing the original evaluation. */
export function callerReviewTests(input, { instructionsVar, instructionsText } = {}) {
  const rows = input.results?.results;
  if (!Array.isArray(rows) || rows.length === 0 || rows.length > 1000) {
    throw new Error('Expected 1–1000 saved results.results rows.');
  }
  if (Boolean(instructionsVar) === (instructionsText !== undefined)) {
    throw new Error('Choose exactly one explicit caller-instructions variable or file.');
  }
  return rows.map((row, index) => {
    const instructions = instructionsText ?? row.testCase?.vars?.[instructionsVar];
    if (typeof instructions !== 'string' || !instructions.trim() || instructions.length > 65536) {
      throw new Error(
        `Row ${index + 1} has no bounded caller instructions. Supply the actual instructions used.`,
      );
    }
    const voice = row.response?.metadata?.voice;
    const conversation = listenerEvidence(undefined, { metadata: row.response?.metadata });
    // These are permitted harness utterances, not evidence that their words were
    // heard. Only complete accepted clips qualify; never exempt other caller speech.
    const scripts = (voice.interventions ?? [])
      .filter(
        (entry) =>
          entry?.mode === 'audio' &&
          typeof entry.text === 'string' &&
          entry.text.trim() &&
          Number.isFinite(entry.clipDurationMs) &&
          entry.clipDurationMs > 0 &&
          Number.isSafeInteger(entry.deliveredAudioBytes) &&
          entry.deliveredAudioBytes === Math.round(entry.clipDurationMs * 48) &&
          Number.isFinite(entry.completedAtMs),
      )
      .map((entry) => entry.text);
    return {
      description: `Saved caller review, row ${index + 1}`,
      vars: {
        caller_instructions: instructions,
        conversation,
        scripted_caller_speech: JSON.stringify(scripts),
        capture_status: JSON.stringify({
          stopReason: ['duration_limit', 'timeout', 'error', 'remote_hangup'].includes(
            voice.stopReason,
          )
            ? voice.stopReason
            : 'unknown',
          providerFailed: Boolean(row.response?.error),
        }),
      },
      metadata: {
        originalRowIndex: index,
        originalSuccess: row.success ?? null,
        originalProviderError: row.response?.error ?? null,
        instructionsSource:
          instructionsText === undefined ? `test.vars.${instructionsVar}` : 'explicit file',
        conversationSha256: createHash('sha256').update(conversation).digest('hex'),
        evidenceScope: 'listener recognition only; validate disputes against delivered audio',
      },
    };
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    const { positionals, values } = parseArgs({
      allowPositionals: true,
      options: {
        out: { type: 'string' },
        'instructions-var': { type: 'string' },
        'instructions-file': { type: 'string' },
      },
    });
    if (
      positionals.length !== 1 ||
      !values.out ||
      Boolean(values['instructions-var']) === Boolean(values['instructions-file'])
    ) {
      throw new Error(
        'Supply SAVED_RESULTS.json --out NEW_TESTS.json and exactly one of --instructions-var NAME or --instructions-file FILE.',
      );
    }
    const input = JSON.parse(await readFile(positionals[0], 'utf8'));
    const tests = callerReviewTests(input, {
      instructionsVar: values['instructions-var'],
      instructionsText: values['instructions-file']
        ? await readFile(values['instructions-file'], 'utf8')
        : undefined,
    });
    await writeFile(values.out, `${JSON.stringify(tests, null, 2)}\n`, { flag: 'wx' });
    console.log(
      `Prepared ${tests.length} caller reviews. No model calls; original results unchanged.`,
    );
  } catch (error) {
    console.error(error instanceof Error ? error.message : 'Caller review preparation failed.');
    process.exitCode = 1;
  }
}
