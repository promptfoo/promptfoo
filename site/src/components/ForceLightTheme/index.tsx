import { useEffect } from 'react';

import { useColorMode } from '@docusaurus/theme-common';

export default function ForceLightTheme(): null {
  const { colorMode, setColorMode } = useColorMode();

  useEffect(() => {
    if (colorMode !== 'light') {
      setColorMode('light');
    }
  }, [colorMode, setColorMode]);

  return null;
}
