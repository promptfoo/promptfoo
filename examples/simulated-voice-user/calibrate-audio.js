import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';

import { analyzePcm16, readPcm16Wav, writePcm16Wav } from './audio-utils.js';

const sha256 = (data) => createHash('sha256').update(data).digest('hex');

function energy(samples, start, count) {
  let sum = 0;
  for (let index = start; index < start + count; index++) {
    sum += samples[index] ** 2;
  }
  return Math.sqrt(sum / count);
}

/** Generate known edits, not human quality labels. Keep these labels out of model prompts. */
export function createControls(samples, sampleRate) {
  if (!(samples instanceof Int16Array) || samples.length < sampleRate * 2) {
    throw new Error('Calibration needs at least two seconds of mono speech.');
  }
  if (!Number.isInteger(sampleRate) || sampleRate < 8000 || sampleRate > 96000) {
    throw new Error('Expected a valid PCM sample rate.');
  }
  const frame = Math.round(sampleRate * 0.02);
  const gapSize = Math.round(sampleRate * 0.6);
  let start = -1;
  let bestEnergy = 0;
  for (let index = frame; index + gapSize + frame <= samples.length; index += frame) {
    const voicedEnergy = Math.min(
      energy(samples, index - frame, frame),
      energy(samples, index, frame),
      energy(samples, index + gapSize, frame),
    );
    if (voicedEnergy > bestEnergy) {
      bestEnergy = voicedEnergy;
      start = index;
    }
  }
  if (start < 0 || bestEnergy < 1000) {
    throw new Error('Source needs active voiced audio for internal defect controls.');
  }
  const gap = (ms) => {
    const result = Int16Array.from(samples);
    result.fill(0, start, start + Math.round((sampleRate * ms) / 1000));
    return result;
  };
  const fragmentLength = Math.round(sampleRate * 0.2);
  const fragment = samples.slice(start, start + fragmentLength);
  const repeated = new Int16Array(samples.length + fragmentLength * 3);
  repeated.set(samples.subarray(0, start), 0);
  for (let index = 0; index < 4; index++) {
    repeated.set(fragment, start + index * fragmentLength);
  }
  repeated.set(samples.subarray(start + fragmentLength), start + fragmentLength * 4);
  const amplitudes = Array.from(samples, (sample) => Math.abs(sample)).sort(
    (left, right) => left - right,
  );
  const threshold = amplitudes[Math.floor(amplitudes.length * 0.75)];
  if (threshold < 100) {
    throw new Error('Source has too little active speech for severe clipping calibration.');
  }
  const gain = 32768 / threshold;
  const clipped = Int16Array.from(samples, (sample) =>
    Math.max(-32768, Math.min(32767, Math.round(sample * gain))),
  );
  // End at a high-amplitude sample rather than accidentally ending in a natural pause.
  let cut = Math.max(Math.round(sampleRate), start + fragmentLength);
  while (cut < samples.length - frame && Math.abs(samples[cut - 1]) < 4000) {
    cut++;
  }
  if (cut >= samples.length - frame) {
    throw new Error('Could not place an active-speech truncation.');
  }
  return [
    {
      kind: 'unchanged',
      samples: Int16Array.from(samples),
      expected: 'no_issue_flagged',
      requirement: 'negative_control',
      edit: null,
    },
    {
      kind: 'unchanged_duplicate',
      samples: Int16Array.from(samples),
      expected: 'no_issue_flagged',
      requirement: 'consistency_control',
      edit: null,
    },
    {
      kind: 'gap_200ms',
      samples: gap(200),
      expected: 'review_required',
      requirement: 'sensitivity_probe',
      edit: { startSample: start, zeroedSamples: Math.round(sampleRate * 0.2) },
    },
    {
      kind: 'gap_600ms',
      samples: gap(600),
      expected: 'review_required',
      requirement: 'severe_control',
      edit: { startSample: start, zeroedSamples: gapSize },
    },
    {
      kind: 'repetition',
      samples: repeated,
      expected: 'review_required',
      requirement: 'severe_control',
      edit: { startSample: start, fragmentSamples: fragmentLength, copies: 4 },
    },
    {
      kind: 'severe_clipping',
      samples: clipped,
      expected: 'review_required',
      requirement: 'severe_control',
      edit: { gain, clippedFraction: analyzePcm16(clipped, sampleRate).clippedFraction },
    },
    {
      kind: 'truncation',
      samples: samples.slice(0, cut),
      expected: 'review_required',
      requirement: 'severe_control',
      edit: { cutSample: cut },
    },
    {
      kind: 'silence',
      samples: new Int16Array(samples.length),
      expected: 'unratable',
      requirement: 'severe_control',
      edit: { zeroedSamples: samples.length },
    },
  ];
}

