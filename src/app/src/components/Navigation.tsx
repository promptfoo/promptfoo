import { useState } from 'react';

import {
  NavigationMenu,
  NavigationMenuContent,
  NavigationMenuItem,
  NavigationMenuLink,
  NavigationMenuList,
  NavigationMenuTrigger,
} from '@app/components/ui/navigation-menu';
import { Tooltip, TooltipContent, TooltipTrigger } from '@app/components/ui/tooltip';
import { IS_RUNNING_LOCALLY } from '@app/constants';
import { EVAL_ROUTES, MODEL_AUDIT_ROUTES, REDTEAM_ROUTES, ROUTES } from '@app/constants/routes';
import { cn } from '@app/lib/utils';
import { Info, Settings } from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';
import ApiSettingsModal from './ApiSettingsModal';
import InfoModal from './InfoModal';
import Logo from './Logo';
import ThemeSelector from './ThemeSelector';

const LEGACY_MODEL_AUDIT_HISTORY_ROUTE = `${MODEL_AUDIT_ROUTES.ROOT}/history`;

interface NavLinkProps {
  href: string;
  label: string;
}

function NavLink({ href, label }: NavLinkProps) {
  const location = useLocation();

  // Special handling for Model Audit to activate on both /model-audit and /model-audit/:id
  let isActive: boolean;
  if (href === MODEL_AUDIT_ROUTES.ROOT) {
    isActive =
      location.pathname === MODEL_AUDIT_ROUTES.ROOT ||
      (location.pathname.startsWith(`${MODEL_AUDIT_ROUTES.ROOT}/`) &&
        !location.pathname.startsWith(MODEL_AUDIT_ROUTES.SETUP) &&
        !location.pathname.startsWith(LEGACY_MODEL_AUDIT_HISTORY_ROUTE));
  } else {
    isActive = location.pathname.startsWith(href);
  }

  return (
    <Link
      to={href}
      className={cn(
        'inline-flex h-8 items-center justify-center rounded-md px-3 text-sm font-medium transition-colors',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
        isActive
          ? 'bg-primary/10 text-foreground hover:bg-primary/15 focus-visible:bg-primary/15'
          : 'text-foreground hover:bg-accent focus-visible:bg-accent',
      )}
    >
      {label}
    </Link>
  );
}

interface MenuItem {
  href: string;
  label: string;
  description: string;
}

interface NavDropdownProps {
  label: string;
  compactLabel?: string;
  items: MenuItem[];
  isActiveCheck: (pathname: string) => boolean;
}

function NavDropdown({ label, compactLabel, items, isActiveCheck }: NavDropdownProps) {
  const location = useLocation();
  const isActive = isActiveCheck(location.pathname);

  return (
    <NavigationMenuItem>
      <NavigationMenuTrigger
        aria-label={label}
        className={cn(
          'h-8 bg-transparent px-3 text-sm font-medium',
          'data-[state=open]:bg-accent',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
          isActive
            ? 'bg-primary/10 text-foreground hover:bg-primary/15 focus-visible:bg-primary/15'
            : 'text-foreground hover:bg-accent focus-visible:bg-accent',
        )}
      >
        {compactLabel ? (
          <>
            <span className="hidden min-[390px]:inline">{label}</span>
            <span className="min-[390px]:hidden">{compactLabel}</span>
          </>
        ) : (
          label
        )}
      </NavigationMenuTrigger>
      <NavigationMenuContent>
        <ul className="w-[300px] p-1.5">
          {items.map((item, index) => (
            <li key={item.href}>
              <NavigationMenuLink asChild>
                <Link
                  to={item.href}
                  className={cn(
                    'block select-none rounded-lg px-3 py-2.5 outline-none transition-colors no-underline',
                    'hover:bg-accent hover:no-underline',
                    'focus:bg-accent',
                    index !== items.length - 1 && 'mb-0.5',
                  )}
                >
                  <div className="text-sm font-medium text-foreground">{item.label}</div>
                  <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
                    {item.description}
                  </p>
                </Link>
              </NavigationMenuLink>
            </li>
          ))}
        </ul>
      </NavigationMenuContent>
    </NavigationMenuItem>
  );
}

