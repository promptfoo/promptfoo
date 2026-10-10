/** Replay synthetic listener evidence without opening voice sessions. */
export default class CalibrationProvider {
  id() {
    return 'saved-voice-grader-calibration';
  }

  async callApi(_prompt, context) {
    return {
      output: 'Synthetic grader calibration fixture; no live audio.',
      metadata: {
        voice: {
          gradingTranscriptSource: 'listener_input',
          participants: {
            caller: { heard: context.vars.targetHeardByCaller },
            target: { heard: context.vars.callerHeardByTarget },
          },
        },
      },
    };
  }
}
