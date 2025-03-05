/**
 * Example assertion functions for audio-related evaluations
 */

// Simple mock function to check if the response contains audio data
exports.hasAudioOutput = function (output, context) {
  // Real implementation would check if output.audio exists and contains valid data
  if (output && output.audio && output.audio.data) {
    return {
      pass: true,
      score: 1.0,
      reason: 'Response contains audio data',
    };
  }

  return {
    pass: false,
    score: 0.0,
    reason: 'Response does not contain audio data',
  };
};

// Check audio transcript content against expected keywords
exports.containsKeywords = function (output, context) {
  // The expected keywords would be provided in the test
  const expectedKeywords = context.vars.expectedKeywords || [];

  if (!output || !output.audio || !output.audio.transcript) {
    return {
      pass: false,
      score: 0.0,
      reason: 'No audio transcript available',
    };
  }

  const transcript = output.audio.transcript.toLowerCase();
  const foundKeywords = expectedKeywords.filter((keyword) =>
    transcript.includes(keyword.toLowerCase()),
  );

  const score = foundKeywords.length / expectedKeywords.length || 0;

  return {
    pass: score > 0.7,
    score,
    reason: `Found ${foundKeywords.length}/${expectedKeywords.length} expected keywords in audio transcript`,
  };
};

// Check audio duration is within expected range
exports.checkAudioDuration = function (output, context) {
  // In a real implementation, you would parse the audio data to get its duration
  // This is a mock implementation

  const minDuration = context.vars.minDuration || 5; // seconds
  const maxDuration = context.vars.maxDuration || 60; // seconds

  // Mock duration - in a real implementation, you would calculate this from the audio data
  const mockDuration = 15; // seconds

  if (mockDuration >= minDuration && mockDuration <= maxDuration) {
    return {
      pass: true,
      score: 1.0,
      reason: `Audio duration (${mockDuration}s) is within the expected range (${minDuration}s-${maxDuration}s)`,
    };
  }

  return {
    pass: false,
    score: 0.0,
    reason: `Audio duration (${mockDuration}s) is outside the expected range (${minDuration}s-${maxDuration}s)`,
  };
};
