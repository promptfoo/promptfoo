import { DEFAULT_PORT } from '../constants';
import { BrowserBehavior, startServer } from './server';

// start server
startServer(Number.parseInt(process.env.API_PORT || DEFAULT_PORT.toString()), BrowserBehavior.SKIP);
