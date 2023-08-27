// Behavior varies depending on whether the app is running locally or not (e.g. connecting to local socket).
export const IS_RUNNING_LOCALLY = window.location.hostname === `localhost`;

// The base URL of the separate API server, used locally.
export const API_BASE_URL = `http://localhost:15500`;

// The base URL of API routes built into the Next.js app.
export const NEXTJS_BASE_URL = ``;
