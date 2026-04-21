import * as React from 'react';

import { cn } from '@app/lib/utils';

interface CodeProps extends React.ComponentProps<'pre'> {}

function Code({ children, className, ...props }: CodeProps) {
  return (
    <pre
      className={cn('p-2 mb-2 rounded bg-muted font-mono text-sm overflow-x-auto', className)}
      {...props}
    >
      {children}
    </pre>
  );
}

export { Code };
