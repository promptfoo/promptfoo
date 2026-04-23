import React from 'react';

type ProviderProps = {
  children?: React.ReactNode;
};

export default function docusaurusDefault(value?: string) {
  if (typeof value === 'string') {
    return value;
  }

  return {
    siteConfig: {
      title: 'Promptfoo',
      tagline: 'Test site',
      url: 'https://www.promptfoo.dev',
    },
  };
}

export function HtmlClassNameProvider({ children }: ProviderProps): React.ReactElement {
  return <>{children}</>;
}

export function PageMetadata(): null {
  return null;
}

export const ThemeClassNames = {
  page: {
    blogListPage: 'blog-list-page',
  },
  wrapper: {
    blogPages: 'blog-pages',
  },
};

export function useBlogListPageStructuredData(): Record<string, never> {
  return {};
}

export function useColorMode() {
  return {
    colorMode: 'light',
    colorModeChoice: 'light',
    setColorMode: () => {},
  };
}

export function useDoc() {
  return {
    frontMatter: {},
    metadata: {},
    toc: [],
  };
}

export function useLocation() {
  return {
    pathname: '/',
  };
}

export function useThemeConfig() {
  return {
    colorMode: {
      disableSwitch: false,
    },
  };
}
