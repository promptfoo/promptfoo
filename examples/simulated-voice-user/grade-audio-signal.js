import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';

import { analyzePcm16, readPcm16Wav } from './audio-utils.js';

// Fixed engineering thresholds, not a perceptual speech-quality scale. References
// establish exact transport/sample edits; they must be independently supplied.
export const SIGNAL_POLICY = Object.freeze({
  version: 1,
  minimumGapMs: 40,
  minimumBoundaryStep: 1000,
  minimumClippedFraction: 0.01,
  minimumClippedSamples: 24,
  minimumRepeatedMs: 80,
  maximumRepeatedMs: 600,
  minimumCopies: 3,
});

export function readAudioInput(input) {
  if (typeof input !== 'string' || !input) {
    throw new Error('Missing actual WAV input.');
  }
  const bytes = input.startsWith('file://')
    ? readFileSync(input.slice('file://'.length))
    : Buffer.from(input, 'base64');
  return { bytes, audio: readPcm16Wav(bytes) };
}

export function readAudioReference(vars) {
  if (vars?.audio_reference === undefined && vars?.audio_reference_sha256 === undefined) {
    return undefined;
  }
  if (!/^[a-f0-9]{64}$/.test(vars?.audio_reference_sha256 ?? '')) {
    throw new Error('An independently recorded SHA-256 is required for the clean reference.');
  }
  const reference = readAudioInput(vars.audio_reference);
  if (createHash('sha256').update(reference.bytes).digest('hex') !== vars.audio_reference_sha256) {
    throw new Error('Clean-reference SHA-256 mismatch.');
  }
  return reference.audio;
}

/** Bind provider transport counters to these exact recording bytes, not an unrelated run. */
export function readAudioTransport(vars, bytes) {
  const transport = vars?.audio_transport;
  if (transport === undefined) return undefined;
  if (
    !transport ||
    typeof transport !== 'object' ||
    transport.version !== 1 ||
    transport.recordingSha256 !== createHash('sha256').update(bytes).digest('hex') ||
    !Array.isArray(transport.participants) ||
    transport.participants.length < 1 ||
    transport.participants.length > 2
  ) {
    throw new Error('Invalid transport evidence or recording SHA-256 mismatch.');
  }
  const roles = new Set();
  const audio = readPcm16Wav(bytes);
  const durationMs = (audio.samples.length / audio.channels / audio.sampleRate) * 1000;
  for (const participant of transport.participants) {
    if (
      !participant ||
      !['target', 'caller'].includes(participant.role) ||
      roles.has(participant.role) ||
      typeof participant.underflowAfterActiveAudioMs !== 'number' ||
      !Number.isFinite(participant.underflowAfterActiveAudioMs) ||
      participant.underflowAfterActiveAudioMs < 0 ||
      !Number.isInteger(participant.underflowEvents) ||
      participant.underflowEvents < 0 ||
      participant.underflowAfterActiveAudioMs > durationMs + 1000 / audio.sampleRate ||
      (participant.underflowAfterActiveAudioMs > 0 && participant.underflowEvents === 0)
    ) {
      throw new Error('Invalid participant transport counters.');
    }
    roles.add(participant.role);
  }
  if (
    (vars?.audio_view === 'isolated_target' && (roles.size !== 1 || !roles.has('target'))) ||
    (vars?.audio_view === 'isolated_caller' && (roles.size !== 1 || !roles.has('caller'))) ||
    (vars?.audio_view === 'stereo_conversation' && roles.size !== 2)
  ) {
    throw new Error('Transport participant roles do not match the recording view.');
  }
  return {
    ...transport,
    scope:
      'Provider-observed bridge underflow after active audio; not network or microphone quality.',
  };
}

function channelSamples(audio, channel) {
  if (audio.channels === 1) {
    return audio.samples;
  }
  return Int16Array.from(
    { length: audio.samples.length / audio.channels },
    (_, frame) => audio.samples[frame * audio.channels + channel],
  );
}

