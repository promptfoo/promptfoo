import { Fragment } from 'react';

import Prism from '@app/lib/prism';

function createHighlighter(language: 'javascript' | 'json') {
  return (code: string) => {
    try {
      const grammar = Prism?.languages?.[language];
      if (grammar) {
        return Prism.highlight(code, grammar, language);
      }
    } catch {
      // Fall back to literal text when highlighting is unavailable.
    }
    // The editor inserts string results as HTML. React children preserve literal
    // text without interpreting markup; the break matches its string rendering.
    return (
      <Fragment>
        {code}
        <br />
      </Fragment>
    );
  };
}

export const highlightJS = createHighlighter('javascript');
export const highlightJSON = createHighlighter('json');
