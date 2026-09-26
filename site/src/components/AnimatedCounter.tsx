import React, { useEffect, useRef, useState } from 'react';

export default function AnimatedCounter({
  target,
  suffix = '',
  className,
}: {
  target: string;
  suffix?: string;
  className?: string;
}) {
  const elementRef = useRef<HTMLDivElement>(null);
  const [count, setCount] = useState(0);

  useEffect(() => {
    const element = elementRef.current;
    if (!element) {
      return;
    }

    const end = Number.parseInt(target.replace(/,/g, ''), 10);
    let frame: number | undefined;
    let started = false;
    let observer: IntersectionObserver | undefined;
    setCount(0);

    const start = () => {
      if (started) {
        return;
      }
      started = true;
      observer?.disconnect();
      if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        setCount(end);
        return;
      }

      let startTime: number | undefined;
      const animate = (timestamp: number) => {
        startTime ??= timestamp;
        const progress = Math.min((timestamp - startTime) / 3500, 1);
        // Large totals count linearly first, then ease through the final 333,
        // preserving the previous counter's two-stage animation.
        const ease = (value: number) => (value === 1 ? 1 : 1 - 2 ** (-10 * value));
        const value =
          end > 999
            ? progress < 0.5
              ? (end - 333) * progress * 2
              : end - 333 + 333 * ease(progress * 2 - 1)
            : end * ease(progress);
        setCount(Math.round(value));
        if (progress < 1) {
          frame = requestAnimationFrame(animate);
        }
      };
      frame = requestAnimationFrame(animate);
    };

    if (typeof IntersectionObserver === 'undefined') {
      start();
    } else {
      observer = new IntersectionObserver(
        (entries) => {
          if (entries.some((entry) => entry.isIntersecting)) {
            start();
          }
        },
        { threshold: 0.5 },
      );
      observer.observe(element);
    }

    return () => {
      observer?.disconnect();
      if (frame !== undefined) {
        cancelAnimationFrame(frame);
      }
    };
  }, [target]);

  return (
    <div ref={elementRef} className={className}>
      {count.toLocaleString('en-US')}
      {suffix}
    </div>
  );
}
