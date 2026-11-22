import { readFileSync } from 'node:fs';

import { readPcm16Wav } from './audio-utils.js';

const schema = JSON.parse(
  readFileSync(new URL('./audio-review-schema.json', import.meta.url), 'utf8'),
);

/** Parse the exact acoustic-review contract independently of the evaluation's assertion result. */
export function parseAudioReview(output) {
  const review = typeof output === 'string' ? JSON.parse(output) : null;
  const keys = schema.required;
  if (
    !review ||
    Array.isArray(review) ||
    typeof review !== 'object' ||
    Object.keys(review).length !== keys.length ||
    !keys.every((key) => Object.hasOwn(review, key)) ||
    !schema.properties.status.enum.includes(review.status) ||
    !schema.properties.intelligibility.enum.includes(review.intelligibility) ||
    typeof review.transcript !== 'string' ||
    review.transcript.length > 20000 ||
    typeof review.summary !== 'string' ||
    !review.summary.trim() ||
    review.summary.length > 2000 ||
    !Array.isArray(review.findings) ||
    review.findings.length > 30
  ) {
    throw new Error('Missing or invalid audio review evidence.');
  }
  const findingSchema = schema.properties.findings.items;
  for (const finding of review.findings) {
    if (
      !finding ||
      typeof finding !== 'object' ||
      Object.keys(finding).length !== findingSchema.required.length ||
      !findingSchema.required.every((key) => Object.hasOwn(finding, key)) ||
      !findingSchema.properties.type.enum.includes(finding.type) ||
      !findingSchema.properties.severity.enum.includes(finding.severity) ||
      typeof finding.description !== 'string' ||
      !finding.description.trim() ||
      finding.description.length > 2000
    ) {
      throw new Error('Invalid audio finding.');
    }
    for (const time of [finding.start_seconds, finding.end_seconds]) {
      if (time !== null && (typeof time !== 'number' || !Number.isFinite(time) || time < 0)) {
        throw new Error('Invalid audio finding timestamp.');
      }
    }
    if (
      finding.start_seconds !== null &&
      finding.end_seconds !== null &&
      finding.end_seconds < finding.start_seconds
    ) {
      throw new Error('Audio finding ends before it starts.');
    }
  }
  if (
    review.status === 'no_issue_flagged' &&
    (review.intelligibility !== 'clear' || !review.transcript.trim() || review.findings.length > 0)
  ) {
    throw new Error(
      'Contradictory no-issue judgment: speech is unclear, missing, or has reported defects.',
    );
  }
  return review;
}

/** Check timing and localized channel claims against actual PCM, without grading audio quality. */
export function validateAudioReviewTimestamps(review, audio, audioView) {
  const durationSeconds = audio.samples.length / audio.channels / audio.sampleRate;
  // One PCM frame only accommodates floating-point/sample-boundary rounding.
  const latestTime = durationSeconds + 1 / audio.sampleRate;
  if (
    review.findings.some((finding) =>
      [finding.start_seconds, finding.end_seconds].some(
        (time) => time !== null && time > latestTime,
      ),
    )
  ) {
    throw new Error('Finding timestamp is outside the recording duration.');
  }
  // The example's stereo export assigns one participant to each channel. This
  // exact-zero check can disprove a localized claim of the two sides overlapping;
  // nonzero samples cannot establish speech, simultaneity, or a defect. Other
  // recording views may mix speakers in one channel, so do not apply it there.
  if (audioView !== 'stereo_conversation' || audio.channels !== 2) {
    return;
  }
  for (const finding of review.findings) {
    if (
      finding.type !== 'overlap' ||
      finding.start_seconds === null ||
      finding.end_seconds === null ||
      finding.end_seconds <= finding.start_seconds
    ) {
      continue;
    }
    // Include every PCM frame intersecting the approximate interval. Rounding
    // inward could turn a boundary sample into a false exact-zero rejection.
    const startFrame = Math.floor(finding.start_seconds * audio.sampleRate);
    const endFrame = Math.min(
      audio.samples.length / audio.channels,
      Math.ceil(finding.end_seconds * audio.sampleRate),
    );
    if (endFrame <= startFrame) {
      continue;
    }
    for (let channel = 0; channel < audio.channels; channel++) {
      let hasSignal = false;
      for (let frame = startFrame; frame < endFrame; frame++) {
        if (audio.samples[frame * audio.channels + channel] !== 0) {
          hasSignal = true;
          break;
        }
      }
      if (!hasSignal) {
        throw new Error(
          `Overlap finding is unsupported: conversation channel ${channel + 1} is exactly zero throughout its timestamp interval.`,
        );
      }
    }
  }
}

/** An advisory acoustic no-issue result is distinct from verified task success. */
export default function validateAudioReview(output, context) {
  let review;
  try {
    const input = context?.vars?.audio_file;
    if (typeof input !== 'string' || !input) {
      throw new Error('Missing actual WAV input for the independent no-signal check.');
    }
    const bytes = input.startsWith('file://')
      ? readFileSync(input.slice('file://'.length))
      : Buffer.from(input, 'base64');
    const audio = readPcm16Wav(bytes);
    if (audio.samples.every((sample) => sample === 0)) {
      throw new Error(
        'Recording contains no signal. A model transcript cannot establish speech in an all-zero WAV.',
      );
    }
    review = parseAudioReview(output);
    validateAudioReviewTimestamps(review, audio, context?.vars?.audio_view);
  } catch (error) {
    return {
      pass: false,
      score: 0,
      reason: `Invalid audio review: ${error.message} The recording remains unreviewed.`,
    };
  }
  if (review.status !== 'no_issue_flagged') {
    return {
      pass: false,
      score: 0,
      reason: `Audio-model review: ${review.status}. ${review.summary}`,
    };
  }
  return {
    pass: true,
    score: 1,
    reason:
      'The audio model flagged no issue. This is advisory, not human listening or proof of gap-free audio.',
  };
}