function sameRange(samples, left, right, count) {
  for (let offset = 0; offset < count; offset++) {
    if (samples[left + offset] !== samples[right + offset]) {
      return false;
    }
  }
  return true;
}

/** Detect bit-identical repeats, not ordinary repeated words with new waveforms. */
function repeatedPcm(samples, rate) {
  const window = Math.round(rate * 0.02);
  const minimum = Math.round((rate * SIGNAL_POLICY.minimumRepeatedMs) / 1000);
  const maximum = Math.round((rate * SIGNAL_POLICY.maximumRepeatedMs) / 1000);
  // Rolling hashes only select candidates. Every reported match is byte-compared.
  let power = 1;
  for (let index = 1; index < window; index++) power = Math.imul(power, 31);
  let hash = 0;
  for (let index = 0; index < Math.min(window, samples.length); index++) {
    hash = (Math.imul(hash, 31) + samples[index]) | 0;
  }
  const seen = new Map();
  const history = new Int32Array(maximum + 1);
  for (let start = 0; start + window <= samples.length; start++) {
    if (start > 0) {
      hash =
        (Math.imul((hash - Math.imul(samples[start - 1], power)) | 0, 31) +
          samples[start + window - 1]) |
        0;
    }
    if (start > maximum) {
      const expired = start - maximum - 1;
      const expiredHash = history[expired % history.length];
      if (seen.get(expiredHash) === expired) seen.delete(expiredHash);
    }
    history[start % history.length] = hash;
    const previous = seen.get(hash);
    // Retaining the most recent match ignores small waveform periods and silence.
    seen.set(hash, start);
    if (previous === undefined) continue;
    const period = start - previous;
    if (period < minimum || period > maximum || previous + period * 3 > samples.length) continue;
    if (!sameRange(samples, previous, start, period * 2)) continue;
    let energy = 0;
    let changes = 0;
    for (let index = previous; index < start; index++) {
      energy += samples[index] ** 2;
      if (index > previous && samples[index] !== samples[index - 1]) changes++;
    }
    if (Math.sqrt(energy / period) < 1000 || changes < period / 4) continue;
    return { startSample: previous, endSample: previous + period * 3, periodSamples: period };
  }
  return undefined;
}

// Only a local loss surrounded by unchanged PCM is a reference-proven dropout.
function referenceAttenuation(samples, baseline, sampleRate) {
  if (!baseline || samples.length !== baseline.length) return undefined;
  let first = 0;
  while (first < samples.length && samples[first] === baseline[first]) first++;
  let last = samples.length;
  while (last > first && samples[last - 1] === baseline[last - 1]) last--;
  let sourceEnergy = 0;
  let receivedEnergy = 0;
  for (let index = first; index < last; index++) {
    sourceEnergy += baseline[index] ** 2;
    receivedEnergy += samples[index] ** 2;
  }
  const contextSamples = Math.round(sampleRate * 0.02);
  if (
    last - first >= (sampleRate * SIGNAL_POLICY.minimumGapMs) / 1000 &&
    first >= contextSamples &&
    last + contextSamples <= samples.length &&
    Math.sqrt(sourceEnergy / (last - first)) >= 1000 &&
    receivedEnergy / sourceEnergy < 0.001
  ) {
    return { first, last };
  }
  return undefined;
}

