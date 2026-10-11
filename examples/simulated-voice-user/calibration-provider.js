/** Replay synthetic listener evidence without opening voice sessions. */
export default class CalibrationProvider {
  id() {
    return 'saved-voice-grader-calibration';
  }

  async callApi(_prompt, context) {
    const orderedMessages = context.vars.orderedListenerMessages
      ? JSON.parse(context.vars.orderedListenerMessages)
      : undefined;
    if (
      orderedMessages &&
      (!Array.isArray(orderedMessages) ||
        orderedMessages.some(
          (message) =>
            !['target', 'caller'].includes(message?.speaker) || typeof message.text !== 'string',
        ))
    ) {
      throw new Error('Calibration messages require a target/caller speaker and text.');
    }
    return {
      output: 'Synthetic grader calibration fixture; no live audio.',
      metadata: {
        voice: {
          gradingTranscriptSource: 'listener_input',
          participants: {
            caller: { heard: context.vars.targetHeardByCaller },
            target: { heard: context.vars.callerHeardByTarget },
          },
          ...(orderedMessages
            ? {
                gradingTranscriptOrder: 'listener_event_arrival',
                transcript: orderedMessages.map((message, index) => ({
                  speaker: message.speaker === 'target' ? 'caller' : 'target',
                  source: 'input',
                  delta: message.text,
                  receivedAtMs: index,
                  startMs: index,
                  endMs: index,
                })),
              }
            : {}),
        },
      },
    };
  }
}
