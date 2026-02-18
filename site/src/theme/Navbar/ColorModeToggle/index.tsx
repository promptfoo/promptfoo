import React, { type ReactNode } from 'react';

import { useColorMode, useThemeConfig } from '@docusaurus/theme-common';
import useIsBrowser from '@docusaurus/useIsBrowser';
import { useIsDocsPage } from '@site/src/hooks/useIsDocsPage';
import clsx from 'clsx';
import styles from './styles.module.css';
import type { Props } from '@theme/Navbar/ColorModeToggle';

type ThemeChoice = 'light' | 'system' | 'dark';

const cycle: ThemeChoice[] = ['light', 'system', 'dark'];

const labels: Record<ThemeChoice, string> = {
  light: 'Light theme',
  system: 'System theme',
  dark: 'Dark theme',
};

function SunIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="12" cy="12" r="5" />
      <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
    </svg>
  );
}

function MonitorIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="2" y="3" width="20" height="14" rx="2" />
      <path d="M8 21h8M12 17v4" />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
    </svg>
  );
}

const iconComponents: Record<ThemeChoice, () => ReactNode> = {
  light: SunIcon,
  system: MonitorIcon,
  dark: MoonIcon,
};

function toThemeChoice(mode: 'light' | 'dark' | null): ThemeChoice {
  return mode ?? 'system';
}

function toColorMode(choice: ThemeChoice): 'light' | 'dark' | null {
  return choice === 'system' ? null : choice;
}

export default function NavbarColorModeToggle({ className }: Props): ReactNode {
  const isBrowser = useIsBrowser();
  const { disableSwitch } = useThemeConfig().colorMode;
  const { colorModeChoice, setColorMode } = useColorMode();
  const isDocsPage = useIsDocsPage();

  if (disableSwitch || !isDocsPage) {
    return null;
  }

  const current = toThemeChoice(colorModeChoice);
  const next = cycle[(cycle.indexOf(current) + 1) % cycle.length]!;
  const Icon = iconComponents[current];

  return (
    <button
      type="button"
      className={clsx(className, styles.button)}
      aria-label={`${labels[current]} — click for ${labels[next].toLowerCase()}`}
      title={labels[current]}
      disabled={!isBrowser}
      onClick={() => setColorMode(toColorMode(next))}
    >
      <Icon />
    </button>
  );
}