function inspectGaps(
  { samples, baseline, sampleRate, channel, identical, metrics },
  add,
  observations,
) {
  const erased = referenceAttenuation(samples, baseline, sampleRate);
  if (erased) {
    add(
      'dropout',
      channel,
      erased.first,
      erased.last,
      'reference_difference',
      'A local span loses over 99.9% of reference signal energy while surrounding PCM is unchanged.',
    );
  }
  for (const island of metrics.zeroIslands) {
    if (island.durationMs < SIGNAL_POLICY.minimumGapMs || erased) continue;
    const start = Math.round((island.startMs * sampleRate) / 1000);
    const end = Math.round((island.endMs * sampleRate) / 1000);
    const erasedReference =
      baseline &&
      samples.length === baseline.length &&
      baseline.subarray(start, end).some((sample) => Math.abs(sample) >= 1000);
    const abrupt =
      Math.abs(samples[start - 1]) >= SIGNAL_POLICY.minimumBoundaryStep &&
      Math.abs(samples[end]) >= SIGNAL_POLICY.minimumBoundaryStep;
    if (erasedReference || (!identical && abrupt)) {
      add(
        'dropout',
        channel,
        start,
        end,
        erasedReference ? 'reference_difference' : 'signal_anomaly',
        erasedReference
          ? 'Digital silence replaces active PCM in the independently supplied reference.'
          : 'Internal digital silence has abrupt active boundaries; it needs review, not an automatic network-cause conclusion.',
      );
    } else {
      observations.push({
        channel,
        type: 'pause',
        ...island,
        reason: identical
          ? 'Pause also exists in the clean reference.'
          : 'Silence alone cannot distinguish a natural pause from a dropout.',
      });
    }
  }
}

function signalState(allZero, findings) {
  if (allZero) return 'unratable';
  return findings.length ? 'review_required' : 'no_issue_flagged';
}

/** Inspect measured PCM without transcripts, expected defect labels, or model judgments. */
export function analyzeAudioSignal(audio, reference, transport) {
  if (
    reference &&
    (audio.channels !== reference.channels || audio.sampleRate !== reference.sampleRate)
  ) {
    throw new Error('Reference and recording must use the same sample rate and channels.');
  }
  const findings = [];
  const observations = [];
  const channels = [];
  const add = (type, channel, start, end, evidence, description) =>
    findings.push({
      type,
      channel,
      start_seconds: start / audio.sampleRate,
      end_seconds: end / audio.sampleRate,
      evidence,
      description,
    });
  for (const participant of transport?.participants ?? []) {
    if (participant.underflowAfterActiveAudioMs > 0) {
      findings.push({
        type: 'dropout',
        channel: participant.role,
        start_seconds: null,
        end_seconds: null,
        evidence: 'transport_counter',
        description: `${participant.underflowAfterActiveAudioMs} ms of bridge underflow after active ${participant.role} audio. The counter does not locate individual gaps.`,
      });
    }
  }
  const allZero = audio.samples.every((sample) => sample === 0);
  if (allZero) {
    add(
      'silence',
      null,
      0,
      audio.samples.length / audio.channels,
      'measured',
      'Every PCM sample is zero; any reported speech is unsupported by this recording.',
    );
  }
  for (let channel = 0; channel < audio.channels; channel++) {
    const samples = channelSamples(audio, channel);
    const metrics = analyzePcm16(samples, audio.sampleRate);
    channels.push({ channel, ...metrics });
    if (allZero) continue;
    const baseline = reference && channelSamples(reference, channel);
    const identical =
      baseline &&
      samples.length === baseline.length &&
      samples.every((sample, index) => sample === baseline[index]);
    if (
      metrics.clippedSamples >= SIGNAL_POLICY.minimumClippedSamples &&
      metrics.clippedFraction >= SIGNAL_POLICY.minimumClippedFraction
    ) {
      add(
        'distortion',
        channel,
        0,
        samples.length,
        'measured',
        `${metrics.clippedSamples} samples (${(metrics.clippedFraction * 100).toFixed(2)}%) hit PCM rails; inspect for clipping.`,
      );
    }
    inspectGaps(
      { samples, baseline, sampleRate: audio.sampleRate, channel, identical, metrics },
      add,
      observations,
    );
    const repetition = repeatedPcm(samples, audio.sampleRate);
    if (repetition && !identical) {
      add(
        'repetition',
        channel,
        repetition.startSample,
        repetition.endSample,
        'measured',
        `At least three bit-identical ${((repetition.periodSamples * 1000) / audio.sampleRate).toFixed(1)} ms PCM fragments repeat consecutively.`,
      );
    }
    if (
      baseline &&
      samples.length < baseline.length &&
      samples.every((sample, index) => sample === baseline[index])
    ) {
      if (baseline.subarray(samples.length).some((sample) => Math.abs(sample) >= 1000)) {
        add(
          'cutoff',
          channel,
          samples.length,
          samples.length,
          'reference_difference',
          'Recording is an exact prefix of the reference and omits active reference samples.',
        );
      }
    } else if (
      metrics.activeAtEnd &&
      samples.length >= audio.sampleRate * 0.1 &&
      Math.abs(samples.at(-1)) >= SIGNAL_POLICY.minimumBoundaryStep &&
      !identical
    ) {
      observations.push({
        channel,
        type: 'active_endpoint',
        reason: 'Active PCM at the capture boundary is ambiguous without a complete reference.',
      });
    }
  }
  return {
    version: SIGNAL_POLICY.version,
    state: signalState(allZero, findings),
    referenceUsed: Boolean(reference),
    transport,
    findings,
    observations,
    channels,
    limitations:
      'Signal checks detect sample defects, not intelligibility, semantic success, or human-perceived quality. Unflagged audio is not guaranteed clean.',
  };
}

