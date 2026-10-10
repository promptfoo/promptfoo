/**
 * Project only listener-recognized speech into the text graders. In particular,
 * generated output and the display transcript cannot impersonate heard answers.
 */
export default function listenerEvidence(_output, context) {
  const voice = context.metadata?.voice;
  if (voice?.gradingTranscriptSource !== 'listener_input') {
    throw new Error('Voice grading requires listener_input transcript metadata.');
  }
  if (voice.transcript !== undefined) {
    if (
      !Array.isArray(voice.transcript) ||
      voice.gradingTranscriptOrder !== 'listener_event_arrival'
    ) {
      throw new Error(
        'Voice grading requires listener transcripts in observed event-arrival order.',
      );
    }
    const messages = [];
    for (const fragment of voice.transcript) {
      if (fragment?.source !== 'input') {
        continue;
      }
      if (!['target', 'caller'].includes(fragment.speaker) || typeof fragment.delta !== 'string') {
        throw new Error('Voice grading requires valid listener transcript fragments.');
      }
      // The fragment speaker is the listener. Preserve callback order even when
      // timestamps tie; model start/end times do not share an acoustic clock.
      const speaker = fragment.speaker === 'caller' ? 'target' : 'caller';
      const last = messages.at(-1);
      if (last?.speaker === speaker) {
        last.text += fragment.delta;
      } else if (fragment.delta.trim()) {
        messages.push({ speaker, text: fragment.delta });
      }
    }
    if (
      !['target', 'caller'].every((speaker) =>
        messages.some((message) => message.speaker === speaker && message.text.trim()),
      )
    ) {
      throw new Error(
        'Voice grading requires nonempty listener transcripts for both participants.',
      );
    }
    return JSON.stringify({ order: 'listener_event_arrival', messages });
  }

  // Older saved fixtures may contain only one string per listener. Keep their
  // explicit claims usable, but never manufacture question/answer chronology.
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
  return JSON.stringify({ order: 'unavailable', targetHeardByCaller, callerHeardByTarget });
}
