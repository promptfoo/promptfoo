import logger from '../../logger';
import type { 
  ApiProvider, 
  CallApiContextParams, 
  CallApiOptionsParams,
  ProviderResponse 
} from '../../types';

export class MaxMessageLengthProvider implements ApiProvider {
  private startLength: number;
  private stepSize: number;
  private maxSteps: number;
  private currentStep: number = 0;
  private maxSuccessfulLength: number = 0;
  private lastError: string | null = null;
  private failureLength: number = 0;

  constructor(public config: any) {
    logger.debug(`[MaxMessageLength] Initialized with config: ${JSON.stringify(config)}`);
    
    this.startLength = config?.startLength || 1000;
    this.stepSize = config?.stepSize || 5000;
    this.maxSteps = config?.maxSteps || 10;
  }

  id(): string {
    return 'max-message-length';
  }

  async callApi(
    prompt: string,
    context?: CallApiContextParams,
    options?: CallApiOptionsParams,
  ): Promise<ProviderResponse> {
    if (!context?.originalProvider) {
      throw new Error('Expected originalProvider to be set');
    }

    // Start with the initial message length
    let currentLength = this.startLength;
    let result = null;
    let resultMetadata = {};
    
    try {
      logger.info(`[MaxMessageLength] Starting test with initial length ${currentLength}`);

      // Perform binary search to find the max message length
      let min = 0;
      let max = this.startLength * Math.pow(2, this.maxSteps);
      
      while (min <= max) {
        currentLength = Math.floor((min + max) / 2);
        
        // Generate a message of the target length
        const paddingLength = Math.max(0, currentLength - prompt.length);
        const padding = 'X'.repeat(paddingLength);
        const testMessage = prompt.replace('{{padding}}', padding);
        
        logger.info(`[MaxMessageLength] Testing length: ${testMessage.length} characters`);
        
        try {
          // Call the original provider with the padded message
          const response = await context.originalProvider.callApi(
            testMessage,
            context,
            options
          );
          
          // If successful, this is our new max successful length
          this.maxSuccessfulLength = testMessage.length;
          result = response.output;
          resultMetadata = response.metadata || {};
          
          // Move to test a larger value
          min = currentLength + 1;
          
          logger.info(`[MaxMessageLength] Success at length ${testMessage.length}`);
        } catch (error) {
          // If we get an error, record it and try a smaller value
          max = currentLength - 1;
          this.failureLength = testMessage.length;
          this.lastError = error instanceof Error ? error.message : String(error);
          
          logger.info(`[MaxMessageLength] Failure at length ${testMessage.length}: ${this.lastError}`);
        }
        
        // Limit iterations to avoid excessive API calls
        this.currentStep++;
        if (this.currentStep >= this.maxSteps) {
          logger.info(`[MaxMessageLength] Reached max iterations (${this.maxSteps}), stopping`);
          break;
        }
      }
      
      // Return the results with metadata
      return {
        output: result || `Test completed. Maximum message length: ${this.maxSuccessfulLength} characters.`,
        metadata: {
          ...resultMetadata,
          maxLength: this.maxSuccessfulLength,
          failureLength: this.failureLength || null,
          failureReason: this.lastError,
          iterations: this.currentStep,
        },
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error(`[MaxMessageLength] Error: ${errorMessage}`);
      
      return {
        output: `Error during message length testing: ${errorMessage}`,
        metadata: {
          error: errorMessage,
          maxLength: this.maxSuccessfulLength,
          failureLength: this.failureLength || null,
        },
      };
    }
  }
} 