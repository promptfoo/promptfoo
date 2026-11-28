import editor from '@inquirer/editor';
import input from '@inquirer/input';
import { isCallerAbortError } from '../util/fetch/requestSignal';

import type {
  ApiProvider,
  CallApiContextParams,
  CallApiOptionsParams,
  ProviderResponse,
} from '../types/index';

interface ManualInputProviderOptions {
  id?: string;
  config?: {
    multiline?: boolean;
  };
}

export class ManualInputProvider implements ApiProvider {
  config: ManualInputProviderOptions['config'];

  constructor(options: ManualInputProviderOptions = {}) {
    this.config = options.config;
    this.id = () => options.id || 'manual-input';
  }

  id() {
    return 'promptfoo:manual-input';
  }

  async callApi(
    prompt: string,
    _context?: CallApiContextParams,
    options?: CallApiOptionsParams,
  ): Promise<ProviderResponse> {
    const signal = options?.abortSignal;
    signal?.throwIfAborted();
    console.log('='.repeat(80));
    console.log('Manual Input Provider');
    console.log('Prompt:');
    console.log('*'.repeat(40));
    console.log(prompt);
    console.log('*'.repeat(40));
    console.log('\nPlease enter the output:');
    try {
      const output = await (this.config?.multiline ? editor : input)(
        { message: 'Output:' },
        { signal },
      );
      console.log('='.repeat(80));
      return { output };
    } catch (error) {
      // Inquirer wraps the abort reason. Preserve it for evaluation pause handling.
      if (isCallerAbortError(error, signal, { requireReasonMatch: true })) {
        signal?.throwIfAborted();
      }
      throw error;
    }
  }
}