export default function gradeAudioSignal(_output, context) {
  try {
    const { bytes, audio } = readAudioInput(context?.vars?.audio_file);
    const grade = analyzeAudioSignal(
      audio,
      readAudioReference(context?.vars),
      readAudioTransport(context?.vars, bytes),
    );
    return {
      pass: grade.state === 'no_issue_flagged',
      score: grade.state === 'no_issue_flagged' ? 1 : 0,
      reason: grade.findings.length
        ? `PCM signal check: ${JSON.stringify(grade.findings)}`
        : 'PCM signal check flagged no defect; acoustic-model and task reviews are separate.',
      metadata: { audioSignal: grade },
    };
  } catch (error) {
    return { pass: false, score: 0, reason: `Invalid signal evidence: ${error.message}` };
  }
}

// This command makes no model calls and accepts ordinary exported audio tests,
// including long conversation channels with no clean-reference recording.
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    const { values } = parseArgs({
      options: {
        tests: { type: 'string' },
        out: { type: 'string' },
        'without-reference': { type: 'boolean', default: false },
        'without-transport': { type: 'boolean', default: false },
      },
      strict: true,
    });
    if (!values.tests || !values.out) {
      throw new Error(
        'Usage: node grade-audio-signal.js --tests audio-review-tests.json --out new-signal-score.json [--without-reference] [--without-transport]',
      );
    }
    const tests = JSON.parse(readFileSync(values.tests, 'utf8'));
    if (!Array.isArray(tests) || !tests.length)
      throw new Error('Expected a nonempty audio test array.');
    const cases = tests.map((test) => {
      let provenance;
      try {
        const { bytes, audio } = readAudioInput(test.vars?.audio_file);
        provenance = {
          inputSha256: createHash('sha256').update(bytes).digest('hex'),
          inputHashScope: test.vars.audio_file.startsWith('file://')
            ? 'referenced_local_file'
            : 'test_variable',
        };
        return {
          id: test.vars?.audio_id,
          ...provenance,
          ...analyzeAudioSignal(
            audio,
            values['without-reference'] ? undefined : readAudioReference(test.vars),
            values['without-transport'] ? undefined : readAudioTransport(test.vars, bytes),
          ),
        };
      } catch (error) {
        return { id: test.vars?.audio_id, ...provenance, state: 'error', error: error.message };
      }
    });
    const report = {
      policy: SIGNAL_POLICY,
      cases,
      dispositions: Object.fromEntries(
        ['no_issue_flagged', 'review_required', 'unratable', 'error'].map((state) => [
          state,
          cases.filter((item) => item.state === state).length,
        ]),
      ),
    };
    writeFileSync(values.out, `${JSON.stringify(report, null, 2)}\n`, { flag: 'wx' });
    console.log(JSON.stringify(report.dispositions));
    if (cases.some((item) => item.state !== 'no_issue_flagged')) process.exitCode = 1;
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
