import React, { useEffect, useState } from 'react';

import { SITE_CONSTANTS } from '../../constants';
import styles from './styles.module.css';

const CACHE_KEY = 'github_stars_cache_promptfoo';
const CACHE_DURATION = 1000 * 60 * 60 * 24; // 1 day
const FETCH_TIMEOUT = 5000; // 5 seconds

interface CachedData {
  stars: string;
  timestamp: number;
}

function formatStarCount(count: number): string {
  if (count < 1000) {
    return count.toString();
  }

  const formatted = (count / 1000).toFixed(1);
  const trimmed = formatted.endsWith('.0') ? formatted.slice(0, -2) : formatted;
  return `${trimmed}k`;
}

function getCachedStars(): string | null {
  try {
    const cached = localStorage.getItem(CACHE_KEY);
    if (cached) {
      const data: CachedData = JSON.parse(cached);
      if (Date.now() - data.timestamp < CACHE_DURATION) {
        return data.stars;
      }
    }
  } catch {
    // Ignore localStorage errors
  }
  return null;
}

function setCachedStars(stars: string): void {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ stars, timestamp: Date.now() }));
  } catch {
    // Ignore localStorage errors
  }
}

export default function GitHubStars(): React.ReactElement {
  const [stars, setStars] = useState<string>(
    () => getCachedStars() || SITE_CONSTANTS.GITHUB_STARS_DISPLAY,
  );

  useEffect(() => {
    // Skip fetch if we have cached data
    if (getCachedStars()) {
      return;
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT);

    fetch('https://api.github.com/repos/promptfoo/promptfoo', {
      signal: controller.signal,
    })
      .then((res) => res.json())
      .then((data) => {
        if (typeof data.stargazers_count === 'number') {
          const formatted = formatStarCount(data.stargazers_count);
          setStars(formatted);
          setCachedStars(formatted);
        }
      })
      .catch((error) => {
        if (error.name !== 'AbortError') {
          console.error('Error fetching GitHub stars:', error);
        }
      })
      .finally(() => clearTimeout(timeoutId));

    return () => {
      clearTimeout(timeoutId);
      controller.abort();
    };
  }, []);

  return (
    <a
      href="https://github.com/promptfoo/promptfoo"
      target="_blank"
      rel="noopener noreferrer"
      className={styles.githubStars}
      aria-label={`${stars} stars on GitHub`}
    >
      <svg
        viewBox="0 0 24 24"
        xmlns="http://www.w3.org/2000/svg"
        className={styles.githubIcon}
        aria-hidden="true"
      >
        <path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12" />
      </svg>
      <span className={styles.starCount}>{stars}</span>
    </a>
  );
}
