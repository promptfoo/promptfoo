import * as React from 'react';
import { useCallback, useState } from 'react';

import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@app/components/ui/tooltip';
import { cn } from '@app/lib/utils';
import { ChevronRight } from 'lucide-react';

export type NavigationItemStatus = 'error' | 'warning' | 'success' | 'info';

export interface NavigationItem {
  /** Unique identifier for the navigation item */
  id: string;
  /** Display label for the item */
  label: string;
  /** Icon element to display (typically a Lucide icon) */
  icon?: React.ReactNode;
  /** Whether the item is disabled */
  disabled?: boolean;
  /** Tooltip text to show when item is disabled or for status */
  tooltip?: string;
  /** Status indicator (shows colored dot or custom icon) */
  status?: NavigationItemStatus;
  /** Custom status icon (overrides the default dot) */
  statusIcon?: React.ReactNode;
  /** Nested child items (up to 3 levels deep) */
  children?: NavigationItem[];
  /** Whether the item starts expanded (only applies to items with children) */
  defaultExpanded?: boolean;
  /** If true, item is a non-selectable group header (always expanded, no navigation) */
  group?: boolean;
}

const statusColors: Record<NavigationItemStatus, string> = {
  error: 'bg-red-500',
  warning: 'bg-amber-500',
  success: 'bg-emerald-500',
  info: 'bg-blue-500',
};

const statusIconColors: Record<NavigationItemStatus, string> = {
  error: 'text-red-500',
  warning: 'text-amber-500',
  success: 'text-emerald-500',
  info: 'text-blue-500',
};

function StatusIndicator({
  status,
  statusIcon,
}: {
  status: NavigationItemStatus;
  statusIcon?: React.ReactNode;
}) {
  if (statusIcon) {
    return <span className={cn('ml-auto shrink-0', statusIconColors[status])}>{statusIcon}</span>;
  }
  return <span className={cn('ml-auto size-2 shrink-0 rounded-full', statusColors[status])} />;
}

export interface NavigationSidebarProps
  extends Omit<React.ComponentProps<'div'>, 'header' | 'footer'> {
  /** Array of navigation items to display */
  items: NavigationItem[];
  /** Currently active item id */
  activeId?: string;
  /** Callback when a navigation item is selected */
  onNavigate?: (id: string) => void;
  /** Optional header content (e.g., a combobox or title) */
  header?: React.ReactNode;
  /** Optional footer content */
  footer?: React.ReactNode;
  /** If true, sidebar collapses to icons only and expands on hover */
  collapsible?: boolean;
}

// Indentation padding for each nesting level
const levelPadding: Record<number, string> = {
  0: 'pl-3',
  1: 'pl-7',
  2: 'pl-11',
};

interface NavigationItemButtonProps {
  item: NavigationItem;
  level: number;
  isActive: boolean;
  isExpanded: boolean;
  isCollapsed: boolean;
  onSelect: (id: string) => void;
  onToggleExpand: (id: string) => void;
}

function NavigationItemButton({
  item,
  level,
  isActive,
  isExpanded,
  isCollapsed,
  onSelect,
  onToggleExpand,
}: NavigationItemButtonProps) {
  const hasChildren = item.children && item.children.length > 0;

  const handleClick = () => {
    if (item.disabled) {
      return;
    }
    onSelect(item.id);
  };

  const handleChevronClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onToggleExpand(item.id);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      handleClick();
    }
  };

  const button = (
    <button
      type="button"
      role="treeitem"
      aria-expanded={hasChildren ? isExpanded : undefined}
      aria-selected={isActive}
      disabled={item.disabled}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      className={cn(
        'flex w-full items-center gap-2 rounded-lg h-10 text-left text-sm font-medium',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
        isActive
          ? 'border-l-2 border-l-primary bg-primary/10 text-primary'
          : 'bg-white dark:bg-zinc-900 text-muted-foreground hover:bg-muted/50 hover:text-foreground',
        item.disabled && 'cursor-not-allowed opacity-50',
        isCollapsed ? 'justify-center px-2' : cn('pr-3', levelPadding[level] || 'pl-3'),
      )}
    >
      {item.icon && <span className="size-4 shrink-0">{item.icon}</span>}
      {!isCollapsed && (
        <>
          <span className="flex-1 truncate">{item.label}</span>
          {item.status && <StatusIndicator status={item.status} statusIcon={item.statusIcon} />}
          {hasChildren && (
            <button
              type="button"
              onClick={handleChevronClick}
              className="p-1 -m-1 rounded hover:bg-muted"
            >
              <ChevronRight
                className={cn('size-4 shrink-0 text-muted-foreground', isExpanded && 'rotate-90')}
              />
            </button>
          )}
        </>
      )}
    </button>
  );

  if (item.tooltip) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="w-full">{button}</span>
        </TooltipTrigger>
        <TooltipContent side="right">{item.tooltip}</TooltipContent>
      </Tooltip>
    );
  }

  return button;
}

