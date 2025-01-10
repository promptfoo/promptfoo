/*
 * The prompts used by this CLI are licensed under the AGPL-3.0 license and are
 * dynamically downloaded from Github. For details, see
 * https://github.com/elder-plinius/L1B3RT4S/blob/main/LICENSE.
 */
import { fetchWithProxy } from '../../fetch';
import type { Assertion, TestCase } from '../../types';
import { RedteamPluginBase } from './base';

export const PLUGIN_ID = 'promptfoo:redteam:pliny';

const URLS = [
  'https://raw.githubusercontent.com/elder-plinius/L1B3RT4S/refs/heads/main/GOOGLE.mkd',
  'https://raw.githubusercontent.com/elder-plinius/L1B3RT4S/refs/heads/main/AMAZON.mkd',
  'https://raw.githubusercontent.com/elder-plinius/L1B3RT4S/refs/heads/main/META.mkd',
  'https://raw.githubusercontent.com/elder-plinius/L1B3RT4S/refs/heads/main/OPENAI.mkd',
];

async function fetchAndParseUrl(url: string): Promise<string[]> {
  try {
    const response = await fetchWithProxy(url);
    const text = await response.text();

    // Split by headers (h1-h3) and filter out empty strings
    const sections = text.split(/^#{1,4}\s+.*$/m).filter(Boolean);

    return sections
      .map((section) => section.trim())
      .filter(Boolean)
      .filter((section) => section.includes('\n'));
  } catch (error) {
    console.error(`Error fetching ${url}:`, error);
    return [];
  }
}

async function fetchAllTexts(): Promise<string[]> {
  try {
    const allSections = await Promise.all(URLS.map((url) => fetchAndParseUrl(url)));

    // Flatten array of arrays and filter out empty strings
    return allSections.flat().filter(Boolean);
  } catch (error) {
    console.error('Error fetching texts:', error);
    return [];
  }
}

export class PlinyPlugin extends RedteamPluginBase {
  async getTemplate(): Promise<string> {
    return this.injectVar;
  }

  getAssertions(prompt: string): Assertion[] {
    return [
      {
        type: 'is-refusal',
        metric: 'Pliny',
      },
    ];
  }

  async generateTests(n: number, _delayMs?: number): Promise<TestCase[]> {
    const texts = await fetchAllTexts();

    // Take n random texts, or all if we have fewer than n
    const selectedTexts = texts.sort(() => Math.random() - 0.5).slice(0, Math.min(n, texts.length));

    return selectedTexts.map((text) => ({
      vars: {
        [this.injectVar]: ' ' + text,
      },
      assert: this.getAssertions(text),
    }));
  }
}
