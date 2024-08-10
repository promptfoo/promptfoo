import editor from '@inquirer/editor';
import input from '@inquirer/input';
import type { ApiProvider, ProviderResponse } from '../types';

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

  async callApi(prompt: string): Promise<ProviderResponse> {
    console.log('='.repeat(80));
    console.log('Manual Input Provider');
    console.log('Prompt:');
    console.log('*'.repeat(40));
    console.log(prompt);
    console.log('*'.repeat(40));
    console.log('\nPlease enter the output:');
    const output: string = await (this.config?.multiline ? editor : input)({ message: 'Output:' });
    console.log('='.repeat(80));
    return {
      output,
    };
  }
}