function findItemById(items: NavigationItem[], id: string): NavigationItem | undefined {
  for (const item of items) {
    if (item.id === id) {
      return item;
    }
    if (item.children) {
      const found = findItemById(item.children, id);
      if (found) {
        return found;
      }
    }
  }
  return undefined;
}

function findAncestorIds(
  items: NavigationItem[],
  targetId: string,
  path: string[] = [],
): string[] | null {
  for (const item of items) {
    if (item.id === targetId) {
      return path;
    }
    if (item.children) {
      const found = findAncestorIds(item.children, targetId, [...path, item.id]);
      if (found) {
        return found;
      }
    }
  }
  return null;
}

function getDefaultExpandedIds(items: NavigationItem[]): Set<string> {
  const ids = new Set<string>();
  const traverse = (items: NavigationItem[]) => {
    for (const item of items) {
      if (item.children && item.defaultExpanded) {
        ids.add(item.id);
      }
      if (item.children) {
        traverse(item.children);
      }
    }
  };
  traverse(items);
  return ids;
}

export function NavigationSidebar({
  items,
  activeId,
  onNavigate,
  header,
  footer,
  className,
  collapsible = false,
  ...props
}: NavigationSidebarProps) {
  const [expandedIds, setExpandedIds] = useState<Set<string>>(() => getDefaultExpandedIds(items));
  const [isHovered, setIsHovered] = useState(false);
  const isCollapsed = collapsible && !isHovered;

  const handleSelect = useCallback(
    (id: string) => {
      const item = findItemById(items, id);
      if (item && !item.disabled && onNavigate) {
        onNavigate(id);
        // Keep ancestors expanded, and open this item's children if it has any
        const ancestors = findAncestorIds(items, id) || [];
        const newExpanded = new Set(ancestors);
        if (item.children && item.children.length > 0) {
          newExpanded.add(id);
        }
        setExpandedIds(newExpanded);
      }
    },
    [items, onNavigate],
  );

  const handleToggleExpand = useCallback((id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const renderItems = (items: NavigationItem[], level: number) => {
    if (level > 2) {
      return null; // Max 3 levels (0, 1, 2)
    }
    // When collapsed, only render top-level non-group items
    if (isCollapsed && level > 0) {
      return null;
    }

    return items.map((item) => {
      const hasChildren = item.children && item.children.length > 0;
      const isExpanded = item.group || expandedIds.has(item.id);
      const isActive = item.id === activeId;

      // Group headers are non-interactive labels
      if (item.group) {
        if (isCollapsed) {
          // When collapsed, show a separator and render group children
          return (
            <div key={item.id} className="pt-3 first:pt-0">
              <div className="mb-2 border-t border-border" />
              {hasChildren && renderItems(item.children!, level)}
            </div>
          );
        }
        return (
          <div key={item.id} className="pt-4 first:pt-0">
            <div className="flex items-center gap-2 px-3 py-2">
              {item.icon && (
                <span className="size-4 shrink-0 text-muted-foreground">{item.icon}</span>
              )}
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {item.label}
              </span>
            </div>
            {hasChildren && <div className="mt-1">{renderItems(item.children!, level)}</div>}
          </div>
        );
      }

      return (
        <div key={item.id}>
          <NavigationItemButton
            item={item}
            level={isCollapsed ? 0 : level}
            isActive={isActive}
            isExpanded={isExpanded}
            isCollapsed={isCollapsed}
            onSelect={handleSelect}
            onToggleExpand={handleToggleExpand}
          />
          {hasChildren && !isCollapsed && (
            <div
              className={cn(
                'grid transition-[grid-template-rows] duration-200 ease-out',
                isExpanded ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]',
              )}
            >
              <div className="overflow-hidden">
                <div className="mt-1">{renderItems(item.children!, level + 1)}</div>
              </div>
            </div>
          )}
        </div>
      );
    });
  };

  return (
    <TooltipProvider>
      <div
        onMouseEnter={() => collapsible && setIsHovered(true)}
        onMouseLeave={() => collapsible && setIsHovered(false)}
        className={cn(
          'sticky top-0 flex h-full shrink-0 flex-col border-r border-border bg-white dark:bg-zinc-900 overflow-y-auto overflow-x-hidden transition-[width] duration-200 ease-out',
          isCollapsed ? 'w-14 px-2' : 'w-60 px-4',
          'py-4',
          className,
        )}
        {...props}
      >
        {!isCollapsed && header && <div className="mb-4">{header}</div>}

        <nav role="tree" aria-label="Navigation" className="flex-1 space-y-1">
          {renderItems(items, 0)}
        </nav>

        {!isCollapsed && footer && <div className="mt-4 pt-4 border-t border-border">{footer}</div>}
      </div>
    </TooltipProvider>
  );
}
