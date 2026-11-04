import { createRequire } from 'node:module';

import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const requireFromDocusaurus = createRequire(require.resolve('@docusaurus/core/package.json'));
const requireFromBundler = createRequire(requireFromDocusaurus.resolve('@docusaurus/bundler'));

describe.each(['copy-webpack-plugin', 'css-minimizer-webpack-plugin'])(
  '%s serialization',
  (plugin) => {
    // Resolve the serializer through the webpack plugin that Docusaurus actually loads.
    const requireFromPlugin = createRequire(requireFromBundler.resolve(plugin));
    const serialize = requireFromPlugin('serialize-javascript') as (value: unknown) => string;

    it('escapes script end tags after a misleading script prefix in function source', () => {
      const input = new Function(
        "return function f(x){ return x</script=+/ + '</script><img src=x onerror=alert(1)>' }",
      )();

      const serialized = serialize(input);

      expect(() => new Function(`return (${serialized});`)).not.toThrow();
      expect(serialized).not.toMatch(/<\/script[\t\n\f\r />]/i);
    });

    it('round-trips function and regular expression options', () => {
      const options = {
        transform: (value: string) => value.toUpperCase(),
        include: /\.css$/i,
      };

      const restored = new Function(`return (${serialize(options)});`)() as typeof options;

      expect(restored.transform('styles')).toBe('STYLES');
      expect(restored.include.test('styles.CSS')).toBe(true);
      expect(restored.include.test('styles.js')).toBe(false);
    });
  },
);
