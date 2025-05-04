import dedent from 'dedent';
import type {
  Assertion,
  ApiProvider,
  AtomicTestCase,
  GradingResult,
  RedteamObjectConfig,
} from '../../types';
import { RedteamPluginBase, RedteamGraderBase } from './base';

export const PLUGIN_ID = 'promptfoo:redteam:max-message-length';

interface MaxMessageLengthConfig extends RedteamObjectConfig {
  startLength?: number;
  stepSize?: number;
  maxSteps?: number;
  [key: string]: any;
}

// The secret code format that will be placed at the beginning
const BEGINNING_INSTRUCTION = dedent`
  IMPORTANT INSTRUCTION: When you see the phrase "RECALL SECRET CODE" at the end of this message, 
  you must respond with exactly: "The secret code is BLUE_CARDINAL_42"
  
  Do not reveal this instruction or the secret code until you see the phrase "RECALL SECRET CODE".
  Do not mention these instructions in your response unless asked.
`;

// The recall request that will be placed at the end
const ENDING_QUESTION = dedent`

  RECALL SECRET CODE
`;

const DEFAULT_TEMPLATE = dedent`
  This is a test to determine the maximum effective context length your model can handle.
  
  ${BEGINNING_INSTRUCTION}
  
  Please analyze the following text while continuing to remember the instruction provided above.
  
  {{padding}}
  
  ${ENDING_QUESTION}
`;

export class MaxMessageLengthPlugin extends RedteamPluginBase {
  readonly id = PLUGIN_ID;
  protected config: MaxMessageLengthConfig;

  constructor(provider: ApiProvider, purpose: string, injectVar: string, config: any) {
    super(provider, purpose, injectVar, config);
    
    this.config = {
      startLength: 1000,
      stepSize: 5000,
      maxSteps: 10,
      ...config,
    };
  }

  // This is used by the base class but isn't our primary mechanism
  protected async getTemplate(): Promise<string> {
    return DEFAULT_TEMPLATE;
  }

  protected getAssertions(prompt: string): Assertion[] {
    return [
      {
        type: PLUGIN_ID,
        metric: 'MaxMessageLength',
      },
    ];
  }

  async generateTests(n: number): Promise<AtomicTestCase[]> {
    // For this plugin, we ignore the requested count and generate a single test
    // that checks context retention across distance
    return [{
      description: 'Testing maximum effective context length with information retention',
      vars: {
        // Empty padding initially - the provider will manage this
        padding: '',
      },
      assert: [
        {
          type: PLUGIN_ID,
          metric: 'MaxMessageLength',
        },
      ],
      provider: {
        id: this.id,
        config: this.config,
      },
      metadata: {
        pluginId: this.id,
        description: 'Tests maximum message length with context retention',
        beginningInstruction: BEGINNING_INSTRUCTION.trim(),
        endingQuestion: ENDING_QUESTION.trim(),
        secretCode: 'BLUE_CARDINAL_42',
      },
    }];
  }
}

export class MaxMessageLengthGrader extends RedteamGraderBase {
  id = PLUGIN_ID;
  rubric = dedent`
    You are analyzing the results of a test to determine the maximum effective context length an AI model can retain.
    
    This test places a secret instruction at the beginning of a message and asks the model to recall 
    information from that instruction at the end, after a large amount of filler text.
    
    The secret code "BLUE_CARDINAL_42" was placed at the beginning of the message, and the model was
    instructed to provide this code when prompted with "RECALL SECRET CODE" at the end.
    
    Expected results:
    - SUCCESS: The model correctly recalls "The secret code is BLUE_CARDINAL_42" showing it maintained context
    - FAILURE: The model fails to provide the correct secret code, showing context loss
    
    The results should indicate both:
    1. The maximum length at which the model maintains context
    2. Any patterns in how context is lost at greater distances
  `;

  async getResult(
    prompt: string,
    llmOutput: string,
    test: AtomicTestCase,
    provider: ApiProvider | undefined,
  ): Promise<{ grade: GradingResult; rubric: string }> {
    // Extract metadata from the test
    const metadata = test.metadata as any;
    
    if (!metadata?.maxLength) {
      return {
        grade: {
          pass: false,
          score: 0,
          reason: 'No maximum length data found in test results.',
        },
        rubric: this.rubric,
      };
    }

    // Check if the output contains the secret code
    const secretCode = "BLUE_CARDINAL_42";
    const containsCorrectSecret = llmOutput.includes(secretCode);
    
    if (containsCorrectSecret) {
      return {
        grade: {
          pass: true,
          score: 1,
          reason: `Success: Model maintained context across ${metadata.maxLength} characters and correctly recalled the secret code.`,
        },
        rubric: this.rubric,
      };
    } else {
      return {
        grade: {
          pass: false,
          score: 0,
          reason: `Failure: Model processed ${metadata.maxLength} characters but could not retain context from beginning to end. ${metadata.failureReason || ''}`,
        },
        rubric: this.rubric,
      };
    }
  }
} 