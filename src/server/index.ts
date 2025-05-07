import { getDefaultPort } from '../constants';
import { BrowserBehavior } from '../util/server';
import { startServer } from './server';

// start server
startServer(getDefaultPort(), BrowserBehavior.SKIP);
