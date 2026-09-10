import { parseChatPrompt } from '../shared';

export type LiveAudioFormat =
  | { type: 'audio/pcm'; rate: 16_000 | 24_000 }
  | { type: 'audio/pcmu' | 'audio/pcma'; rate: 8_000 };

export interface LiveInputMessage {
  type: 'message';
  role: 'developer' | 'user' | 'assistant';
  content: [{ type: 'input_text' | 'output_text'; text: string }];
}

function decodeAudio(data: unknown, encoding: unknown, format: LiveAudioFormat): Buffer {
  if (typeof data !== 'string' || !data || data.length > 20 * 1024 * 1024) {
    throw new Error('GPT-Live audio must contain nonempty base64 data.');
  }
  const bytes = Buffer.from(data, 'base64');
  if (bytes.toString('base64') !== data) {
    throw new Error('GPT-Live audio must contain valid base64 data.');
  }
  if (encoding === 'wav') {
    if (
      format.type !== 'audio/pcm' ||
      bytes.toString('ascii', 0, 4) !== 'RIFF' ||
      bytes.toString('ascii', 8, 12) !== 'WAVE'
    ) {
      throw new Error('GPT-Live WAV input must be mono PCM16 matching audio.format.');
    }
    let validFormat = false;
    const chunks: Buffer[] = [];
    for (let offset = 12; offset + 8 <= bytes.length; ) {
      const kind = bytes.toString('ascii', offset, offset + 4);
      const size = bytes.readUInt32LE(offset + 4);
      const start = offset + 8;
      if (start + size > bytes.length) {
        throw new Error('Truncated GPT-Live WAV input.');
      }
      if (kind === 'fmt ') {
        validFormat =
          size >= 16 &&
          bytes.readUInt16LE(start) === 1 &&
          bytes.readUInt16LE(start + 2) === 1 &&
          bytes.readUInt32LE(start + 4) === format.rate &&
          bytes.readUInt16LE(start + 14) === 16;
      } else if (kind === 'data') {
        chunks.push(bytes.subarray(start, start + size));
      }
      offset = start + size + (size % 2);
    }
    const pcm = Buffer.concat(chunks);
    if (!validFormat || !pcm.length || pcm.length % 2 !== 0) {
      throw new Error(
        'GPT-Live WAV input must be nonempty mono PCM16 at the configured sample rate. Resample the file before evaluating.',
      );
    }
    return pcm;
  }
  const expected =
    format.type === 'audio/pcm'
      ? 'pcm16'
      : format.type === 'audio/pcmu'
        ? 'g711_ulaw'
        : 'g711_alaw';
  if (
    encoding !== expected ||
    (format.type === 'audio/pcm' && bytes.length % 2 !== 0) ||
    bytes.toString('ascii', 0, 4) === 'RIFF'
  ) {
    throw new Error(
      `GPT-Live expects raw ${expected} audio matching audio.format, or a matching PCM16 WAV file.`,
    );
  }
  return bytes;
}

function prepareContent(
  content: unknown,
  allowAudio: boolean,
  format: LiveAudioFormat,
): { text: string[]; audio: Buffer } {
  const parts = typeof content === 'string' ? [{ type: 'text', text: content }] : content;
  if (!Array.isArray(parts) || parts.length === 0) {
    throw new Error('GPT-Live chat messages require text or input_audio content.');
  }
  const text: string[] = [];
  const audio: Buffer[] = [];
  for (const part of parts) {
    if (
      part &&
      ['text', 'input_text', 'output_text'].includes(part.type) &&
      typeof part.text === 'string'
    ) {
      text.push(part.text);
      continue;
    }
    if (part?.type !== 'input_audio' || !part.input_audio) {
      throw new Error(
        'GPT-Live accepts text and input_audio content; images and other content types are unsupported.',
      );
    }
    if (!allowAudio) {
      throw new Error(
        'GPT-Live audio is supported only in the final user message. Supply prior conversation as text.',
      );
    }
    audio.push(decodeAudio(part.input_audio.data, part.input_audio.format, format));
  }
  return { text, audio: Buffer.concat(audio) };
}

/** Keep user text in history and replay only the final user message's audio. */
export function prepareLiveInput(
  prompt: string,
  format: LiveAudioFormat,
): { input: LiveInputMessage[]; audio: Buffer } {
  const messages = parseChatPrompt<unknown>(prompt, [{ role: 'user', content: prompt }]);
  if (!Array.isArray(messages) || messages.length === 0 || !prompt.trim()) {
    throw new Error('GPT-Live expects a text prompt or a nonempty array of chat messages.');
  }
  const input: LiveInputMessage[] = [];
  const audio: Buffer[] = [];
  for (const [index, message] of messages.entries()) {
    if (!message || !['system', 'developer', 'user', 'assistant'].includes(message.role)) {
      throw new Error(
        'GPT-Live chat messages require a system, developer, user, or assistant role.',
      );
    }
    const role = message.role === 'system' ? 'developer' : message.role;
    const content = prepareContent(
      message.content,
      role === 'user' && index === messages.length - 1,
      format,
    );
    const { text } = content;
    audio.push(content.audio);
    if (text.length) {
      input.push({
        type: 'message',
        role,
        content: [
          { type: role === 'assistant' ? 'output_text' : 'input_text', text: text.join('\n') },
        ],
      });
    }
  }
  if (input.length > 128) {
    throw new Error('GPT-Live startup history supports at most 128 text messages.');
  }
  if (messages[messages.length - 1]?.role !== 'user') {
    throw new Error('GPT-Live eval prompts must end with a user message.');
  }
  return { input, audio: Buffer.concat(audio) };
}
