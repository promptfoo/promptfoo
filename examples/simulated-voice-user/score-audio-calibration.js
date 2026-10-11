import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';

import { readPcm16Wav } from './audio-utils.js';
import { parseAudioReview, validateAudioReviewTimestamps } from './validate-audio-review.js';

const categories = {
  gap_200ms: 'dropout',
  gap_600ms: 'dropout',
  repetition: 'repetition',
  severe_clipping: 'distortion',
  truncation: 'cutoff',
  silence: 'silence',
};
const sha256 = (data) => createHash('sha256').update(data).digest('hex');

function inputHash(result) {
  const messages = JSON.parse(result.prompt.raw);
  const audio = messages
    .flatMap((message) => (Array.isArray(message.content) ? message.content : []))
    .filter((part) => part.type === 'input_audio');
  if (
    audio.length !== 1 ||
    audio[0].input_audio.format !== 'wav' ||
    typeof audio[0].input_audio.data !== 'string'
  ) {
    throw new Error('Expected exactly one rendered WAV input in the saved prompt.');
  }
  let bytes;
  let scope;
  if (audio[0].input_audio.data === '[REDACTED]') {
    const reference = result.testCase?.vars?.audio_file;
    if (typeof reference !== 'string' || !reference.startsWith('file://')) {
      throw new Error('Rendered audio is redacted and no local source reference is available.');
    }
    bytes = readFileSync(reference.slice('file://'.length));
    scope = 'referenced_local_file';
  } else {
    bytes = Buffer.from(audio[0].input_audio.data, 'base64');
    scope = 'rendered_prompt';
  }
  return { sha256: sha256(bytes), scope, audio: readPcm16Wav(bytes) };
}

function defectDisposition(control, category, expectedPositive) {
  if (control.state === 'error') {
    return 'errors';
  }
  if (control.state === 'unratable' && category !== 'silence') {
    return 'unknown';
  }
  const detected =
    category === 'silence' ? control.predictedSilence : control.findings.includes(category);
  if (expectedPositive) {
    return detected ? 'truePositive' : 'falseNegative';
  }
  return detected ? 'falsePositive' : 'trueNegative';
}

function countDefects(cases) {
  const confusion = {};
  const observed = cases.flatMap((control) => control.findings ?? []);
  for (const category of [...new Set([...Object.values(categories), ...observed])]) {
    const counts = {
      truePositive: 0,
      falseNegative: 0,
      falsePositive: 0,
      trueNegative: 0,
      unknown: 0,
      errors: 0,
    };
    for (const control of cases) {
      const expectedPositive = categories[control.kind] === category;
      const expectedNegative =
        control.requirement === 'negative_control' || control.requirement === 'consistency_control';
      if (!expectedPositive && !expectedNegative) {
        continue;
      }
      counts[defectDisposition(control, category, expectedPositive)]++;
    }
    confusion[category] = counts;
  }
  return confusion;
}

