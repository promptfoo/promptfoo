import { DEFAULT_PORT } from '../constants';
import { BrowserBehavior } from '../util/server';
import { startServer } from './server';

// start server
startServer(DEFAULT_PORT, BrowserBehavior.SKIP);
