import React, { type ReactNode, useEffect, useState } from 'react';

import { useThemeConfig } from '@docusaurus/theme-common';
import {
  isVegasBannerLive,
  VEGAS_ANNOUNCEMENT_BAR_ID,
  VEGAS_BANNER_EXPIRY,
} from '@site/src/data/announcementBar';
import OriginalAnnouncementBar from '@theme-original/AnnouncementBar';

/**
 * `setTimeout` stores its delay in a signed 32-bit int; anything larger overflows and the
 * callback fires immediately. Longer waits must be split across multiple timers.
 */
const MAX_TIMEOUT_MS = 2 ** 31 - 1;

/**
 * Retires the time-limited Vegas announcement bar on the visitor's clock.
 *
 * `docusaurus.config.ts` picks the bar when the config is evaluated, which bakes the choice
 * into the static HTML. Since nothing rebuilds this site on a schedule, a deploy that goes
 * quiet before Aug 10 2026 would keep advertising two finished conferences indefinitely.
 * This wrapper is the safety net: it re-checks the same shared expiry against the browser
 * clock and drops the bar.
 *
 * Two constraints shape the implementation:
 *
 *  1. **No hydration mismatch.** The prerendered HTML was produced on a build host that has
 *     no idea what time it is on the visitor's machine, so the clock must not be read during
 *     render. `isExpired` therefore starts `false` on both the server and the client's first
 *     render — identical markup — and only flips inside an effect, which never runs on the
 *     server. (Same shape as `GitHubStars` and the homepage walkthrough.)
 *  2. **Only the Vegas bar expires.** Once the site is rebuilt after the expiry the config
 *     serves the evergreen bar, which has no end date. Keying off the configured bar id
 *     means this wrapper is inert for it, rather than hiding whatever bar happens to be
 *     configured.
 */
export default function AnnouncementBar(): ReactNode {
  const { announcementBar } = useThemeConfig();
  const isTimeLimitedBar = announcementBar?.id === VEGAS_ANNOUNCEMENT_BAR_ID;

  const [isExpired, setIsExpired] = useState(false);

  useEffect(() => {
    if (!isTimeLimitedBar) {
      return;
    }

    const now = Date.now();
    if (!isVegasBannerLive(now)) {
      setIsExpired(true);
      return;
    }

    // A tab left open across the expiry instant retires the bar where it stands.
    let timer: ReturnType<typeof setTimeout>;
    const scheduleExpiry = (msUntilExpiry: number) => {
      timer = setTimeout(
        () => {
          const remainingMs = VEGAS_BANNER_EXPIRY - Date.now();
          if (remainingMs > 0) {
            scheduleExpiry(remainingMs);
          } else {
            setIsExpired(true);
          }
        },
        Math.min(msUntilExpiry, MAX_TIMEOUT_MS),
      );
    };

    scheduleExpiry(VEGAS_BANNER_EXPIRY - now);
    return () => clearTimeout(timer);
  }, [isTimeLimitedBar]);

  if (isTimeLimitedBar && isExpired) {
    return null;
  }

  return <OriginalAnnouncementBar />;
}
