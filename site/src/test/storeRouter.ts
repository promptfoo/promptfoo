import { createRequire } from 'node:module';

// Docusaurus uses its own React Router version, separate from the web app.
const require = createRequire(import.meta.url);
const requireFromDocusaurus = createRequire(require.resolve('@docusaurus/core/package.json'));
export const router = requireFromDocusaurus('react-router-dom');
export const { createBrowserHistory } = requireFromDocusaurus('history');
