import { getDefaultPort } from '../constants';
import { BrowserBehavior } from '../types/browser';
import { startServer } from './server';

// start server
startServer(getDefaultPort(), BrowserBehavior.SKIP);
