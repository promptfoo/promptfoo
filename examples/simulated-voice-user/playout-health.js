/** A benchmark check for bridge underflow; this is not an acoustic quality score. */
export default function playoutHealth(_output, context) {
  const participants = context.providerResponse?.metadata?.voice?.participants;
  const underflow = ['target', 'caller'].map(
    (speaker) => participants?.[speaker]?.playout?.underflowAfterActiveAudioMs,
  );
  const pass = underflow.every((value) => value === 0);
  return {
    pass,
    score: Number(pass),
    reason: pass
      ? 'Neither participant had bridge underflow after active source audio.'
      : `Expected zero underflow after active audio; target=${underflow[0] ?? 'missing'} ms, caller=${underflow[1] ?? 'missing'} ms.`,
  };
}
