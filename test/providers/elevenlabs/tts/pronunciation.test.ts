import { XMLParser, XMLValidator } from 'fast-xml-parser';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ElevenLabsClient } from '../../../../src/providers/elevenlabs/client';
import { createPronunciationDictionary } from '../../../../src/providers/elevenlabs/tts/pronunciation';

afterEach(() => vi.restoreAllMocks());

describe('createPronunciationDictionary', () => {
  it('uploads a PLS lexicon with escaped aliases and per-rule phoneme alphabets', async () => {
    const post = vi
      .spyOn(ElevenLabsClient.prototype, 'post')
      .mockResolvedValue({ id: 'dict', version_id: 'v1', name: 'fixture' });
    await createPronunciationDictionary(new ElevenLabsClient({ apiKey: 'fixture' }), 'fixture', [
      { word: 'A&B <API>', pronunciation: 'A & B <ay pee eye>' },
      { word: 'hello', phoneme: 'həˈləʊ', alphabet: 'ipa' },
      { word: 'test', phoneme: 'T EH1 S T', alphabet: 'cmu' },
    ]);
    const [endpoint, form] = post.mock.calls[0];
    expect(endpoint).toBe('/pronunciation-dictionaries/add-from-file');
    const file = (form as FormData).get('file') as File;
    const xml = await file.text();
    expect(XMLValidator.validate(xml)).toBe(true);
    const lexicon = new XMLParser({ ignoreAttributes: false }).parse(xml).lexicon;
    expect(lexicon['@_xmlns']).toBe('http://www.w3.org/2005/01/pronunciation-lexicon');
    expect(lexicon.lexeme).toEqual([
      { grapheme: 'A&B <API>', alias: 'A & B <ay pee eye>' },
      { grapheme: 'hello', phoneme: { '#text': 'həˈləʊ', '@_alphabet': 'ipa' } },
      { grapheme: 'test', phoneme: { '#text': 'T EH1 S T', '@_alphabet': 'cmu-arpabet' } },
    ]);
  });
  it('rejects missing pronunciation before making a request', async () => {
    const post = vi.spyOn(ElevenLabsClient.prototype, 'post');
    await expect(
      createPronunciationDictionary(new ElevenLabsClient({ apiKey: 'fixture' }), 'fixture', [
        { word: 'API' },
      ]),
    ).rejects.toThrow('phoneme or pronunciation');
    expect(post).not.toHaveBeenCalled();
  });
});
