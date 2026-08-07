/**
 * The announcement-bar identities and the instant the Vegas bar retires.
 *
 * Two different runtimes import this file, so it has to stay dependency-free:
 *
 *   - `site/docusaurus.config.ts` is loaded by jiti in Node and picks which bar gets baked
 *     into the prerendered HTML at build time;
 *   - `site/src/theme/AnnouncementBar` is bundled by webpack and retires the Vegas bar on
 *     the visitor's clock, so a deploy that goes quiet before the expiry cannot keep
 *     advertising a finished conference.
 *
 * No imports, no `@site/...` aliases, no CSS, no browser or Node globals: anything only one
 * of those two loaders can resolve breaks the other. A plain constant and a pure helper.
 */

/**
 * Id of the time-limited Black Hat / DEF CON bar. This is the only bar that ever expires,
 * and the client-side wrapper keys off it so the evergreen fallback is never hidden.
 */
export const VEGAS_ANNOUNCEMENT_BAR_ID = 'vegas-2026';

/** Id of the evergreen fallback bar, which has no expiry. */
export const EVERGREEN_ANNOUNCEMENT_BAR_ID = 'events-evergreen';

/**
 * Close of the final DEF CON booth day, Aug 9 2026 at 4:00 p.m. PDT.
 *
 * Offset-qualified on purpose: it has to mean the same instant on a UTC build host and in
 * a browser in any timezone.
 */
const VEGAS_BANNER_EXPIRY_ISO = '2026-08-09T16:00:00-07:00';

/** `VEGAS_BANNER_EXPIRY_ISO` in epoch milliseconds. */
export const VEGAS_BANNER_EXPIRY = Date.parse(VEGAS_BANNER_EXPIRY_ISO);

/**
 * Pure by design: `now` is always supplied by the caller — the frozen build timestamp on
 * the Node side, the live clock inside a post-hydration effect on the client — so neither
 * side can accidentally read a "now" it did not mean to read.
 */
export function isVegasBannerLive(now: number): boolean {
  return now < VEGAS_BANNER_EXPIRY;
}
