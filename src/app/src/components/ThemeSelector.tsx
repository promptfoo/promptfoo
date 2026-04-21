import { Button } from '@app/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@app/components/ui/tooltip';
import { type ThemePreference, useThemePreference } from '@app/hooks/useThemePreference';
import { cn } from '@app/lib/utils';
import { Monitor, Moon, Sun } from 'lucide-react';

const THEME_ORDER = ['light', 'system', 'dark'] as const satisfies readonly ThemePreference[];

const NEXT_THEME_PREFERENCE = {
  dark: 'light',
  light: 'system',
  system: 'dark',
} satisfies Record<ThemePreference, ThemePreference>;

const THEME_OPTIONS = {
  dark: {
    icon: Moon,
    label: 'Dark theme',
  },
  light: {
    icon: Sun,
    label: 'Light theme',
  },
  system: {
    icon: Monitor,
    label: 'System theme',
  },
} satisfies Record<
  ThemePreference,
  {
    icon: typeof Sun;
    label: string;
  }
>;

function getNextThemePreference(themePreference: ThemePreference): ThemePreference {
  return NEXT_THEME_PREFERENCE[themePreference];
}

function ThemeSelector() {
  const { setThemePreference, systemTheme, themePreference } = useThemePreference();
  const nextThemePreference = getNextThemePreference(themePreference);
  const currentThemeLabel = THEME_OPTIONS[themePreference].label;
  const nextThemeLabel = THEME_OPTIONS[nextThemePreference].label;
  const currentStateLabel =
    themePreference === 'system' ? `${currentThemeLabel} (${systemTheme})` : currentThemeLabel;

  const handleThemePreferenceChange = () => {
    setThemePreference(nextThemePreference);
  };

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          type="button"
          onClick={handleThemePreferenceChange}
          aria-label={`Theme preference: ${currentStateLabel}. Switch to ${nextThemeLabel}.`}
          className={cn(
            'relative rounded-full text-foreground/60 transition-all duration-200 hover:rotate-[15deg] hover:text-foreground',
            '[&_svg]:size-5',
          )}
        >
          {THEME_ORDER.map((preference) => {
            const Icon = THEME_OPTIONS[preference].icon;

            return (
              <Icon
                key={preference}
                aria-hidden="true"
                className={cn(
                  'absolute size-5 transition-all duration-200',
                  preference === themePreference
                    ? 'rotate-0 opacity-100'
                    : 'pointer-events-none rotate-90 opacity-0',
                )}
              />
            );
          })}
        </Button>
      </TooltipTrigger>
      <TooltipContent side="bottom">{currentStateLabel}</TooltipContent>
    </Tooltip>
  );
}

export default ThemeSelector;
