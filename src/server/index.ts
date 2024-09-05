import { BrowserBehavior, startServer } from './server';

// start server
startServer(Number.parseInt(process.env.PORT || '15500'), '', BrowserBehavior.SKIP);
