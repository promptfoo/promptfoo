import { useLayoutEffect, useState } from 'react';

export function useHeaderCollapse(stickyHeader: boolean): boolean | undefined {
  const [collapsed, setCollapsed] = useState<boolean>();

  useLayoutEffect(() => {
    if (!stickyHeader) {
      setCollapsed(false);
      return;
    }
    if (typeof CSS !== 'undefined' && CSS.supports?.('animation-timeline: scroll()')) {
      setCollapsed(undefined);
      return;
    }

    // The existing eased 50px animation switches its discrete values at 15px.
    const update = () => setCollapsed(stickyHeader && window.scrollY >= 15);
    update();

    window.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update);
    return () => {
      window.removeEventListener('scroll', update);
      window.removeEventListener('resize', update);
    };
  }, [stickyHeader]);

  return collapsed;
}