const createMenuItems: MenuItem[] = [
  {
    href: ROUTES.SETUP,
    label: 'Eval',
    description: 'Create and configure evaluation tests',
  },
  {
    href: REDTEAM_ROUTES.SETUP,
    label: 'Red Team',
    description: 'Set up security testing scenarios',
  },
  {
    href: MODEL_AUDIT_ROUTES.SETUP,
    label: 'Model Audit',
    description: 'Configure and run a model security scan',
  },
];

const resultsMenuItems: MenuItem[] = [
  {
    href: EVAL_ROUTES.ROOT,
    label: 'Latest Eval',
    description: 'View your most recent evaluation results',
  },
  {
    href: EVAL_ROUTES.LIST,
    label: 'All Evals',
    description: 'Browse and manage all evaluation runs',
  },
  {
    href: REDTEAM_ROUTES.REPORTS,
    label: 'Red Team Vulnerability Reports',
    description: 'View findings from red teams',
  },
  {
    href: ROUTES.MEDIA,
    label: 'Media Library',
    description: 'Browse generated images, videos, and audio',
  },
];

export default function Navigation() {
  const [showInfoModal, setShowInfoModal] = useState<boolean>(false);
  const [showApiSettingsModal, setShowApiSettingsModal] = useState<boolean>(false);

  const handleModalToggle = () => setShowInfoModal((prevState) => !prevState);
  const handleApiSettingsModalToggle = () => setShowApiSettingsModal((prevState) => !prevState);

  return (
    <>
      <header className="sticky top-0 z-(--z-appbar) w-full border-b border-border bg-card shadow-sm">
        <div className="flex h-14 min-w-0 items-center justify-between gap-2 px-3 sm:px-4">
          {/* Left section: Logo and Navigation */}
          <div className="flex min-w-0 items-center gap-2 sm:gap-6">
            <Logo />
            <NavigationMenu>
              <NavigationMenuList className="gap-1">
                <NavDropdown
                  label="New"
                  items={createMenuItems}
                  isActiveCheck={(pathname) =>
                    [ROUTES.SETUP, REDTEAM_ROUTES.SETUP, MODEL_AUDIT_ROUTES.SETUP].some((route) =>
                      pathname.startsWith(route),
                    )
                  }
                />
                <NavDropdown
                  label="View Results"
                  compactLabel="Results"
                  items={resultsMenuItems}
                  isActiveCheck={(pathname) =>
                    [EVAL_ROUTES.ROOT, EVAL_ROUTES.LIST, REDTEAM_ROUTES.REPORTS, ROUTES.MEDIA].some(
                      (route) => pathname.startsWith(route),
                    )
                  }
                />
              </NavigationMenuList>
            </NavigationMenu>
            <nav className="hidden items-center gap-1 md:flex">
              <NavLink href={MODEL_AUDIT_ROUTES.ROOT} label="Model Audit" />
              <NavLink href={ROUTES.PROMPTS} label="Prompts" />
              <NavLink href={ROUTES.DATASETS} label="Datasets" />
              <NavLink href={ROUTES.HISTORY} label="History" />
            </nav>
          </div>

          {/* Right section: Actions */}
          <div className="flex shrink-0 items-center gap-1">
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={handleModalToggle}
                  className="inline-flex size-9 items-center justify-center rounded-md text-foreground/60 transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                >
                  <Info className="size-5" />
                  <span className="sr-only">Information</span>
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom">Information</TooltipContent>
            </Tooltip>

            {IS_RUNNING_LOCALLY && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    onClick={handleApiSettingsModalToggle}
                    className="inline-flex size-9 items-center justify-center rounded-md text-foreground/60 transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  >
                    <Settings className="size-5" />
                    <span className="sr-only">API and Sharing Settings</span>
                  </button>
                </TooltipTrigger>
                <TooltipContent side="bottom">API and Sharing Settings</TooltipContent>
              </Tooltip>
            )}

            <ThemeSelector />
          </div>
        </div>
      </header>
      <InfoModal open={showInfoModal} onClose={handleModalToggle} />
      <ApiSettingsModal open={showApiSettingsModal} onClose={handleApiSettingsModalToggle} />
    </>
  );
}
