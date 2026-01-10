import { useState } from 'react';

import { Card, CardContent } from '@app/components/ui/card';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@app/components/ui/collapsible';
import { Tooltip, TooltipArrow, TooltipContent, TooltipTrigger } from '@app/components/ui/tooltip';
import { cn } from '@app/lib/utils';
import {
  categoryAliases,
  categoryDescriptions,
  displayNameOverrides,
  riskCategories,
  subCategoryDescriptions,
} from '@promptfoo/redteam/constants';
import { CheckCircle, ChevronDown, ChevronRight, XCircle } from 'lucide-react';
import { type CategoryStats } from './FrameworkComplianceUtils';
import RiskCategoryDrawer from './RiskCategoryDrawer';
import { useReportStore } from './store';
import type { TopLevelCategory } from '@promptfoo/redteam/constants';
import type { GradingResult } from '@promptfoo/types';

interface RiskCategoriesProps {
  categoryStats: CategoryStats;
  evalId: string;
  failuresByPlugin: Record<
    string,
    { prompt: string; output: string; gradingResult?: GradingResult }[]
  >;
  passesByPlugin: Record<
    string,
    { prompt: string; output: string; gradingResult?: GradingResult }[]
  >;
}

interface TestType {
  name: string;
  categoryPassed: boolean;
  numPassed: number;
  numFailed: number;
  total: number;
}

interface CategoryData {
  name: string;
  description: string;
  totalPasses: number;
  totalTests: number;
  testTypes: TestType[];
  passRate: number;
}

const getPassRateStyles = (passRate: number): { bg: string; text: string } => {
  if (passRate >= 0.9) {
    return {
      bg: 'bg-emerald-500',
      text: 'text-emerald-600 dark:text-emerald-400',
    };
  }
  if (passRate >= 0.7) {
    return {
      bg: 'bg-amber-500',
      text: 'text-amber-600 dark:text-amber-400',
    };
  }
  if (passRate >= 0.5) {
    return {
      bg: 'bg-orange-500',
      text: 'text-orange-600 dark:text-orange-400',
    };
  }
  return {
    bg: 'bg-red-500',
    text: 'text-red-600 dark:text-red-400',
  };
};

interface PluginRowProps {
  test: TestType;
  pluginPassRateThreshold: number;
  onPluginClick: (pluginName: string) => void;
}

const PluginRow = ({ test, pluginPassRateThreshold, onPluginClick }: PluginRowProps) => {
  const passRate = test.numPassed / test.total;
  const isPassing = passRate >= pluginPassRateThreshold;

  const displayName =
    displayNameOverrides[test.name as keyof typeof displayNameOverrides] ||
    categoryAliases[test.name as keyof typeof categoryAliases] ||
    test.name;

  return (
    <button
      key={test.name}
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onPluginClick(test.name);
      }}
      className={cn(
        'group flex w-full items-center gap-4 px-4 py-2.5 text-left text-sm transition-all cursor-pointer',
        'hover:bg-accent dark:hover:bg-accent/50',
      )}
    >
      {/* Spacer to align with category chevron */}
      <div className="w-4 shrink-0 print:hidden" />

      {/* Plugin Name with Tooltip */}
      <div className="min-w-0 flex-1">
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="truncate inline-block max-w-full group-hover:text-accent-foreground">
              {displayName}
            </span>
          </TooltipTrigger>
          <TooltipContent side="right" className="max-w-xs">
            <TooltipArrow className="fill-foreground" />
            <p>
              {subCategoryDescriptions[test.name as keyof typeof subCategoryDescriptions] ||
                'Click to view details'}
            </p>
          </TooltipContent>
        </Tooltip>
      </div>

      {/* Progress Bar - same width as category (w-32) */}
      <div className="hidden w-32 shrink-0 items-center gap-2 sm:flex">
        <div className="h-2 flex-1 overflow-hidden rounded-full bg-zinc-300 dark:bg-zinc-600">
          <div
            className={cn('h-full rounded-full', getPassRateStyles(passRate).bg)}
            style={{ width: `${passRate * 100}%` }}
          />
        </div>
      </div>

      {/* Stats - fixed width to align with category stats */}
      <div className="w-20 shrink-0 text-right">
        <span className="text-xs text-muted-foreground">
          {test.numPassed}/{test.total}
        </span>
      </div>

      {/* Status Icon - same w-5 as category */}
      <div className="w-5 shrink-0 flex justify-center">
        {isPassing ? (
          <CheckCircle className="size-4 text-emerald-600 dark:text-emerald-500" />
        ) : (
          <XCircle className="size-4 text-destructive" />
        )}
      </div>

      {/* Chevron - in w-4 container to match category spacer */}
      <div className="w-4 shrink-0 flex justify-center print:hidden">
        <ChevronRight className="size-3 text-muted-foreground/50 transition-transform group-hover:translate-x-0.5 group-hover:text-muted-foreground" />
      </div>
    </button>
  );
};

interface RiskCategoryRowProps {
  category: CategoryData;
  isExpanded: boolean;
  pluginPassRateThreshold: number;
  onToggle: () => void;
  onPluginClick: (pluginName: string) => void;
}

