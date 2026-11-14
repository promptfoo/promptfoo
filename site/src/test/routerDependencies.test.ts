import { createRequire } from 'node:module';

import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const requireFromDocusaurus = createRequire(require.resolve('@docusaurus/core/package.json'));
// Exercise the same dependency resolution used by Docusaurus's broken-link checker.
const { matchRoutes } = requireFromDocusaurus('react-router-config');

describe('Docusaurus route matching', () => {
  const routes = [
    {
      path: '/docs',
      routes: [{ path: '/docs/:slug', exact: true }],
    },
  ];

  it('matches nested routes and extracts path parameters', () => {
    expect(matchRoutes(routes, '/docs/intro')).toEqual([
      {
        route: routes[0],
        match: { path: '/docs', url: '/docs', isExact: false, params: {} },
      },
      {
        route: routes[0].routes[0],
        match: {
          path: '/docs/:slug',
          url: '/docs/intro',
          isExact: true,
          params: { slug: 'intro' },
        },
      },
    ]);
  });

  it('does not match unknown routes or extra segments on exact routes', () => {
    expect(matchRoutes(routes, '/unknown')).toEqual([]);
    expect(matchRoutes(routes[0].routes, '/docs/intro/extra')).toEqual([]);
  });
});
