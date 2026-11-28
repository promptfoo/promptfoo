import { createRequire } from 'node:module';

// Docusaurus uses its own React Router version, separate from the web app.
const require = createRequire(import.meta.url);
const requireFromDocusaurus = createRequire(require.resolve('@docusaurus/core/package.json'));
export const routerPath = requireFromDocusaurus.resolve('react-router-dom');
export const router = require(routerPath);
export const { BrowserRouter } = router;
export const { createBrowserHistory } = requireFromDocusaurus('history');
