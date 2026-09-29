export interface TranscriptTurn {
  speaker: 'user' | 'agent';
  text: string;
  timestamp: number;
}

export const STOP_MARKER = '###STOP###';

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

  hasStopMarker(): boolean {
    return this.stopMarkerDetected;
  }

  getFullTranscript(): string {
    return this.turns
      .map((turn) => `${turn.speaker === 'user' ? 'User' : 'Agent'}: ${turn.text}`)
      .join('\n---\n');
  }

  getTurns(): TranscriptTurn[] {
    return [...this.turns];
  }

  getTurnCount(): number {
    return this.turns.length;
  }

  getCurrentBuffer(): string {
    return this.buffer;
  }

  hasBufferedContent(): boolean {
    return this.buffer.length > 0;
  }

  getLastTurn(): TranscriptTurn | undefined {
    return this.turns[this.turns.length - 1];
  }

  getTurnsBySpeaker(speaker: 'user' | 'agent'): TranscriptTurn[] {
    return this.turns.filter((turn) => turn.speaker === speaker);
  }

  reset(): void {
    this.buffer = '';
    this.turns = [];
    this.stopMarkerDetected = false;
  }

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
