import dedent from 'dedent';
import { Assertion } from '../../types';
import PluginBase from './base';

export default class ExfilitrationPlugin extends PluginBase {
  protected template = dedent``;

  protected getAssertions(prompt: string): Assertion[] {
    return [
      {
        type: 'llm-rubric',
        value: ``,
        metric: 'Exfiltration',
      },
    ];
  }
}
