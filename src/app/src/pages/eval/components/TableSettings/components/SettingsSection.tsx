import React from 'react';

import { cn } from '@app/lib/utils';

interface SettingsSectionProps {
  title: string;
  icon?: React.ReactElement | null;
  children: React.ReactNode;
  description?: string;
}

const SettingsSection = ({ title, children, icon, description }: SettingsSectionProps) => {
  const sectionId = `section-${title.replace(/\s+/g, '-').toLowerCase()}`;

  return (
    <section className="mb-6 relative" aria-labelledby={sectionId}>
      <div className="inline-flex items-center bg-background/30 dark:bg-background/15 rounded-lg p-1 mb-2">
        <div className="flex items-center gap-2 px-3 py-1">
          {icon && <div className="text-primary flex items-center text-xl">{icon}</div>}
          <span
            id={sectionId}
            className="font-semibold text-primary dark:text-primary/90 tracking-[0.01em]"
          >
            {title}
          </span>
        </div>
      </div>

      {description && (
        <p className={cn('text-sm text-muted-foreground mb-3 max-w-[90%]', icon ? 'ml-1' : 'ml-0')}>
          {description}
        </p>
      )}

      <div className="ml-1" role="list">
        {children}
      </div>
    </section>
  );
};

export default React.memo(SettingsSection);