const RiskCategoryRow = ({
  category,
  isExpanded,
  pluginPassRateThreshold,
  onToggle,
  onPluginClick,
}: RiskCategoryRowProps) => {
  const hasFailed = category.passRate < pluginPassRateThreshold;

  return (
    <Collapsible open={isExpanded} onOpenChange={onToggle}>
      {/* Category Header Row */}
      <CollapsibleTrigger asChild>
        <button
          type="button"
          className={cn(
            'flex w-full items-center gap-4 p-4 text-left transition-colors cursor-pointer',
            'hover:bg-muted/50',
            isExpanded && 'bg-muted/30',
          )}
        >
          {/* Expand/Collapse Icon */}
          <div className="shrink-0 text-muted-foreground print:hidden">
            {isExpanded ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
          </div>

          {/* Category Name & Description */}
          <div className="min-w-0 flex-1">
            <span className="font-semibold">{category.name}</span>
            <p className="truncate text-sm text-muted-foreground">{category.description}</p>
          </div>

          {/* Progress Bar */}
          <div className="hidden w-32 shrink-0 items-center gap-2 sm:flex">
            <div className="h-2 flex-1 overflow-hidden rounded-full bg-zinc-300 dark:bg-zinc-600">
              <div
                className={cn(
                  'h-full rounded-full transition-all',
                  getPassRateStyles(category.passRate).bg,
                )}
                style={{ width: `${category.passRate * 100}%` }}
              />
            </div>
          </div>

          {/* Stats - fixed width to align with plugin rows */}
          <div className="w-20 shrink-0 text-right">
            <span
              className={cn('text-sm font-semibold', getPassRateStyles(category.passRate).text)}
            >
              {Math.round(category.passRate * 100)}%
            </span>
            <p className="text-xs text-muted-foreground">
              {category.totalPasses}/{category.totalTests}
            </p>
          </div>

          {/* Status Icon */}
          <div className="w-5 shrink-0 flex justify-center">
            {hasFailed ? (
              <XCircle className="size-4 text-destructive" />
            ) : (
              <CheckCircle className="size-4 text-emerald-600 dark:text-emerald-500" />
            )}
          </div>

          {/* Spacer for chevron alignment */}
          <div className="w-4 shrink-0 print:hidden" />
        </button>
      </CollapsibleTrigger>

      {/* Expanded Plugin List */}
      <CollapsibleContent forceMount className={cn('data-[state=closed]:hidden print:!block')}>
        <div className="border-t border-border bg-muted/20">
          {category.testTypes.map((test) => (
            <PluginRow
              key={test.name}
              test={test}
              pluginPassRateThreshold={pluginPassRateThreshold}
              onPluginClick={onPluginClick}
            />
          ))}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
};

const RiskCategories = ({
  categoryStats,
  evalId,
  failuresByPlugin,
  passesByPlugin,
}: RiskCategoriesProps) => {
  const { pluginPassRateThreshold } = useReportStore();
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(
    () => new Set(Object.keys(riskCategories)),
  );
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selectedPlugin, setSelectedPlugin] = useState('');

  const categories = Object.keys(riskCategories)
    .map((category) => {
      const categoryName = category as TopLevelCategory;
      const subCategories = riskCategories[categoryName];

      const totalPasses = subCategories.reduce(
        (acc, subCategory) => acc + (categoryStats[subCategory]?.pass || 0),
        0,
      );
      const totalTests = subCategories.reduce(
        (acc, subCategory) => acc + (categoryStats[subCategory]?.total || 0),
        0,
      );

      const testTypes = subCategories
        .map((subCategory) => {
          const stats = categoryStats[subCategory];
          const numPassed = stats?.pass || 0;
          const totalForSubcategory = stats?.total || 0;
          const numFailed = totalForSubcategory - numPassed;

          return {
            name: subCategory,
            categoryPassed: numPassed === totalForSubcategory && totalForSubcategory > 0,
            numPassed,
            numFailed,
            total: totalForSubcategory,
          };
        })
        .filter((test) => test.total > 0);

      return {
        name: category,
        description: categoryDescriptions[categoryName as keyof typeof categoryDescriptions],
        totalPasses,
        totalTests,
        testTypes,
        passRate: totalTests > 0 ? totalPasses / totalTests : 1,
      };
    })
    .filter((category) => category.totalTests > 0);

  const toggleCategory = (categoryName: string) => {
    setExpandedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(categoryName)) {
        next.delete(categoryName);
      } else {
        next.add(categoryName);
      }
      return next;
    });
  };

  const handlePluginClick = (pluginName: string) => {
    setSelectedPlugin(pluginName);
    setDrawerOpen(true);
  };

  if (categories.length === 0) {
    return null;
  }

  // Calculate overall stats
  const overallPassed = categories.reduce((acc, cat) => acc + cat.totalPasses, 0);
  const overallTotal = categories.reduce((acc, cat) => acc + cat.totalTests, 0);
  const overallPassRate = overallTotal > 0 ? overallPassed / overallTotal : 1;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">Risk Categories</h2>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <span className={cn('font-medium', getPassRateStyles(overallPassRate).text)}>
            {Math.round(overallPassRate * 100)}%
          </span>
          <span>
            ({overallPassed}/{overallTotal} tests defended)
          </span>
        </div>
      </div>

      <Card>
        <CardContent className="divide-y divide-border p-0">
          {categories.map((category) => (
            <RiskCategoryRow
              key={category.name}
              category={category}
              isExpanded={expandedCategories.has(category.name)}
              pluginPassRateThreshold={pluginPassRateThreshold}
              onToggle={() => toggleCategory(category.name)}
              onPluginClick={handlePluginClick}
            />
          ))}
        </CardContent>
      </Card>

      {/* Drawer for plugin details */}
      {selectedPlugin && (
        <RiskCategoryDrawer
          open={drawerOpen}
          onClose={() => setDrawerOpen(false)}
          category={selectedPlugin}
          failures={failuresByPlugin[selectedPlugin] || []}
          passes={passesByPlugin[selectedPlugin] || []}
          evalId={evalId}
          numPassed={categoryStats[selectedPlugin]?.pass ?? 0}
          numFailed={
            (categoryStats[selectedPlugin]?.total ?? 0) - (categoryStats[selectedPlugin]?.pass ?? 0)
          }
        />
      )}
    </div>
  );
};

export default RiskCategories;
