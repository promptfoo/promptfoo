import inquirer from 'inquirer';
import { ApiProvider, ProviderResponse } from '../types';

export class ManualInputProvider implements ApiProvider {
  private config: { multiline?: boolean };

  constructor(options: { id?: string; config?: { multiline?: boolean } } = {}) {
    this.config = options.config || {};
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

    let output: string;

    if (this.config.multiline) {
      const { multilineOutput } = await inquirer.prompt([
        {
          type: 'editor',
          name: 'multilineOutput',
          message: 'Output:',
        },
      ]);
      output = multilineOutput;
    } else {
      const { singlelineOutput } = await inquirer.prompt([
        {
          type: 'input',
          name: 'singlelineOutput',
          message: 'Output:',
        },
      ]);
      output = singlelineOutput;
    }

    console.log('='.repeat(80));
    return {
      output,
    };
  }
}
