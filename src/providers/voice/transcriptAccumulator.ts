/**
 * Transcript Accumulator
 *
 * Accumulates transcript deltas from voice providers and tracks
 * conversation history. Detects stop markers for conversation end.
 */

/**
 * A completed transcript turn.
 */
export interface TranscriptTurn {
  /** Who spoke */
  speaker: 'user' | 'agent';
  /** What they said */
  text: string;
  /** Timestamp when turn completed */
  timestamp: number;
}

/**
 * The stop marker that signals goal achievement.
 */
export const STOP_MARKER = '###STOP###';

/**
 * Accumulates transcript deltas and manages conversation history.
 *
 * Features:
 * - Accumulates streaming transcript deltas
 * - Tracks completed turns with speaker labels
 * - Detects stop markers for conversation end
 * - Formats full transcript for output
 */
export class TranscriptAccumulator {
  private buffer: string = '';
  private turns: TranscriptTurn[] = [];
  private stopMarkerDetected: boolean = false;

  /**
   * Append a transcript delta to the current buffer.
   *
   * @param delta The transcript text to append
   */
  append(delta: string): void {
    this.buffer += delta;

    // Check for stop marker as we accumulate
    if (this.buffer.includes(STOP_MARKER)) {
      this.stopMarkerDetected = true;
    }
  }

  /**
   * Complete the current transcript and add it as a turn.
   *
   * @param speaker Who was speaking ('user' or 'agent')
   * @returns The completed transcript text
   */
  complete(speaker: 'user' | 'agent'): string {
    const text = this.buffer.trim();

    if (text) {
      this.turns.push({
        speaker,
        text,
        timestamp: Date.now(),
      });
    }

    // Reset buffer for next turn
    this.buffer = '';

    return text;
  }

  /**
   * Complete the current buffer with a provided full transcript.
   * Used when the provider sends the complete transcript separately.
   *
   * @param speaker Who was speaking
   * @param fullText The complete transcript text
   * @returns The transcript text
   */
  completeWithText(speaker: 'user' | 'agent', fullText: string): string {
    const text = fullText.trim();

    if (text) {
      this.turns.push({
        speaker,
        text,
        timestamp: Date.now(),
      });

      // Check for stop marker
      if (text.includes(STOP_MARKER)) {
        this.stopMarkerDetected = true;
      }
    }

    // Reset buffer
    this.buffer = '';

    return text;
  }

  /**
   * Check if the stop marker has been detected.
   */
  hasStopMarker(): boolean {
    return this.stopMarkerDetected;
  }

  /**
   * Get the full transcript formatted for output.
   *
   * Format:
   * ```
   * User: Hello
   * ---
   * Agent: Hi there
   * ---
   * User: Goodbye
   * ```
   */
  getFullTranscript(): string {
    return this.turns
      .map((turn) => `${turn.speaker === 'user' ? 'User' : 'Agent'}: ${turn.text}`)
      .join('\n---\n');
  }

  /**
   * Get all completed turns.
   */
  getTurns(): TranscriptTurn[] {
    return [...this.turns];
  }

  /**
   * Get the number of completed turns.
   */
  getTurnCount(): number {
    return this.turns.length;
  }

  /**
   * Get the current buffer (incomplete transcript).
   */
  getCurrentBuffer(): string {
    return this.buffer;
  }

  /**
   * Check if there's content in the buffer.
   */
  hasBufferedContent(): boolean {
    return this.buffer.length > 0;
  }

  /**
   * Get the last completed turn.
   */
  getLastTurn(): TranscriptTurn | undefined {
    return this.turns[this.turns.length - 1];
  }

  /**
   * Get turns for a specific speaker.
   */
  getTurnsBySpeaker(speaker: 'user' | 'agent'): TranscriptTurn[] {
    return this.turns.filter((turn) => turn.speaker === speaker);
  }

  /**
   * Reset the accumulator (clears buffer and turns).
   */
  reset(): void {
    this.buffer = '';
    this.turns = [];
    this.stopMarkerDetected = false;
  }

  /**
   * Clear only the buffer (keeps turns).
   */
  clearBuffer(): void {
    this.buffer = '';
  }

  /**
   * Check if any transcript contains a specific phrase.
   *
   * @param phrase The phrase to search for
   * @param caseSensitive Whether to match case (default: false)
   */
  contains(phrase: string, caseSensitive: boolean = false): boolean {
    const searchPhrase = caseSensitive ? phrase : phrase.toLowerCase();

    return this.turns.some((turn) => {
      const text = caseSensitive ? turn.text : turn.text.toLowerCase();
      return text.includes(searchPhrase);
    });
  }

  /**
   * Get transcript summary statistics.
   */
  getStats(): {
    totalTurns: number;
    userTurns: number;
    agentTurns: number;
    totalWords: number;
    averageWordsPerTurn: number;
  } {
    const userTurns = this.turns.filter((t) => t.speaker === 'user').length;
    const agentTurns = this.turns.filter((t) => t.speaker === 'agent').length;
    const totalWords = this.turns.reduce((sum, turn) => {
      return sum + turn.text.split(/\s+/).filter(Boolean).length;
    }, 0);

    return {
      totalTurns: this.turns.length,
      userTurns,
      agentTurns,
      totalWords,
      averageWordsPerTurn: this.turns.length > 0 ? totalWords / this.turns.length : 0,
    };
  }
}

/**
 * Extract the stop marker from a transcript if present.
 * Returns the transcript with the stop marker removed.
 *
 * @param transcript The transcript text
 * @returns Object with cleaned transcript and whether stop marker was found
 */
export function extractStopMarker(transcript: string): {
  text: string;
  hasStopMarker: boolean;
} {
  const hasStopMarker = transcript.includes(STOP_MARKER);
  const text = transcript.replace(STOP_MARKER, '').trim();

  return { text, hasStopMarker };
}

/**
 * Format a conversation transcript for display.
 *
 * @param turns Array of transcript turns
 * @param separator Separator between turns (default: '\n---\n')
 */
export function formatTranscript(turns: TranscriptTurn[], separator: string = '\n---\n'): string {
  return turns
    .map((turn) => `${turn.speaker === 'user' ? 'User' : 'Agent'}: ${turn.text}`)
    .join(separator);
}
