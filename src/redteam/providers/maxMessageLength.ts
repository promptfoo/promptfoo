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
  private uniqueId: string;

  constructor(public config: any) {
    logger.debug(`[MaxMessageLength] Initialized with config: ${JSON.stringify(config)}`);
    
    this.startLength = config?.startLength || 1000;
    this.stepSize = config?.stepSize || 5000;
    this.maxSteps = config?.maxSteps || 10;
    this.uniqueId = config?.uniqueId || '';
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
    
    try {
      logger.info(`[MaxMessageLength] Starting context retention test with uniqueId: ${this.uniqueId}`);

      // Use binary search to find the maximum context retention distance
      let min = 0;
      let max = this.startLength * Math.pow(2, this.maxSteps);
      let lastOutput = "";
      
      while (min <= max && this.currentStep < this.maxSteps) {
        const currentLength = Math.floor((min + max) / 2);
        
        // Simple repeating padding - no need for complicated text
        const padding = '.'.repeat(currentLength);
        
        // Assemble the test message
        const testMessage = promptStart + padding + promptEnd;
        
        logger.info(`[MaxMessageLength] Testing length: ${testMessage.length} characters (step ${this.currentStep + 1}/${this.maxSteps})`);
        
        try {
          // Call the original provider
          const response = await context.originalProvider.callApi(
            testMessage,
            context,
            options
          );
          
          // Store this output for returning later
          lastOutput = response.output;
          
          // Check if the response contains the unique ID
          const containsUniqueId = response.output.includes(this.uniqueId);
          
          if (containsUniqueId) {
            // Context retained - try a larger size
            this.maxSuccessfulLength = testMessage.length;
            min = currentLength + 1;
            logger.info(`[MaxMessageLength] Context retained at ${testMessage.length} characters - found uniqueId`);
          } else {
            // Context lost - try a smaller size
            max = currentLength - 1;
            this.failureLength = testMessage.length;
            this.lastError = "Model processed the message but lost context - couldn't recall uniqueId";
            logger.info(`[MaxMessageLength] Context lost at ${testMessage.length} characters - couldn't find uniqueId`);
          }
        } catch (error) {
          // Error processing the message - try a smaller size
          max = currentLength - 1;
          this.failureLength = testMessage.length;
          this.lastError = error instanceof Error ? error.message : String(error);
          logger.info(`[MaxMessageLength] Error at ${testMessage.length} characters: ${this.lastError}`);
        }
        
        this.currentStep++;
      }
      
      // Return the final output with comprehensive metadata for the grader
      return {
        output: lastOutput || `Test completed with maximum context length ${this.maxSuccessfulLength} characters.`,
        metadata: {
          maxLength: this.maxSuccessfulLength,
          failureLength: this.failureLength || null,
          failureReason: this.lastError,
          iterations: this.currentStep,
          uniqueId: this.uniqueId,
        },
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error(`[MaxMessageLength] Error: ${errorMessage}`);
      
      return {
        output: `Error during context testing: ${errorMessage}`,
        metadata: {
          error: errorMessage,
          maxLength: this.maxSuccessfulLength,
          failureLength: this.failureLength || null,
          uniqueId: this.uniqueId,
        },
      };
    }
  }
} 