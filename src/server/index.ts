import { DEFAULT_PORT } from '../constants';
import { BrowserBehavior, startServer } from './server';

// start server
startServer(DEFAULT_PORT, BrowserBehavior.SKIP);
