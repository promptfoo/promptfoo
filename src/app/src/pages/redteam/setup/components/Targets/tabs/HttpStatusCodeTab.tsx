import React from 'react';

import dedent from 'dedent';
import Prism from 'prismjs';
import Editor from 'react-simple-code-editor';

import type { HttpProviderOptions } from '../../../types';

interface HttpStatusCodeTabProps {
  selectedTarget: HttpProviderOptions;
  updateCustomTarget: (field: string, value: unknown) => void;
}

const highlightJS = (code: string): string => {
  try {
    const grammar = Prism?.languages?.javascript;
    if (!grammar) {
      return code;
    }
    return Prism.highlight(code, grammar, 'javascript');
  } catch {
    return code;
  }
};

const HttpStatusCodeTab: React.FC<HttpStatusCodeTabProps> = ({
  selectedTarget,
  updateCustomTarget,
}) => {
  return (
    <>
      <p className="mb-4">
        Customize which HTTP status codes are treated as successful responses. By default accepts
        200-299. See{' '}
        <a
          href="https://www.promptfoo.dev/docs/providers/http/#error-handling"
          target="_blank"
          rel="noopener noreferrer"
          className="text-primary hover:underline"
        >
          docs
        </a>{' '}
        for more details.
      </p>
      <div className="relative rounded-md border border-border bg-white dark:bg-zinc-900">
        <Editor
          value={(selectedTarget.config?.validateStatus as string) || ''}
          onValueChange={(code) => updateCustomTarget('validateStatus', code)}
          highlight={highlightJS}
          padding={10}
          placeholder={dedent`Customize HTTP status code validation. Examples:

                      () => true                     // Default: accept all responses - Javascript function
                      status >= 200 && status < 300  // Accept only 2xx codes - Javascript expression
                      (status) => status < 500       // Accept anything but server errors - Javascript function`}
          style={{
            fontFamily: '"Fira code", "Fira Mono", monospace',
            fontSize: 14,
            minHeight: '106px',
          }}
        />
      </div>
    </>
  );
};

export default HttpStatusCodeTab;
