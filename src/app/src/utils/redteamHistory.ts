import type { Message } from '@app/pages/eval/components/ChatMessages';

interface RedteamHistoryEntry {
  prompt?: string;
  promptAudio?: { data?: string; format?: string };
  promptImage?: { data?: string; format?: string };
  output?: string;
  outputAudio?: { data?: string; format?: string };
  outputImage?: { data?: string; format?: string };
}

export function getRedteamHistoryMessages(
  metadata: Record<string, unknown> | undefined,
): Message[] {
  const redteamHistoryRaw = (metadata?.redteamHistory || metadata?.redteamTreeHistory || []) as
    | RedteamHistoryEntry[]
    | unknown[];
  return (Array.isArray(redteamHistoryRaw) ? redteamHistoryRaw : [])
    .filter((entry): entry is RedteamHistoryEntry => {
      const e = entry as RedteamHistoryEntry;
      return Boolean(e?.prompt && e?.output);
    })
    .flatMap((entry: RedteamHistoryEntry) => [
      {
        role: 'user' as const,
        content: entry.prompt!,
        audio: entry.promptAudio,
        image: entry.promptImage,
      },
      {
        role: 'assistant' as const,
        content: entry.output!,
        audio: entry.outputAudio,
        image: entry.outputImage,
      },
    ]);
}
