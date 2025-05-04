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

    // Extract the beginning part of the template (up to {{padding}})
    const promptStart = prompt.split('{{padding}}')[0];
    
    // Extract the ending part of the template (after {{padding}})
    const promptEnd = prompt.split('{{padding}}')[1];
    
    // Start with the initial message length
    let currentLength = this.startLength;
    let result = null;
    let resultMetadata = {};
    
    try {
      logger.info(`[MaxMessageLength] Starting context retention test with initial length ${currentLength}`);

      // Perform binary search to find the max message length with context retention
      let min = 0;
      let max = this.startLength * Math.pow(2, this.maxSteps);
      
      while (min <= max) {
        currentLength = Math.floor((min + max) / 2);
        
        // Generate padding of the target length (between start and end sections)
        // Use lorem ipsum style text that won't interfere with the test
        const padding = this.generateNeutralPadding(currentLength);
        
        // Assemble the full test message with the padding in the middle
        const testMessage = promptStart + padding + promptEnd;
        
        logger.info(`[MaxMessageLength] Testing context retention at: ${testMessage.length} characters`);
        
        try {
          // Call the original provider with the full message
          const response = await context.originalProvider.callApi(
            testMessage,
            context,
            options
          );
          
          // Check if the response contains the secret code 
          // (this will be handled more thoroughly in the grader)
          const containsSecretCode = response.output.includes("BLUE_CARDINAL_42");
          
          if (containsSecretCode) {
            // If the model retained context and mentioned the secret code, this is our new max
            this.maxSuccessfulLength = testMessage.length;
            result = response.output;
            resultMetadata = response.metadata || {};
            
            // Move to test a larger value
            min = currentLength + 1;
            
            logger.info(`[MaxMessageLength] Success at length ${testMessage.length}: Model retained context`);
          } else {
            // The model responded but didn't provide the secret code, indicating context loss
            max = currentLength - 1;
            this.failureLength = testMessage.length;
            this.lastError = "Context loss - model failed to recall the secret code";
            
            logger.info(`[MaxMessageLength] Context loss at length ${testMessage.length}: Model responded but didn't recall the secret code`);
          }
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
        output: result || `Test completed. Maximum effective context length: ${this.maxSuccessfulLength} characters.`,
        metadata: {
          ...resultMetadata,
          maxLength: this.maxSuccessfulLength,
          failureLength: this.failureLength || null,
          failureReason: this.lastError,
          iterations: this.currentStep,
          contextRetentionTest: true,
        },
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error(`[MaxMessageLength] Error: ${errorMessage}`);
      
      return {
        output: `Error during context retention testing: ${errorMessage}`,
        metadata: {
          error: errorMessage,
          maxLength: this.maxSuccessfulLength,
          failureLength: this.failureLength || null,
        },
      };
    }
  }
  
  /**
   * Generates neutral text padding that won't interfere with the context test
   */
  private generateNeutralPadding(length: number): string {
    // Create paragraphs of repeated neutral content to reach the target length
    const paragraph = "This is neutral filler text for testing context window size. It contains no special instructions or content that would interfere with the test. ";
    
    // Repeat the paragraph until we reach the desired length
    let padding = "";
    while (padding.length < length) {
      padding += paragraph;
    }
    
    // Trim to exact length
    return padding.substring(0, length);
  }
} 