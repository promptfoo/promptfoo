/**
 * Layout constants for the redteam setup page.
 *
 * These are extracted to a separate file to avoid circular dependencies between:
 * - page.tsx (defines the layout)
 * - PageWrapper.tsx (needs SIDEBAR_WIDTH for positioning)
 *
 * Both modules now import from this constants file instead of each other.
 */

export const SIDEBAR_WIDTH = 240;
export const NAVBAR_HEIGHT = 64;
