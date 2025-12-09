import type { Server as SocketIOServer } from 'socket.io';

// Global socket.io instance for emitting events from routes
let ioInstance: SocketIOServer | null = null;

/**
 * Get the global socket.io instance
 */
export function getSocketIO(): SocketIOServer | null {
  return ioInstance;
}

/**
 * Set the global socket.io instance
 */
export function setSocketIO(io: SocketIOServer): void {
  ioInstance = io;
}

/**
 * Emit job update to subscribed clients
 */
export function emitJobUpdate(jobId: string, event: string, data: unknown): void {
  if (ioInstance) {
    ioInstance.to(`job:${jobId}`).emit(event, data);
  }
}
