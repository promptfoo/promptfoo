/**
 * A deliberately narrow English lexical policy for application playback control.
 * This is not semantic VAD: unfamiliar requests and acknowledgments abstain. The
 * input must be independently recognized caller speech, never an evaluation cue.
 */
export function detectExplicitStop(
  text: string,
  completed = false,
): 'explicit-command' | 'interruption-question' | undefined {
  const normalized = text.trim().toLowerCase().replace(/\s+/g, ' ');
  // Quotation marks and leading negation/context make an imperative ambiguous.
  // Do not strip them and accidentally promote quoted words into a command.
  if (!normalized || /["“”‘’]/.test(normalized)) {
    return undefined;
  }
  // A period/exclamation completes the imperative even if ASR keeps the next
  // sentence in the same item. Bare partial "stop" remains ambiguous. An
  // ellipsis is not a sentence boundary: "stop... by the office" must abstain.
  if (/^(?:please[, ]+)?stop(?:\.|!+)(?:\s|$)/.test(normalized)) {
    return 'explicit-command';
  }
  if (
    /^(?:please[, ]+)?(?:stop (?:talking|speaking|reading)|wait,? (?:a second|a moment)|hold on)(?:[\s,.!?]|$)/.test(
      normalized,
    ) ||
    /^(?:please[, ]+)?pause(?:[,.!?]|$| (?:please|for a moment)(?:[\s,.!?]|$))/.test(normalized)
  ) {
    return 'explicit-command';
  }
  // A partial "stop" might become "stop by the cafe". Wait for the final
  // transcript for this shortest command, at the cost of extra detection delay.
  if (completed && /^(?:please[, ]+)?stop[.!?,]*$/.test(normalized)) {
    return 'explicit-command';
  }
  // Require a question-form continuation. In particular, "what a lovely..."
  // and "can you continue" must not turn acknowledgments into stop commands.
  if (
    /^sorry[, ]+(?:when (?:do|does|did|will|would|is|are|was|can|could)|what (?:time|do|does|did|is|are|was|can|could|would)|how (?:much|many|long|do|does|did|is|are|was|can|could|would)|(?:can|could) you (?:tell|explain|repeat|stop|pause|wait|answer))(?:[\s,.!?]|$)/.test(
      normalized,
    )
  ) {
    return 'interruption-question';
  }
  return undefined;
}
