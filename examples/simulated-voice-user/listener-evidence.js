/**
 * Project only listener-recognized speech into the text graders. In particular,
 * generated output and the display transcript cannot impersonate heard answers.
 */
export default function listenerEvidence(_output, context) {
  const voice = context.metadata?.voice;
  if (voice?.gradingTranscriptSource !== 'listener_input') {
    throw new Error('Voice grading requires listener_input transcript metadata.');
  }
  const targetHeardByCaller = voice.participants?.caller?.heard;
  const callerHeardByTarget = voice.participants?.target?.heard;
  if (
    typeof targetHeardByCaller !== 'string' ||
    !targetHeardByCaller.trim() ||
    typeof callerHeardByTarget !== 'string' ||
    !callerHeardByTarget.trim()
  ) {
    throw new Error('Voice grading requires nonempty listener transcripts for both participants.');
  }
  return JSON.stringify({ targetHeardByCaller, callerHeardByTarget });
}
