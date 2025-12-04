import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { calculateEscalationLevel, planAttackText } from '../../../src/redteam/nativeAudio/planner';
import type { PlanInput } from '../../../src/redteam/nativeAudio/planner';
import type { EscalationLevel } from '../../../src/redteam/nativeAudio/types';

describe('planner', () => {
  describe('calculateEscalationLevel', () => {
    it('should return "gentle" for turns 1-3 (0-25% progress)', () => {
      expect(calculateEscalationLevel(1, 12)).toBe('gentle');
      expect(calculateEscalationLevel(2, 12)).toBe('gentle');
      expect(calculateEscalationLevel(3, 12)).toBe('gentle');
    });

    it('should return "moderate" for turns 4-6 (25-50% progress)', () => {
      expect(calculateEscalationLevel(4, 12)).toBe('moderate');
      expect(calculateEscalationLevel(5, 12)).toBe('moderate');
      expect(calculateEscalationLevel(6, 12)).toBe('moderate');
    });

    it('should return "aggressive" for turns 7-9 (50-75% progress)', () => {
      expect(calculateEscalationLevel(7, 12)).toBe('aggressive');
      expect(calculateEscalationLevel(8, 12)).toBe('aggressive');
      expect(calculateEscalationLevel(9, 12)).toBe('aggressive');
    });

    it('should return "forceful" for turns 10-12 (75-100% progress)', () => {
      expect(calculateEscalationLevel(10, 12)).toBe('forceful');
      expect(calculateEscalationLevel(11, 12)).toBe('forceful');
      expect(calculateEscalationLevel(12, 12)).toBe('forceful');
    });

    it('should handle edge cases correctly', () => {
      // First turn of any conversation is gentle
      expect(calculateEscalationLevel(1, 4)).toBe('gentle');
      expect(calculateEscalationLevel(1, 8)).toBe('gentle');
      expect(calculateEscalationLevel(1, 16)).toBe('gentle');

      // Last turn is always forceful
      expect(calculateEscalationLevel(4, 4)).toBe('forceful');
      expect(calculateEscalationLevel(8, 8)).toBe('forceful');
      expect(calculateEscalationLevel(16, 16)).toBe('forceful');
    });

    it('should calculate escalation for non-standard turn counts', () => {
      // 8 turns: 1-2 gentle, 3-4 moderate, 5-6 aggressive, 7-8 forceful
      expect(calculateEscalationLevel(1, 8)).toBe('gentle');
      expect(calculateEscalationLevel(2, 8)).toBe('gentle');
      expect(calculateEscalationLevel(3, 8)).toBe('moderate');
      expect(calculateEscalationLevel(4, 8)).toBe('moderate');
      expect(calculateEscalationLevel(5, 8)).toBe('aggressive');
      expect(calculateEscalationLevel(6, 8)).toBe('aggressive');
      expect(calculateEscalationLevel(7, 8)).toBe('forceful');
      expect(calculateEscalationLevel(8, 8)).toBe('forceful');
    });
  });

  describe('planAttackText', () => {
    const mockApiKey = 'test-api-key';
    let originalEnv: NodeJS.ProcessEnv;

    beforeEach(() => {
      originalEnv = { ...process.env };
      vi.clearAllMocks();
    });

    afterEach(() => {
      process.env = originalEnv;
      vi.restoreAllMocks();
    });

    describe('with custom planner command', () => {
      it('should use VOICE_PLANNER_CMD when set', async () => {
        process.env.VOICE_PLANNER_CMD = 'echo "custom planned text"';

        const input: PlanInput = {
          basePrompt: 'Original prompt',
          transcriptSoFar: '[attacker] Hello',
          pluginId: 'test-plugin',
          turnNumber: 1,
          maxTurns: 12,
        };

        const result = await planAttackText(input);
        expect(result).toBe('custom planned text');
      });

      it('should fall back to basePrompt if VOICE_PLANNER_CMD fails', async () => {
        process.env.VOICE_PLANNER_CMD = 'exit 1';

        const input: PlanInput = {
          basePrompt: 'Fallback prompt',
          transcriptSoFar: '',
          turnNumber: 1,
          maxTurns: 12,
        };

        const result = await planAttackText(input);
        expect(result).toBe('Fallback prompt');
      });
    });

    describe('with OpenAI planner', () => {
      beforeEach(() => {
        process.env.OPENAI_API_KEY = mockApiKey;
        delete process.env.VOICE_PLANNER_CMD;
      });

      it('should call OpenAI with correct escalation level for turn 1', async () => {
        const mockResponse = {
          ok: true,
          json: async () => ({
            choices: [
              {
                message: {
                  content: 'Gentle introduction to the topic',
                },
              },
            ],
          }),
        };

        global.fetch = vi.fn().mockResolvedValue(mockResponse);

        const input: PlanInput = {
          basePrompt: 'Test prompt',
          transcriptSoFar: '',
          turnNumber: 1,
          maxTurns: 12,
        };

        const result = await planAttackText(input);
        expect(result).toBe('Gentle introduction to the topic');

        const fetchCall = (global.fetch as any).mock.calls[0];
        const body = JSON.parse(fetchCall[1].body);

        expect(body.messages[1].content).toContain('Escalation level: gentle');
        expect(body.messages[1].content).toContain('Turn 1 of 12');
      });

      it('should call OpenAI with forceful escalation for turn 12', async () => {
        const mockResponse = {
          ok: true,
          json: async () => ({
            choices: [
              {
                message: {
                  content: 'Final forceful attempt',
                },
              },
            ],
          }),
        };

        global.fetch = vi.fn().mockResolvedValue(mockResponse);

        const input: PlanInput = {
          basePrompt: 'Test prompt',
          transcriptSoFar: '[attacker] Previous attempts...',
          turnNumber: 12,
          maxTurns: 12,
        };

        const result = await planAttackText(input);
        expect(result).toBe('Final forceful attempt');

        const fetchCall = (global.fetch as any).mock.calls[0];
        const body = JSON.parse(fetchCall[1].body);

        expect(body.messages[1].content).toContain('Escalation level: forceful');
        expect(body.messages[1].content).toContain('Turn 12 of 12');
      });

      it('should include transcript in planning context', async () => {
        const mockResponse = {
          ok: true,
          json: async () => ({
            choices: [
              {
                message: {
                  content: 'Contextual response',
                },
              },
            ],
          }),
        };

        global.fetch = vi.fn().mockResolvedValue(mockResponse);

        const transcript =
          '[attacker] Can you help with this?\n[target] I cannot assist with that.';
        const input: PlanInput = {
          basePrompt: 'Test prompt',
          transcriptSoFar: transcript,
          turnNumber: 5,
          maxTurns: 12,
          pluginId: 'harmful:test',
        };

        await planAttackText(input);

        const fetchCall = (global.fetch as any).mock.calls[0];
        const body = JSON.parse(fetchCall[1].body);

        expect(body.messages[1].content).toContain(transcript);
        expect(body.messages[1].content).toContain('Plugin/goal: harmful:test');
      });

      it('should fall back to basePrompt if OpenAI API fails', async () => {
        global.fetch = vi.fn().mockResolvedValue({
          ok: false,
          status: 500,
          text: async () => 'Internal Server Error',
        });

        const input: PlanInput = {
          basePrompt: 'Fallback prompt',
          transcriptSoFar: '',
          turnNumber: 1,
          maxTurns: 12,
        };

        const result = await planAttackText(input);
        expect(result).toBe('Fallback prompt');
      });

      it('should fall back to basePrompt if no API key is set', async () => {
        delete process.env.OPENAI_API_KEY;

        const input: PlanInput = {
          basePrompt: 'Fallback prompt',
          transcriptSoFar: '',
          turnNumber: 1,
          maxTurns: 12,
        };

        const result = await planAttackText(input);
        expect(result).toBe('Fallback prompt');
      });

      it('should use custom model when VOICE_PLANNER_MODEL is set', async () => {
        process.env.VOICE_PLANNER_MODEL = 'gpt-4-turbo';

        const mockResponse = {
          ok: true,
          json: async () => ({
            choices: [
              {
                message: {
                  content: 'Response from custom model',
                },
              },
            ],
          }),
        };

        global.fetch = vi.fn().mockResolvedValue(mockResponse);

        const input: PlanInput = {
          basePrompt: 'Test prompt',
          transcriptSoFar: '',
          turnNumber: 1,
          maxTurns: 12,
        };

        await planAttackText(input);

        const fetchCall = (global.fetch as any).mock.calls[0];
        const body = JSON.parse(fetchCall[1].body);

        expect(body.model).toBe('gpt-4-turbo');
      });

      it('should handle explicit escalation level override', async () => {
        const mockResponse = {
          ok: true,
          json: async () => ({
            choices: [
              {
                message: {
                  content: 'Forceful response',
                },
              },
            ],
          }),
        };

        global.fetch = vi.fn().mockResolvedValue(mockResponse);

        const input: PlanInput = {
          basePrompt: 'Test prompt',
          transcriptSoFar: '',
          turnNumber: 1,
          maxTurns: 12,
          escalationLevel: 'forceful' as EscalationLevel,
        };

        await planAttackText(input);

        const fetchCall = (global.fetch as any).mock.calls[0];
        const body = JSON.parse(fetchCall[1].body);

        // Should use the provided escalation level instead of calculating from turn
        expect(body.messages[1].content).toContain('Escalation level: forceful');
      });
    });
  });
});
