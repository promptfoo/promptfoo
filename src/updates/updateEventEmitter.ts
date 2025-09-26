import { EventEmitter } from 'node:events';

/**
 * A shared event emitter for application-wide communication
 * between decoupled parts of the CLI.
 */
export const updateEventEmitter = new EventEmitter();
