import dedent from 'dedent';
import { v4 as uuidv4 } from 'uuid';
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

// Message template that places a unique fact at the beginning and asks for it at the end
const DEFAULT_TEMPLATE = dedent`
  This is a test to determine the maximum effective context length your model can handle.
  
  IMPORTANT FACT: The unique identifier for this conversation is: {{uniqueId}}
  
  Please analyze the following text and remember the unique identifier mentioned above.
  
  {{padding}}
  
  Without looking back, what is the unique identifier for this conversation that was mentioned at the beginning?
`;

export class MaxMessageLengthPlugin extends RedteamPluginBase {
  readonly id = PLUGIN_ID;
  protected config: MaxMessageLengthConfig;
  private uniqueId: string;

  constructor(provider: ApiProvider, purpose: string, injectVar: string, config: any) {
    super(provider, purpose, injectVar, config);
    
    this.config = {
      startLength: 1000,
      stepSize: 5000,
      maxSteps: 10,
      ...config,
    };
    
    // Generate a unique ID for this test run
    this.uniqueId = config.uniqueId || uuidv4().substring(0, 8);
  }

  // Generate template with the unique ID
  protected async getTemplate(): Promise<string> {
    return DEFAULT_TEMPLATE.replace('{{uniqueId}}', this.uniqueId);
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
    // Single test with the unique ID
    return [{
      description: 'Testing maximum effective context length with information retention',
      vars: {
        // Empty padding initially - the provider will manage this
        padding: '',
        uniqueId: this.uniqueId,
      },
      assert: [
        {
          type: PLUGIN_ID,
          metric: 'MaxMessageLength',
        },
      ],
      provider: {
        id: this.id,
        config: {
          ...this.config,
          uniqueId: this.uniqueId,
        },
      },
      metadata: {
        pluginId: this.id,
        description: 'Tests maximum context length with information retention',
        uniqueId: this.uniqueId,
      },
    }];
  }
}

export class MaxMessageLengthGrader extends RedteamGraderBase {
  id = PLUGIN_ID;
  rubric = dedent`
    You are analyzing the results of a test to determine the maximum effective context length an AI model can retain.
    
    This test places a unique identifier at the beginning of a message and asks the model to recall 
    it at the end, after a large amount of filler text.
    
    Expected results:
    - SUCCESS: The model correctly recalls the unique identifier showing it maintained context
    - FAILURE: The model fails to provide the correct identifier, showing context loss
  `;

  async getResult(
    prompt: string,
    llmOutput: string,
    test: AtomicTestCase,
    provider: ApiProvider | undefined,
  ): Promise<{ grade: GradingResult; rubric: string }> {
    // Extract metadata from the test response
    const metadata = test.metadata as any;
    const uniqueId = metadata?.uniqueId;
    
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

    if (!uniqueId) {
      return {
        grade: {
          pass: false,
          score: 0,
          reason: 'No unique identifier found in test metadata.',
        },
        rubric: this.rubric,
      };
    }

    // Check if the output contains the unique ID
    const containsUniqueId = llmOutput.includes(uniqueId);
    
    if (containsUniqueId) {
      return {
        grade: {
          pass: true,
          score: 1,
          reason: `Success: Model maintained context across ${metadata.maxLength} characters and correctly recalled the unique identifier "${uniqueId}".`,
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