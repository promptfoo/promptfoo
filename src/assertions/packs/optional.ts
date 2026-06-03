import { handleContainsHtml, handleIsHtml } from '../html';
import { handleContainsJson, handleIsJson } from '../json';
import { handleLevenshtein } from '../levenshtein';
import { handleRougeScore } from '../rouge';
import { handleContainsSql, handleIsSql } from '../sql';
import { handleIsXml } from '../xml';

import type { AssertionCapabilityPack } from '../registryTypes';

const handleMeteor = async (params: Parameters<typeof handleLevenshtein>[0]) => {
  try {
    const { handleMeteorAssertion } = await import('../meteor.js');
    return handleMeteorAssertion(params);
  } catch (error) {
    if (
      error instanceof Error &&
      (error.message.includes('Cannot find module') ||
        error.message.includes('natural" package is required'))
    ) {
      return {
        pass: false,
        score: 0,
        reason:
          'METEOR assertion requires the natural package. Please install it using: npm install natural@^8.1.0',
        assertion: params.assertion,
      };
    }
    throw error;
  }
};

export const optionalAssertionPack = {
  name: 'optional',
  handlers: {
    'contains-html': handleContainsHtml,
    'contains-json': handleContainsJson,
    'contains-sql': handleContainsSql,
    'contains-xml': handleIsXml,
    'is-html': handleIsHtml,
    'is-json': handleIsJson,
    'is-sql': handleIsSql,
    'is-xml': handleIsXml,
    levenshtein: handleLevenshtein,
    meteor: handleMeteor,
    'rouge-n': handleRougeScore,
  },
} satisfies AssertionCapabilityPack<
  Parameters<typeof handleLevenshtein>[0],
  Awaited<ReturnType<typeof handleLevenshtein>>
>;
