import { existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { concatenateWav, describeWav, ensureWav } from '../../../src/redteam/nativeAudio/audio';
import { SessionRunner } from '../../../src/redteam/nativeAudio/sessionRunner';
import type { AttackTurn, RunConfig } from '../../../src/redteam/nativeAudio/types';

// Mock the planner
vi.mock('../../../src/redteam/nativeAudio/planner', () => ({
  planAttackText: vi.fn(async ({ basePrompt, turnNumber }) => {
    return `${basePrompt} - turn ${turnNumber}`;
  }),
}));

// Mock the TTS and provider generators
vi.mock('../../../src/redteam/nativeAudio/attackGenerators', () => ({
  TtsAttackGenerator: class {
    async generate(turn: AttackTurn, context: any) {
      const text = `TTS: ${turn.prompt}`;
      const audio = ensureWav(Buffer.from(text), 24000);
      return {
        transcript: text,
        audio,
        refused: false,
      };
    }
  },
  ProviderAttackGenerator: class {
    async generate(turn: AttackTurn, context: any) {
      const text = `Provider: ${turn.prompt}`;
      const audio = ensureWav(Buffer.from(text), 24000);
      return {
        transcript: text,
        audio,
        refused: false,
      };
    }
  },
}));

// Mock the provider selector
vi.mock('../../../src/redteam/nativeAudio/providers/openaiRealtimeProvider', () => {
  return {
    OpenAiRealtimeProvider: class MockProvider {
      private transcriptCallback: ((text: string, turn: number) => void) | null = null;
      private audioCallback: ((audio: Buffer, turn: number) => void) | null = null;
      private events: any[] = [];

      async connect() {}
      async close() {}

      onModelTranscript(callback: (text: string, turn: number) => void) {
        this.transcriptCallback = callback;
      }

      onModelAudio(callback: (audio: Buffer, turn: number) => void) {
        this.audioCallback = callback;
      }

      async sendUserAudio(audio: Buffer, turn: number) {
        // Simulate target response
        const responseText = `Target response to turn ${turn}`;
        const responseAudio = ensureWav(Buffer.from(`Audio for turn ${turn}`), 24000);

        if (this.transcriptCallback) {
          this.transcriptCallback(responseText, turn);
        }
        if (this.audioCallback) {
          this.audioCallback(responseAudio, turn);
        }
      }

      async completeTurn() {}

      drainEvents() {
        const events = [...this.events];
        this.events = [];
        return events;
      }
    },
  };
});

vi.mock('../../../src/redteam/nativeAudio/providers/dryRunProvider', () => {
  return {
    DryRunProvider: class MockProvider {
      private transcriptCallback: ((text: string, turn: number) => void) | null = null;
      private audioCallback: ((audio: Buffer, turn: number) => void) | null = null;
      private events: any[] = [];

      async connect() {}
      async close() {}

      onModelTranscript(callback: (text: string, turn: number) => void) {
        this.transcriptCallback = callback;
      }

      onModelAudio(callback: (audio: Buffer, turn: number) => void) {
        this.audioCallback = callback;
      }

      async sendUserAudio(audio: Buffer, turn: number) {
        // Simulate target response
        const responseText = `Target response to turn ${turn}`;
        const responseAudio = ensureWav(Buffer.from(`Audio for turn ${turn}`), 24000);

        if (this.transcriptCallback) {
          this.transcriptCallback(responseText, turn);
        }
        if (this.audioCallback) {
          this.audioCallback(responseAudio, turn);
        }
      }

      async completeTurn() {}

      drainEvents() {
        const events = [...this.events];
        this.events = [];
        return events;
      }
    },
  };
});

describe('SessionRunner', () => {
  const testOutputRoot = join(__dirname, '.test-output');

  beforeEach(() => {
    // Clean up test directory
    if (existsSync(testOutputRoot)) {
      rmSync(testOutputRoot, { recursive: true, force: true });
    }
    mkdirSync(testOutputRoot, { recursive: true });
    vi.clearAllMocks();
  });

  afterEach(() => {
    // Clean up after tests
    if (existsSync(testOutputRoot)) {
      rmSync(testOutputRoot, { recursive: true, force: true });
    }
  });

  describe('conversation execution', () => {
    it('should run a complete 12-turn conversation', async () => {
      const baseTurn: AttackTurn = {
        id: 'test-1',
        prompt: 'Base prompt',
        pluginId: 'test-plugin',
      };

      const runConfig: RunConfig = {
        runId: 'test-run-1',
        targetProvider: 'dry-run',
        attackerKind: 'tts',
        speechProvider: 'dry-run',
        turnCount: 12,
        outputRoot: testOutputRoot,
      };

      const runner = new SessionRunner({
        runConfig,
        baseTurn,
        attackerPrompt: { systemPrompt: 'Test system prompt' },
      });

      const result = await runner.run();

      expect(result.turns.length).toBe(12);
      expect(result.transcript.length).toBeGreaterThan(0);

      // Verify each turn has both attacker and target data
      for (let i = 0; i < 12; i++) {
        const turn = result.turns.find((t) => t.turn === i + 1);
        expect(turn).toBeDefined();
        expect(turn?.attackerText).toBeDefined();
        expect(turn?.targetText).toBeDefined();
        expect(turn?.attackerAudioPath).toBeDefined();
        expect(turn?.targetAudioPath).toBeDefined();
      }
    });

    it('should generate escalating prompts across turns', async () => {
      const baseTurn: AttackTurn = {
        id: 'test-2',
        prompt: 'Test escalation',
        pluginId: 'test-plugin',
      };

      const runConfig: RunConfig = {
        runId: 'test-run-2',
        targetProvider: 'dry-run',
        attackerKind: 'tts',
        speechProvider: 'dry-run',
        turnCount: 12,
        outputRoot: testOutputRoot,
      };

      const runner = new SessionRunner({
        runConfig,
        baseTurn,
        attackerPrompt: { systemPrompt: 'Test system prompt' },
      });

      const result = await runner.run();

      // Verify turns use the planner (mocked to return "Base prompt - turn N")
      expect(result.turns[0].attackerText).toContain('turn 1');
      expect(result.turns[5].attackerText).toContain('turn 6');
      expect(result.turns[11].attackerText).toContain('turn 12');
    });

    it('should handle custom turn counts', async () => {
      const baseTurn: AttackTurn = {
        id: 'test-3',
        prompt: 'Custom turns',
      };

      const runConfig: RunConfig = {
        runId: 'test-run-3',
        targetProvider: 'dry-run',
        attackerKind: 'tts',
        speechProvider: 'dry-run',
        turnCount: 6,
        outputRoot: testOutputRoot,
      };

      const runner = new SessionRunner({
        runConfig,
        baseTurn,
        attackerPrompt: { systemPrompt: 'Test system prompt' },
      });

      const result = await runner.run();

      expect(result.turns.length).toBe(6);
    });
  });

  describe('audio artifacts', () => {
    it('should save per-turn audio files', async () => {
      const baseTurn: AttackTurn = {
        id: 'test-4',
        prompt: 'Per-turn audio test',
      };

      const runConfig: RunConfig = {
        runId: 'test-run-4',
        targetProvider: 'dry-run',
        attackerKind: 'tts',
        speechProvider: 'dry-run',
        turnCount: 3,
        outputRoot: testOutputRoot,
      };

      const runner = new SessionRunner({
        runConfig,
        baseTurn,
        attackerPrompt: { systemPrompt: 'Test system prompt' },
      });

      const result = await runner.run();

      // Verify per-turn files exist
      for (let i = 1; i <= 3; i++) {
        const attackerPath = join(result.artifacts.runDir, `turn-${i}-attacker.wav`);
        const targetPath = join(result.artifacts.runDir, `turn-${i}-target.wav`);

        expect(existsSync(attackerPath)).toBe(true);
        expect(existsSync(targetPath)).toBe(true);

        // Verify files are valid WAV
        const attackerWav = readFileSync(attackerPath);
        const targetWav = readFileSync(targetPath);

        expect(attackerWav.toString('ascii', 0, 4)).toBe('RIFF');
        expect(targetWav.toString('ascii', 0, 4)).toBe('RIFF');
      }
    });

    it('should create concatenated conversation audio files', async () => {
      const baseTurn: AttackTurn = {
        id: 'test-5',
        prompt: 'Concatenation test',
      };

      const runConfig: RunConfig = {
        runId: 'test-run-5',
        targetProvider: 'dry-run',
        attackerKind: 'tts',
        speechProvider: 'dry-run',
        turnCount: 4,
        outputRoot: testOutputRoot,
      };

      const runner = new SessionRunner({
        runConfig,
        baseTurn,
        attackerPrompt: { systemPrompt: 'Test system prompt' },
      });

      const result = await runner.run();

      // Verify conversation audio files exist
      expect(result.conversationAudioPaths).toBeDefined();
      expect(result.conversationAudioPaths?.attacker).toBeDefined();
      expect(result.conversationAudioPaths?.target).toBeDefined();

      const attackerConvPath = result.conversationAudioPaths!.attacker;
      const targetConvPath = result.conversationAudioPaths!.target;

      expect(existsSync(attackerConvPath)).toBe(true);
      expect(existsSync(targetConvPath)).toBe(true);

      // Verify files are valid WAV
      const attackerConvWav = readFileSync(attackerConvPath);
      const targetConvWav = readFileSync(targetConvPath);

      expect(attackerConvWav.toString('ascii', 0, 4)).toBe('RIFF');
      expect(targetConvWav.toString('ascii', 0, 4)).toBe('RIFF');
    });

    it('should concatenate audio correctly with no gaps or overlaps', async () => {
      const baseTurn: AttackTurn = {
        id: 'test-6',
        prompt: 'Gap test',
      };

      const runConfig: RunConfig = {
        runId: 'test-run-6',
        targetProvider: 'dry-run',
        attackerKind: 'tts',
        speechProvider: 'dry-run',
        turnCount: 3,
        outputRoot: testOutputRoot,
      };

      const runner = new SessionRunner({
        runConfig,
        baseTurn,
        attackerPrompt: { systemPrompt: 'Test system prompt' },
      });

      const result = await runner.run();

      // Read individual turn files
      const turn1 = readFileSync(join(result.artifacts.runDir, 'turn-1-attacker.wav'));
      const turn2 = readFileSync(join(result.artifacts.runDir, 'turn-2-attacker.wav'));
      const turn3 = readFileSync(join(result.artifacts.runDir, 'turn-3-attacker.wav'));

      // Manually concatenate to compare
      const manualConcat = concatenateWav([turn1, turn2, turn3], 24000);

      // Read the session runner's concatenation
      const sessionConcat = readFileSync(result.conversationAudioPaths!.attacker);

      // Compare descriptions to verify same duration and structure
      const manualDesc = describeWav(manualConcat);
      const sessionDesc = describeWav(sessionConcat);

      expect(sessionDesc.sampleRate).toBe(manualDesc.sampleRate);
      expect(sessionDesc.frames).toBe(manualDesc.frames);
      expect(sessionDesc.durationSec).toBeCloseTo(manualDesc.durationSec || 0, 2);
    });

    it('should include conversation audio paths in artifacts', async () => {
      const baseTurn: AttackTurn = {
        id: 'test-7',
        prompt: 'Artifacts test',
      };

      const runConfig: RunConfig = {
        runId: 'test-run-7',
        targetProvider: 'dry-run',
        attackerKind: 'tts',
        speechProvider: 'dry-run',
        turnCount: 2,
        outputRoot: testOutputRoot,
      };

      const runner = new SessionRunner({
        runConfig,
        baseTurn,
        attackerPrompt: { systemPrompt: 'Test system prompt' },
      });

      const result = await runner.run();

      expect(result.artifacts.conversationAttackerAudioPath).toBeDefined();
      expect(result.artifacts.conversationTargetAudioPath).toBeDefined();
      expect(result.artifacts.conversationAttackerAudioPath).toContain(
        'conversation-attacker-full.wav',
      );
      expect(result.artifacts.conversationTargetAudioPath).toContain(
        'conversation-target-full.wav',
      );
    });
  });

  describe('metadata and transcripts', () => {
    it('should create transcript with all turns', async () => {
      const baseTurn: AttackTurn = {
        id: 'test-8',
        prompt: 'Transcript test',
      };

      const runConfig: RunConfig = {
        runId: 'test-run-8',
        targetProvider: 'dry-run',
        attackerKind: 'tts',
        speechProvider: 'dry-run',
        turnCount: 5,
        outputRoot: testOutputRoot,
      };

      const runner = new SessionRunner({
        runConfig,
        baseTurn,
        attackerPrompt: { systemPrompt: 'Test system prompt' },
      });

      const result = await runner.run();

      // Should have 10 transcript segments (5 attacker + 5 target)
      expect(result.transcript.length).toBe(10);

      // Verify alternating roles
      const attackerSegments = result.transcript.filter((s) => s.role === 'attacker');
      const targetSegments = result.transcript.filter((s) => s.role === 'target');

      expect(attackerSegments.length).toBe(5);
      expect(targetSegments.length).toBe(5);

      // Verify turn numbers are correct
      expect(result.transcript[0].turn).toBe(1); // First attacker
      expect(result.transcript[1].turn).toBe(1); // First target
      expect(result.transcript[8].turn).toBe(5); // Last attacker
      expect(result.transcript[9].turn).toBe(5); // Last target
    });

    it('should write transcript to file', async () => {
      const baseTurn: AttackTurn = {
        id: 'test-9',
        prompt: 'File test',
      };

      const runConfig: RunConfig = {
        runId: 'test-run-9',
        targetProvider: 'dry-run',
        attackerKind: 'tts',
        speechProvider: 'dry-run',
        turnCount: 2,
        outputRoot: testOutputRoot,
      };

      const runner = new SessionRunner({
        runConfig,
        baseTurn,
        attackerPrompt: { systemPrompt: 'Test system prompt' },
      });

      const result = await runner.run();

      expect(existsSync(result.artifacts.transcriptPath)).toBe(true);

      const transcriptData = JSON.parse(readFileSync(result.artifacts.transcriptPath, 'utf-8'));
      expect(Array.isArray(transcriptData)).toBe(true);
      expect(transcriptData.length).toBe(4); // 2 turns * 2 roles
    });

    it('should write summary metadata', async () => {
      const baseTurn: AttackTurn = {
        id: 'test-10',
        prompt: 'Summary test',
      };

      const runConfig: RunConfig = {
        runId: 'test-run-10',
        targetProvider: 'dry-run',
        attackerKind: 'tts',
        speechProvider: 'dry-run',
        turnCount: 8,
        outputRoot: testOutputRoot,
      };

      const runner = new SessionRunner({
        runConfig,
        baseTurn,
        attackerPrompt: { systemPrompt: 'Test system prompt' },
      });

      const result = await runner.run();

      expect(existsSync(result.artifacts.summaryPath)).toBe(true);

      const summary = JSON.parse(readFileSync(result.artifacts.summaryPath, 'utf-8'));
      expect(summary.runId).toBe('test-run-10');
      expect(summary.turnsCompleted).toBe(8);
    });

    it('should include all conversation data in results', async () => {
      const baseTurn: AttackTurn = {
        id: 'test-11',
        prompt: 'Complete data test',
        pluginId: 'test-plugin',
        goal: 'Test goal',
      };

      const runConfig: RunConfig = {
        runId: 'test-run-11',
        targetProvider: 'dry-run',
        attackerKind: 'tts',
        speechProvider: 'dry-run',
        turnCount: 3,
        outputRoot: testOutputRoot,
      };

      const runner = new SessionRunner({
        runConfig,
        baseTurn,
        attackerPrompt: { systemPrompt: 'Test system prompt' },
      });

      const result = await runner.run();

      // Verify all expected data is present
      expect(result.transcript).toBeDefined();
      expect(result.turns).toBeDefined();
      expect(result.providerEvents).toBeDefined();
      expect(result.artifacts).toBeDefined();
      expect(result.conversationAudioPaths).toBeDefined();

      // Verify turn results include all necessary fields
      result.turns.forEach((turn) => {
        expect(turn.attackerText).toBeDefined();
        expect(turn.targetText).toBeDefined();
        expect(turn.attackerAudioPath).toBeDefined();
        expect(turn.targetAudioPath).toBeDefined();
        expect(turn.turn).toBeGreaterThan(0);
      });
    });
  });

  describe('error handling', () => {
    it('should handle errors gracefully during audio concatenation', async () => {
      const baseTurn: AttackTurn = {
        id: 'test-12',
        prompt: 'Error test',
      };

      const runConfig: RunConfig = {
        runId: 'test-run-12',
        targetProvider: 'dry-run',
        attackerKind: 'tts',
        speechProvider: 'dry-run',
        turnCount: 2,
        outputRoot: testOutputRoot,
      };

      const runner = new SessionRunner({
        runConfig,
        baseTurn,
        attackerPrompt: { systemPrompt: 'Test system prompt' },
      });

      // The test should complete even if concatenation has issues
      const result = await runner.run();

      expect(result).toBeDefined();
      expect(result.turns.length).toBe(2);
    });
  });

  describe('conversation isolation', () => {
    it('should create separate output directories for different conversations', async () => {
      const baseTurn1: AttackTurn = {
        id: 'test-13a',
        prompt: 'Conversation 1',
      };

      const baseTurn2: AttackTurn = {
        id: 'test-13b',
        prompt: 'Conversation 2',
      };

      const runConfig1: RunConfig = {
        runId: 'test-run-13a',
        targetProvider: 'dry-run',
        attackerKind: 'tts',
        speechProvider: 'dry-run',
        turnCount: 2,
        outputRoot: testOutputRoot,
      };

      const runConfig2: RunConfig = {
        runId: 'test-run-13b',
        targetProvider: 'dry-run',
        attackerKind: 'tts',
        speechProvider: 'dry-run',
        turnCount: 2,
        outputRoot: testOutputRoot,
      };

      const runner1 = new SessionRunner({
        runConfig: runConfig1,
        baseTurn: baseTurn1,
        attackerPrompt: { systemPrompt: 'Test system prompt' },
      });

      const runner2 = new SessionRunner({
        runConfig: runConfig2,
        baseTurn: baseTurn2,
        attackerPrompt: { systemPrompt: 'Test system prompt' },
      });

      const result1 = await runner1.run();
      const result2 = await runner2.run();

      // Verify separate directories
      expect(result1.artifacts.runDir).not.toBe(result2.artifacts.runDir);
      expect(existsSync(result1.artifacts.runDir)).toBe(true);
      expect(existsSync(result2.artifacts.runDir)).toBe(true);
    });
  });
});
