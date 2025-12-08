import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import logger from '../../logger';
import type { TestCase } from '../../types/index';
import { SessionRunner, loadAttackerPrompt } from './sessionRunner';
import { transcribeAudio } from './transcription';
import type { AttackTurn, RunConfig } from './types';

type NativeAudioConfig = {
  targetProvider?: string;
  attackerProvider?: string;
  attackerKind?: 'tts' | 'provider';
  turnCount?: number;
  targetPrompt?: string;
  attackerPromptPath?: string;
  pluginExamplesPath?: string;
  outputRoot?: string;
  speechProvider?: 'local-liquid' | 'openai' | 'dry-run';
};

export interface NativeAudioResult {
  tests: TestCase[];
  artifactsDir: string;
}

export const runNativeAudioPipeline = async ({
  tests,
  injectVar,
  voice,
}: {
  tests: TestCase[];
  injectVar: string;
  voice: NativeAudioConfig;
}): Promise<NativeAudioResult> => {
  const runId = randomBytes(6).toString('hex');
  const outputRoot = voice.outputRoot || 'voice-runs';
  const pluginExamples =
    voice.pluginExamplesPath && existsSync(voice.pluginExamplesPath)
      ? readFileSync(voice.pluginExamplesPath, 'utf-8')
      : undefined;

  const attackerPrompt = loadAttackerPrompt({
    targetPrompt: voice.targetPrompt,
    pluginExamples,
  });

  const turnCount = voice.turnCount || 12;
  const outputTestCases: TestCase[] = [];
  const allArtifactsDirs: string[] = [];

  // Run a separate conversation for each test
  for (let testIdx = 0; testIdx < tests.length; testIdx++) {
    const sourceTest = tests[testIdx];
    const basePrompt = String(sourceTest.vars?.[injectVar] ?? '');
    const pluginId = (sourceTest.metadata as any)?.pluginId;
    const conversationId = `${runId}-test-${testIdx + 1}`;

    logger.info({
      message: 'Starting voice conversation',
      conversationId,
      testIndex: testIdx + 1,
      totalTests: tests.length,
      turnCount,
    });

    // Create a single turn that will be repeated for the conversation
    const baseTurn: AttackTurn = {
      id: sourceTest.metadata?.id || `test-${testIdx + 1}`,
      prompt: basePrompt,
      pluginId,
      goal: sourceTest.metadata?.description,
    };

    const runConfig: RunConfig = {
      runId: conversationId,
      targetProvider: (voice.targetProvider as any) || 'openai-realtime',
      attackerProvider: (voice.attackerProvider as any) || (voice.targetProvider as any),
      attackerKind:
        voice.attackerKind ||
        (voice.speechProvider === 'local-liquid' ? 'tts' : ('provider' as const)),
      speechProvider: voice.speechProvider || 'openai',
      targetPrompt: voice.targetPrompt,
      targetVoice: (voice as any).targetVoice,
      attackerVoice: (voice as any).attackerVoice,
      attackerPromptPath: voice.attackerPromptPath ? resolve(voice.attackerPromptPath) : undefined,
      pluginExamplesPath: voice.pluginExamplesPath ? resolve(voice.pluginExamplesPath) : undefined,
      pluginId,
      turnCount,
      outputRoot: resolve(outputRoot),
    };

    const runner = new SessionRunner({
      runConfig,
      baseTurn,
      attackerPrompt,
    });

    let result;
    try {
      result = await runner.run();
    } catch (error) {
      logger.error({
        message: 'Voice conversation failed',
        error: error instanceof Error ? { message: error.message, stack: error.stack } : error,
        conversationId,
        testIndex: testIdx + 1,
      });
      // Continue with next test on error
      continue;
    }

    allArtifactsDirs.push(result.artifacts.runDir);

    // Process turn results
    const turnsWithTranscripts = [];
    const aggregatedTargetTexts: string[] = [];

    for (let idx = 0; idx < result.turns.length; idx += 1) {
      const turn = result.turns[idx];
      let targetText = turn.targetText || '';
      // Fallback transcription if the target didn't return text
      if (!targetText && turn.targetAudioPath) {
        const transcript = await transcribeAudio(turn.targetAudioPath);
        if (transcript) {
          targetText = transcript;
        }
      }
      if (targetText) {
        aggregatedTargetTexts.push(targetText);
      }
      turnsWithTranscripts.push({ ...turn, targetText });
    }

    const conversationTranscript = result.transcript.map((t) => `[${t.role}] ${t.text}`).join('\n');

    // Create a test case for this conversation
    const conversationTest: TestCase = {
      ...sourceTest,
      // Keep original vars including the base attack prompt
      vars: sourceTest.vars || {},
      // Output should be the target's responses, not the attack prompt
      providerOutput: aggregatedTargetTexts.join('\n\n'),
      metadata: {
        ...(sourceTest.metadata || {}),
        voice: {
          runId: conversationId,
          runDir: result.artifacts.runDir,
          turns: turnsWithTranscripts,
          transcript: conversationTranscript,
          aggregatedTargetText: aggregatedTargetTexts.join('\n\n'),
          conversationAttackerAudioPath: result.conversationAudioPaths?.attacker,
          conversationTargetAudioPath: result.conversationAudioPaths?.target,
          conversationInterleavedAudioPath: result.conversationAudioPaths?.interleaved,
          basePrompt,
          turnCount: result.turns.length,
        },
      },
    } as TestCase;

    outputTestCases.push(conversationTest);

    logger.info({
      message: 'Voice conversation complete',
      conversationId,
      testIndex: testIdx + 1,
      turnsCompleted: result.turns.length,
      artifactsDir: result.artifacts.runDir,
    });
  }

  logger.info({
    message: 'Native audio pipeline complete',
    runId,
    conversationsCompleted: outputTestCases.length,
    totalTests: tests.length,
  });

  // Return the first artifacts directory for backward compatibility
  return {
    tests: outputTestCases,
    artifactsDir: allArtifactsDirs[0] || '',
  };
};
