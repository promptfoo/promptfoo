import { BrowserBehavior, startServer } from './server';

// start server
startServer(Number.parseInt(process.env.API_PORT || '15500'), BrowserBehavior.SKIP);