/** Compare every frozen control, including missing, duplicate, malformed and unknown outcomes. */
export function scoreCalibration(labels, exported) {
  if (
    labels?.version !== 1 ||
    !Array.isArray(labels.cases) ||
    !Array.isArray(exported?.results?.results)
  ) {
    throw new Error('Expected frozen-labels.json and a native Promptfoo JSON export.');
  }
  const results = exported.results.results;
  const ids = new Set(labels.cases.map((control) => control.id));
  if (ids.size !== labels.cases.length) {
    throw new Error('Duplicate IDs in frozen labels.');
  }
  const extraRows = results.filter((result) => !ids.has(result.testCase?.vars?.audio_id)).length;
  const cases = labels.cases.map((control) => {
    const matches = results.filter((result) => result.testCase?.vars?.audio_id === control.id);
    const base = {
      id: control.id,
      kind: control.kind,
      expected: control.expected,
      requirement: control.requirement,
      sourceSha256: control.sha256,
    };
    let inputProvenance = { inputHashVerified: false };
    let review;
    let predictedSilence;
    try {
      if (matches.length !== 1) {
        throw new Error(matches.length === 0 ? 'Missing result.' : 'Duplicate results.');
      }
      const result = matches[0];
      if (result.response?.error || result.failureReason === 2) {
        throw new Error('Provider or evaluation error.');
      }
      const verifiedInput = inputHash(result);
      inputProvenance = {
        inputHashVerified: verifiedInput.sha256 === control.sha256,
        inputSha256: verifiedInput.sha256,
        inputHashScope: verifiedInput.scope,
      };
      if (!inputProvenance.inputHashVerified) {
        throw new Error('Submitted WAV differs from frozen control.');
      }
      review = parseAudioReview(result.response?.output);
      predictedSilence =
        review.status === 'unratable' &&
        review.intelligibility === 'no_speech' &&
        !review.transcript.trim();
      validateAudioReviewTimestamps(review, verifiedInput.audio);
      const category = categories[control.kind];
      const findings = review.findings.map((finding) => finding.type);
      const detected =
        category === 'silence' ? predictedSilence : category ? findings.includes(category) : null;
      return {
        ...base,
        state: review.status,
        ...inputProvenance,
        predictedSilence,
        statusMatches: control.expected === null ? null : review.status === control.expected,
        defectCategory: category ?? null,
        expectedDefectDetected: detected,
        silenceHallucination: control.kind === 'silence' && Boolean(review.transcript.trim()),
        findings,
        review,
        usage: result.response?.tokenUsage,
        cost: result.response?.cost,
        cached: result.response?.cached,
      };
    } catch (error) {
      return {
        ...base,
        state: 'error',
        error: error.message,
        ...inputProvenance,
        predictedSilence,
        review,
        statusMatches: false,
        expectedDefectDetected: false,
      };
    }
  });
  const expected = cases.filter((control) => control.expected !== null);
  const required = cases.filter((control) => control.requirement === 'severe_control');
  const negatives = cases.filter((control) =>
    ['negative_control', 'consistency_control'].includes(control.requirement),
  );
  const calibrationPassed =
    required.length > 0 &&
    negatives.length > 0 &&
    extraRows === 0 &&
    cases.every((control) => control.state !== 'error') &&
    required.every(
      (control) => control.statusMatches === true && control.expectedDefectDetected === true,
    ) &&
    negatives.every((control) => control.statusMatches === true);
  return {
    version: 1,
    interpretation:
      'Labels describe known signal mutations, not human-rated acoustic truth. No-issue judgments are advisory. Unknowns and errors are not correct detections.',
    calibrationPassed,
    totalCases: cases.length,
    extraRows,
    errors: cases.filter((control) => control.state === 'error').length,
    statusMatches: expected.filter((control) => control.statusMatches).length,
    statusComparisons: expected.length,
    observationalCases: cases.filter((control) => control.expected === null).length,
    dispositions: Object.fromEntries(
      ['no_issue_flagged', 'review_required', 'unratable', 'error'].map((state) => [
        state,
        cases.filter((control) => control.state === state).length,
      ]),
    ),
    perDefect: countDefects(cases),
    cases,
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    const { values } = parseArgs({
      options: { labels: { type: 'string' }, results: { type: 'string' }, out: { type: 'string' } },
      strict: true,
    });
    if (!values.labels || !values.results || !values.out) {
      throw new Error(
        'Usage: node score-audio-calibration.js --labels frozen-labels.json --results results.json --out new-score.json',
      );
    }
    const labelBytes = await readFile(values.labels);
    const expectedHash = (
      await readFile(path.join(path.dirname(values.labels), 'frozen-labels.sha256'), 'utf8')
    ).trim();
    if (sha256(labelBytes) !== expectedHash) {
      throw new Error('Frozen label hash mismatch.');
    }
    const resultBytes = await readFile(values.results);
    const score = {
      ...scoreCalibration(JSON.parse(labelBytes), JSON.parse(resultBytes)),
      labelsSha256: sha256(labelBytes),
      resultsSha256: sha256(resultBytes),
    };
    await writeFile(values.out, `${JSON.stringify(score, null, 2)}\n`, { flag: 'wx' });
    console.log(
      JSON.stringify({
        calibrationPassed: score.calibrationPassed,
        cases: score.totalCases,
        statusMatches: score.statusMatches,
        statusComparisons: score.statusComparisons,
        errors: score.errors,
      }),
    );
    if (!score.calibrationPassed) {
      process.exitCode = 1;
    }
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