/** Produce opaque WAV names and a separate frozen answer key; this command never calls an API. */
export async function generateCalibration({ source, pauseSource, out }) {
  const inputBytes = await readFile(source);
  const input = readPcm16Wav(inputBytes);
  if (input.channels !== 1) {
    throw new Error('Use an isolated mono utterance as --source.');
  }
  const controls = createControls(input.samples, input.sampleRate).map((control) => ({
    ...control,
    sampleRate: input.sampleRate,
  }));
  const pauseBytes = await readFile(pauseSource);
  const pause = readPcm16Wav(pauseBytes);
  if (pause.channels !== 1) {
    throw new Error('Use an unmodified mono conversation channel as --pause-source.');
  }
  const pauseFrame = Math.round(pause.sampleRate * 0.02);
  let quietFrames = 0;
  let hasInternalPause = false;
  let heardSpeech = false;
  for (let start = 0; start + pauseFrame <= pause.samples.length; start += pauseFrame) {
    if (energy(pause.samples, start, pauseFrame) < 100) {
      if (heardSpeech) {
        quietFrames++;
      }
    } else {
      if (quietFrames >= 25) {
        hasInternalPause = true;
      }
      heardSpeech = true;
      quietFrames = 0;
    }
  }
  if (!hasInternalPause) {
    throw new Error('--pause-source needs at least 500 ms of quiet between speech.');
  }
  // This is an observational challenge, not an automatically asserted clean label.
  controls.push({
    kind: 'natural_pause_source',
    samples: pause.samples,
    sampleRate: pause.sampleRate,
    expected: null,
    requirement: 'observational_control',
    edit: null,
  });
  const directory = path.resolve(out);
  await mkdir(path.dirname(directory), { recursive: true });
  await mkdir(directory); // Refuse to overwrite a prior calibration or its frozen labels.
  const cases = [];
  const tests = [];
  for (const control of controls) {
    const id = randomUUID();
    const filename = `${id}.wav`;
    const audio = control.kind.startsWith('unchanged')
      ? inputBytes
      : control.kind === 'natural_pause_source'
        ? pauseBytes
        : writePcm16Wav({ sampleRate: control.sampleRate, channels: 1, samples: control.samples });
    await writeFile(path.join(directory, filename), audio, { flag: 'wx' });
    cases.push({
      id,
      file: filename,
      sha256: sha256(audio),
      kind: control.kind,
      expected: control.expected,
      requirement: control.requirement,
      edit: control.edit,
      metrics: analyzePcm16(control.samples, control.sampleRate),
    });
    tests.push({
      description: id,
      vars: {
        audio_id: id,
        audio_file: `file://${path.join(directory, filename)}`,
        audio_view: control.kind === 'natural_pause_source' ? 'isolated_caller' : 'standalone_clip',
      },
    });
  }
  // Opaque lexical order avoids exposing mutation order in the test list.
  tests.sort((left, right) => left.description.localeCompare(right.description));
  const labels = {
    version: 1,
    createdAt: new Date().toISOString(),
    limitations: [
      'Labels describe deterministic edits, not a human listening panel.',
      'The 200-ms gap is a sensitivity probe; an audio model may miss it.',
      'Unchanged speech and natural pauses still require inspection; no human approval is implied.',
    ],
    source: {
      path: path.resolve(source),
      sha256: sha256(inputBytes),
      sampleRate: input.sampleRate,
    },
    pauseSource: {
      path: path.resolve(pauseSource),
      sha256: sha256(pauseBytes),
      sampleRate: pause.sampleRate,
    },
    cases,
  };
  const serialized = `${JSON.stringify(labels, null, 2)}\n`;
  await writeFile(path.join(directory, 'frozen-labels.json'), serialized, { flag: 'wx' });
  await writeFile(path.join(directory, 'frozen-labels.sha256'), `${sha256(serialized)}\n`, {
    flag: 'wx',
  });
  await writeFile(
    path.join(directory, 'audio-review-tests.json'),
    `${JSON.stringify(tests, null, 2)}\n`,
    { flag: 'wx' },
  );
  return { directory, cases: cases.length, labelsSha256: sha256(serialized) };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    const { values } = parseArgs({
      options: {
        source: { type: 'string' },
        'pause-source': { type: 'string' },
        out: { type: 'string' },
      },
      strict: true,
    });
    if (!values.source || !values['pause-source'] || !values.out) {
      throw new Error(
        `Usage: node ${path.basename(fileURLToPath(import.meta.url))} --source utterance.wav --pause-source channel.wav --out new-directory`,
      );
    }
    console.log(
      JSON.stringify(
        await generateCalibration({
          source: values.source,
          pauseSource: values['pause-source'],
          out: values.out,
        }),
      ),
    );
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
