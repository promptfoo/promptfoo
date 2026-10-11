const BYTE_COUNTERS = [
  'sourceBytes',
  'deliveredSourceBytes',
  'transportRejectedSourceBytes',
  'bufferingRejectedSourceBytes',
  'discardedQueuedBytes',
  'discardedSelectedBytes',
  'discardedIncomingBytes',
  'pendingQueuedBytes',
  'pendingSelectedBytes',
];

function validatePlaybackEvents(events, metrics) {
  let previousAtMs = -Infinity;
  const epochs = new Set();
  for (const event of events) {
    if (
      !Number.isFinite(event.atMs) ||
      event.atMs < previousAtMs ||
      !Number.isSafeInteger(event.epoch) ||
      event.epoch < 0
    ) {
      throw new Error(
        'Application playback events must have ordered media clocks and valid epochs.',
      );
    }
    previousAtMs = event.atMs;
    if (event.type === 'suppressed') {
      if (
        !Number.isFinite(event.callerOnsetAtMs) ||
        event.callerOnsetAtMs < 0 ||
        event.atMs < event.callerOnsetAtMs ||
        epochs.has(event.epoch)
      ) {
        throw new Error(
          'Application playback stop has an invalid caller onset or duplicate epoch.',
        );
      }
      epochs.add(event.epoch);
    }
    if (
      event.discardedSourceStartByte !== undefined ||
      event.discardedSourceEndByte !== undefined
    ) {
      const start = event.discardedSourceStartByte;
      const end = event.discardedSourceEndByte;
      if (
        !Number.isSafeInteger(start) ||
        !Number.isSafeInteger(end) ||
        start < 0 ||
        end < start ||
        end > metrics.sourceBytes ||
        start % 2 ||
        end % 2
      ) {
        throw new Error('Application discard offsets are outside the source PCM.');
      }
    }
  }
  if (epochs.size !== metrics.stops) {
    throw new Error('Application stop count does not match the retained events.');
  }
}

/** Validate accounting independently of grading; retained failed runs still need exportable evidence. */
export function validateAppPlayback(playback, { sourcePcmBytes, deliveredPcmBytes } = {}) {
  if (playback?.mode !== 'app-barge-in' || !['media', 'provider'].includes(playback.clock)) {
    throw new Error('Expected explicit app-barge-in evidence with its recorded clock.');
  }
  const metrics = playback.metrics;
  for (const key of BYTE_COUNTERS) {
    if (!Number.isSafeInteger(metrics?.[key]) || metrics[key] < 0 || metrics[key] % 2 !== 0) {
      throw new Error(`Invalid application playback byte counter: ${key}.`);
    }
  }
  const accountedBytes = BYTE_COUNTERS.slice(1).reduce((sum, key) => sum + metrics[key], 0);
  if (!Number.isSafeInteger(accountedBytes) || accountedBytes !== metrics.sourceBytes) {
    throw new Error(
      'Application playback source bytes do not balance against delivery, discard, rejection, and pending bytes.',
    );
  }
  if (sourcePcmBytes !== undefined && metrics.sourceBytes !== sourcePcmBytes) {
    throw new Error(
      'Application playback source byte count does not match the verified source WAV.',
    );
  }
  if (deliveredPcmBytes !== undefined && metrics.deliveredSourceBytes > deliveredPcmBytes) {
    throw new Error('Application playback delivered source exceeds the heard target WAV.');
  }
  if (
    !Number.isSafeInteger(metrics.stops) ||
    metrics.stops < 0 ||
    !Number.isSafeInteger(metrics.suppressedPlaybackMs) ||
    metrics.suppressedPlaybackMs < 0 ||
    typeof metrics.closed !== 'boolean' ||
    typeof metrics.suppressed !== 'boolean' ||
    typeof metrics.recoveryFailed !== 'boolean' ||
    !Array.isArray(playback.events)
  ) {
    throw new Error('Invalid application playback state or event evidence.');
  }
  if (playback.clock === 'provider' && metrics.stops !== 0) {
    throw new Error('A startup failure cannot establish a media-clock interruption.');
  }
  validatePlaybackEvents(playback.events, metrics);
  return {
    ...metrics,
    accountedBytes,
    intentionallyDiscardedBytes:
      metrics.discardedQueuedBytes +
      metrics.discardedSelectedBytes +
      metrics.discardedIncomingBytes,
    rejectedBytes: metrics.transportRejectedSourceBytes + metrics.bufferingRejectedSourceBytes,
    pendingBytes: metrics.pendingQueuedBytes + metrics.pendingSelectedBytes,
    sourceMatchesVerifiedWav: sourcePcmBytes === undefined ? null : true,
  };
}

/** This check establishes application recovery/accounting, not native yielding or semantic success. */
export default function appPlaybackHealth(_output, context) {
  const playback = context.providerResponse?.metadata?.voice?.targetPlayback;
  try {
    const metrics = validateAppPlayback(playback);
    const failures = [];
    if (playback.clock !== 'media') failures.push('media never started');
    if (!metrics.closed) failures.push('controller did not close');
    if (metrics.suppressed || metrics.recoveryFailed) failures.push('playback did not recover');
    if (metrics.rejectedBytes) failures.push('source audio was rejected');
    if (playback.recognition?.status !== 'completed') {
      failures.push('recognition did not complete');
    }
    const expectedStops =
      context.test?.vars?.expectedApplicationStops ?? context.vars?.expectedApplicationStops;
    if (
      expectedStops !== undefined &&
      (!Number.isSafeInteger(expectedStops) || metrics.stops !== expectedStops)
    ) {
      failures.push(`expected ${expectedStops} application stop(s), observed ${metrics.stops}`);
    }
    const pass = failures.length === 0;
    return {
      pass,
      score: Number(pass),
      reason: pass
        ? `Application source bytes balance, recognition completed, and playback recovered. Recognition billing usage is ${playback.recognition.usageConfirmed === true ? 'confirmed' : 'unconfirmed'}; inspect heard-stop latency, false stops, and useful answers separately.`
        : failures.join('; '),
    };
  } catch (error) {
    return {
      pass: false,
      score: 0,
      reason: error instanceof Error ? error.message : 'Invalid application playback evidence.',
    };
  }
}
