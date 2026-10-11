/**
 * A deliberately narrow English lexical policy for application playback control.
 * This is not semantic VAD: unfamiliar requests and acknowledgments abstain. The
 * input must be independently recognized caller speech, never an evaluation cue.
 */
export function detectExplicitStop(
  text: string,
  completed = false,
): 'explicit-command' | 'interruption-question' | undefined {
  // Keep trailing whitespace: it can confirm a word boundary in a partial delta.
  const normalized = text.trimStart().toLowerCase().replace(/\s+/g, ' ');
  // Word-internal apostrophes are contractions, not quotation boundaries. Keep
  // actual quotes and leading context so quoted imperatives cannot become commands.
  if (
    !normalized.trim() ||
    /["“”]|(?:^|[^\p{L}\p{M}\p{N}])['‘’]|['‘’](?:[^\p{L}\p{M}\p{N}]|$)/u.test(normalized)
  ) {
    return undefined;
  }
  // A terminal period might still become an ellipsis in the next delta. Wait
  // for following whitespace or completion; exclamations are already distinct.
  if (
    /^(?:please[, ]+)?(?:stop|pause)(?:\.(?=\s)|!+(?=\s|$))/.test(normalized) ||
    /^(?:please[, ]+)?pause[,?]/.test(normalized)
  ) {
    return 'explicit-command';
  }
  // Chunk ends are not word boundaries: "hold on" can become "hold onto",
  // and "wait a second" can become "wait a secondary concern".
  const command = normalized.match(
    /^(?:please[, ]+)?(?:stop (?:talking|speaking|reading)|wait,? (?:a second|a moment)|hold on|pause (?:please|for a moment))([\s,.!?]|$)/,
  );
  if (command && (completed || command[1])) {
    return 'explicit-command';
  }
  // Bare "stop" and "pause" may acquire an object or continuation. Only a
  // completed shortest command can bypass the observed-boundary requirement.
  if (completed && /^(?:please[, ]+)?(?:stop|pause)[.!?,]*\s*$/.test(normalized)) {
    return 'explicit-command';
  }
  // Require a question-form continuation and the same observed word boundary.
  const question = normalized.match(
    /^sorry[, ]+(?:when (?:do|does|did|will|would|is|are|was|can|could)|what (?:time|do|does|did|is|are|was|can|could|would)|how (?:much|many|long|do|does|did|is|are|was|can|could|would)|(?:can|could) you (?:tell|explain|repeat|stop|pause|wait|answer))([\s,.!?]|$)/,
  );
  if (question && (completed || question[1])) {
    return 'interruption-question';
  }
  return undefined;
}
