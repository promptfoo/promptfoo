export type StyleLintSeverity = 'off' | 'warn' | 'error';

export type BorderRequiresColorRuleConfig = {
  severity: StyleLintSeverity;
};

export type StyleLintConfig = {
  include: string[];
  exclude: string[];
  classComposerFunctions: string[];
  maxDiagnostics: number;
  rules: {
    'border-requires-color': BorderRequiresColorRuleConfig;
  };
};

const config: StyleLintConfig = {
  include: ['src/app/src/**/*.{ts,tsx}'],
  exclude: ['**/*.test.ts', '**/*.test.tsx', '**/*.stories.tsx', '**/__tests__/**'],
  classComposerFunctions: ['cn', 'clsx', 'cva'],
  maxDiagnostics: 200,
  rules: {
    // Start as warn because this codemod introduces enforcement into an existing codebase.
    'border-requires-color': { severity: 'warn' },
  },
};

export default config;
