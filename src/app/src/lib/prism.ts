import Prism from 'prismjs';
import prismClikeSource from 'prismjs/components/prism-clike.min.js?raw';
import prismHttpSource from 'prismjs/components/prism-http.min.js?raw';
import prismJavascriptSource from 'prismjs/components/prism-javascript.min.js?raw';
import prismJsonSource from 'prismjs/components/prism-json.min.js?raw';
import prismYamlSource from 'prismjs/components/prism-yaml.min.js?raw';

type PrismRegistry = Set<string>;

const prismRegistryKey = '__PROMPTFOO_PRISM_LANGUAGES__';
const prismState = globalThis as typeof globalThis & {
  [prismRegistryKey]?: PrismRegistry;
};
const prismRegistry = (prismState[prismRegistryKey] ??= new Set<string>());

function registerPrismComponent(language: string, source: string) {
  if (prismRegistry.has(language)) {
    return;
  }

  // Prism language files expect a free `Prism` variable. Rolldown rewrites them
  // into ESM where that implicit global can disappear, so execute the original
  // source against the shared Prism instance explicitly.
  const register = new Function('Prism', source) as (prism: typeof Prism) => void;
  register(Prism);
  prismRegistry.add(language);
}

registerPrismComponent('clike', prismClikeSource);
registerPrismComponent('javascript', prismJavascriptSource);
registerPrismComponent('json', prismJsonSource);
registerPrismComponent('yaml', prismYamlSource);
registerPrismComponent('http', prismHttpSource);

export default Prism;
