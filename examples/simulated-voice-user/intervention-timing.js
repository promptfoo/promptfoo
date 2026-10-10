/** Example benchmark: complete exact speech, on the chosen media frame, within 50 ms wall time. */
export default function interventionTiming(_output, context) {
  const records = context.providerResponse?.metadata?.voice?.interventions;
  const maxDispatchDelayMs = context.config?.maxDispatchDelayMs;
  if (!Number.isFinite(maxDispatchDelayMs) || maxDispatchDelayMs < 0) {
    return {
      pass: false,
      score: 0,
      reason: 'Configure a nonnegative maxDispatchDelayMs benchmark.',
    };
  }
  const clips = records?.filter((record) => record.mode === 'audio');
  if (!clips?.length) {
    return { pass: false, score: 0, reason: 'No exact-audio intervention evidence was recorded.' };
  }
  const failures = clips.flatMap((record, index) => {
    const values = [
      record.scheduledAtMs,
      record.firstFrameAtMs,
      record.firstFrameSentAtMs,
      record.completedAtMs,
      record.clipDurationMs,
      record.deliveredAudioBytes,
    ];
    if (!values.every(Number.isFinite)) {
      return [`Clip ${index + 1}: missing timing or delivery evidence.`];
    }
    const frameDelay = record.firstFrameAtMs - record.scheduledAtMs;
    const dispatchDelay = record.firstFrameSentAtMs - record.scheduledAtMs;
    const complete =
      record.clipDurationMs > 0 &&
      record.deliveredAudioBytes === Math.round(record.clipDurationMs * 48) &&
      Math.abs(record.completedAtMs - record.firstFrameAtMs - record.clipDurationMs) < 1 / 24;
    return complete &&
      frameDelay >= 0 &&
      frameDelay < 20 &&
      dispatchDelay >= 0 &&
      dispatchDelay <= maxDispatchDelayMs
      ? []
      : [
          `Clip ${index + 1}: complete=${complete}, media delay=${frameDelay} ms, dispatch delay=${dispatchDelay} ms (limit ${maxDispatchDelayMs} ms).`,
        ];
  });
  return {
    pass: failures.length === 0,
    score: Number(failures.length === 0),
    reason: failures.length
      ? failures.join(' ')
      : `All ${clips.length} clip(s) were fully delivered within the configured ${maxDispatchDelayMs} ms dispatch benchmark. This does not establish target recognition or overlap.`,
  };
}
