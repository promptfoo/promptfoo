import { pathToFileURL } from 'node:url';
import { parseGeneratedPrompts } from '../../src/redteam/plugins/multiInputFormat';
import { DEFAULT_EXAMPLES as SHELL_INJECTION_EXAMPLES } from '../../src/redteam/plugins/shellInjection';

type ParsedPromptDrift = {
  currentPrompt: string;
  index: number;
  legacyPrompt: string;
};

function parseGeneratedPromptsLegacy(generatedPrompts: string): string[] {
  return generatedPrompts
    .split(/[\n;]+/)
    .filter((line) => /prompt\s*:/i.test(line))
    .map((line) => line.replace(/^.*?prompt\s*:/i, '').trim());
}

function auditPromptBlock(generatedPrompts: string) {
  const currentPrompts = parseGeneratedPrompts(generatedPrompts).map((prompt) => prompt.__prompt);
  const legacyPrompts = parseGeneratedPromptsLegacy(generatedPrompts);
  const changedPrompts: ParsedPromptDrift[] = currentPrompts.flatMap((currentPrompt, index) => {
    const legacyPrompt = legacyPrompts[index];
    if (legacyPrompt === currentPrompt) {
      return [];
    }
    return [
      {
        currentPrompt,
        index,
        legacyPrompt,
      },
    ];
  });

  return {
    changedPromptCount: changedPrompts.length,
    changedPrompts,
    currentPromptCount: currentPrompts.length,
    legacyPromptCount: legacyPrompts.length,
  };
}

async function main() {
  console.log(
    JSON.stringify(
      {
        shellInjection: auditPromptBlock(SHELL_INJECTION_EXAMPLES),
      },
      null,
      2,
    ),
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
