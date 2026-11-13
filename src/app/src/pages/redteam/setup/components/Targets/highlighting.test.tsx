import { TooltipProvider } from '@app/components/ui/tooltip';
import Prism from '@app/lib/prism';
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import CustomTargetConfiguration from './CustomTargetConfiguration';
import HttpStatusCodeTab from './tabs/HttpStatusCodeTab';

const grammars = {
  javascript: Prism.languages.javascript,
  json: Prism.languages.json,
};

afterEach(() => {
  cleanup();
  Object.assign(Prism.languages, grammars);
  vi.restoreAllMocks();
});

function renderEditor(language: keyof typeof grammars, code: string) {
  return render(
    <TooltipProvider>
      {language === 'javascript' ? (
        <HttpStatusCodeTab
          selectedTarget={{ id: 'http', config: { validateStatus: code } }}
          updateCustomTarget={vi.fn()}
        />
      ) : (
        <CustomTargetConfiguration
          selectedTarget={{ id: 'openinterpreter', config: {} }}
          providerType="openinterpreter"
          rawConfigJson={code}
          setRawConfigJson={vi.fn()}
          updateCustomTarget={vi.fn()}
          bodyError={null}
        />
      )}
    </TooltipProvider>,
  );
}

for (const language of ['javascript', 'json'] as const) {
  describe(`${language} target editor highlighting`, () => {
    for (const failure of ['missing grammar', 'highlight error'] as const) {
      it.each([
        '',
        '\n',
        'a & b < c > d\n\n',
        '<img data-editor-probe="inert" src="data:,">',
        '</pre><script type="text/plain" data-editor-probe="inert">literal</script>',
      ])(`preserves literal text and final line break after ${failure}: %j`, (code) => {
        if (failure === 'missing grammar') {
          delete Prism.languages[language];
        } else {
          vi.spyOn(Prism, 'highlight').mockImplementation(() => {
            throw new Error('Controlled highlighter failure');
          });
        }
        const { container } = renderEditor(language, code);
        const pre = container.querySelector('pre[aria-hidden="true"]')!;
        expect(pre.textContent).toBe(code);
        expect(pre.querySelector('img, script')).toBeNull();
        expect(pre.children).toHaveLength(1);
        expect(pre.lastElementChild?.tagName).toBe('BR');
        expect(container.querySelector('textarea')).toHaveValue(code);
      });
    }

    it('retains syntax tokens when the grammar is available', () => {
      const code = language === 'javascript' ? 'const answer = 42;' : '{"answer":42}';
      const { container } = renderEditor(language, code);
      const pre = container.querySelector('pre[aria-hidden="true"]')!;
      expect(pre.textContent).toBe(code);
      expect(pre.querySelector('.token')).not.toBeNull();
      expect(pre.lastElementChild?.tagName).toBe('BR');
      expect(container.querySelector('textarea')).toHaveValue(code);
    });
  });
}
