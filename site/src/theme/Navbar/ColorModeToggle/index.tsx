import React, { type ReactNode } from 'react';

import { useColorMode, useThemeConfig } from '@docusaurus/theme-common';
import useIsBrowser from '@docusaurus/useIsBrowser';
import { useIsDocsPage } from '@site/src/hooks/useIsDocsPage';
import clsx from 'clsx';
import styles from './styles.module.css';
import type { Props } from '@theme/Navbar/ColorModeToggle';

type ThemeChoice = 'system' | 'light' | 'dark';

function toThemeChoice(mode: 'light' | 'dark' | null): ThemeChoice {
  if (mode === null) {
    return 'system';
  }
  return mode;
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

  return (
    <div className={clsx(className, styles.wrapper)}>
      <span className={styles.label}>Theme</span>
      <select
        className={styles.select}
        value={toThemeChoice(colorModeChoice)}
        onChange={(event) => setColorMode(toColorMode(event.target.value as ThemeChoice))}
        disabled={!isBrowser}
        aria-label="Theme"
        title="Theme"
      >
        <option value="system">System</option>
        <option value="light">Light</option>
        <option value="dark">Dark</option>
      </select>
    </div>
  );
}
