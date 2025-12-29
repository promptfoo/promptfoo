import { useState } from 'react';

import { Card, CardContent } from '@app/components/ui/card';
import { Gauge } from '@app/components/ui/gauge';
import { Tooltip, TooltipContent, TooltipTrigger } from '@app/components/ui/tooltip';
import { Typography } from '@app/components/ui/typography';
import { cn } from '@app/lib/utils';
import {
  categoryAliases,
  displayNameOverrides,
  subCategoryDescriptions,
} from '@promptfoo/redteam/constants';
import { type GradingResult } from '@promptfoo/types';
import { CheckCircle, ChevronRight, XCircle } from 'lucide-react';
import RiskCategoryDrawer from './RiskCategoryDrawer';
import { useReportStore } from './store';

const RiskCard = ({
  title,
  subtitle,
  progressValue,
  numTestsPassed,
  numTestsFailed,
  testTypes,
  evalId,
  failuresByPlugin,
  passesByPlugin,
}: {
  title: string;
  subtitle: string;
  progressValue: number;
  numTestsPassed: number;
  numTestsFailed: number;
  testTypes: { name: string; categoryPassed: boolean; numPassed: number; numFailed: number }[];
  evalId: string;
  failuresByPlugin: Record<
    string,
    { prompt: string; output: string; gradingResult?: GradingResult }[]
  >;
  passesByPlugin: Record<
    string,
    { prompt: string; output: string; gradingResult?: GradingResult }[]
  >;
}) => {
  const { showPercentagesOnRiskCards, pluginPassRateThreshold } = useReportStore();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState('');

  // Hide risk cards with no tests
  const filteredTestTypes = testTypes.filter((test) => test.numPassed + test.numFailed > 0);
  if (filteredTestTypes.length === 0) {
    return null;
  }

  const getPercentageColor = (percentage: number): string => {
    if (percentage >= 0.8) {
      return 'text-emerald-600 dark:text-emerald-400';
    }
    if (percentage >= 0.5) {
      return 'text-amber-600 dark:text-amber-400';
    }
    return 'text-red-600 dark:text-red-400';
  };

  return (
    <Card>
      <CardContent className="break-inside-avoid py-8 print:py-2">
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 print:flex print:flex-row print:gap-8">
          {/* Left side - Title and Gauge */}
          <div className="flex flex-col items-center text-center print:flex-1">
            <Typography variant="title" as="h2" className="font-bold">
              {title}
            </Typography>
            <Typography variant="muted" className="mb-4">
              {subtitle}
            </Typography>

            {/* Gauge */}
            <div className="relative mb-2 flex h-[100px] w-[100px] items-center justify-center">
              <Gauge value={progressValue} size={100} strokeWidth={10} />
            </div>

            <p
              className={cn(
                'text-lg font-semibold',
                numTestsFailed === 0 ? 'text-muted-foreground' : 'text-destructive',
              )}
            >
              {numTestsFailed} failed probes
            </p>
            <Typography variant="muted">
              {numTestsPassed}/{numTestsPassed + numTestsFailed} passed
            </Typography>
          </div>

          {/* Right side - Test list */}
          <div className="print:flex-1">
            <div className="space-y-1">
              {filteredTestTypes.map((test, index) => {
                const percentage = test.numPassed / (test.numPassed + test.numFailed);
                return (
                  <Tooltip key={index}>
                    <TooltipTrigger asChild>
                      <button
                        type="button"
                        className={cn(
                          'flex w-full items-center justify-between rounded px-2 py-1.5 text-left transition-all',
                          'border border-transparent',
                          'hover:border-blue-200 hover:bg-blue-50/50 hover:shadow-sm hover:translate-x-0.5',
                          'dark:hover:border-blue-800/50 dark:hover:bg-blue-950/30',
                        )}
                        onClick={() => {
                          setSelectedCategory(test.name);
                          setDrawerOpen(true);
                        }}
                        aria-label={`View details for ${displayNameOverrides[test.name as keyof typeof displayNameOverrides] || categoryAliases[test.name as keyof typeof categoryAliases]}`}
                      >
                        <span className="text-sm">
                          {displayNameOverrides[test.name as keyof typeof displayNameOverrides] ||
                            categoryAliases[test.name as keyof typeof categoryAliases]}
                        </span>
                        <div className="flex items-center gap-1">
                          {showPercentagesOnRiskCards ? (
                            <span
                              className={cn('text-sm font-bold', getPercentageColor(percentage))}
                            >
                              {`${Math.round(percentage * 100)}%`}
                            </span>
                          ) : percentage >= pluginPassRateThreshold ? (
                            <CheckCircle className="h-4 w-4 text-emerald-600 dark:text-emerald-500" />
                          ) : (
                            <XCircle className="h-4 w-4 text-destructive" />
                          )}
                          <ChevronRight className="h-3 w-3 text-muted-foreground/60 transition-all group-hover:translate-x-0.5 group-hover:opacity-100 print:hidden" />
                        </div>
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="left">
                      {subCategoryDescriptions[test.name as keyof typeof subCategoryDescriptions] ||
                        'Click to view details'}
                    </TooltipContent>
                  </Tooltip>
                );
              })}
            </div>
          </div>
        </div>

        {selectedCategory && (
          <RiskCategoryDrawer
            open={drawerOpen}
            onClose={() => setDrawerOpen(false)}
            category={selectedCategory}
            failures={failuresByPlugin[selectedCategory] || []}
            passes={passesByPlugin[selectedCategory] || []}
            evalId={evalId}
            numPassed={(() => {
              const testType = testTypes.find((t) => t.name === selectedCategory);
              return testType?.numPassed ?? 0;
            })()}
            numFailed={(() => {
              const testType = testTypes.find((t) => t.name === selectedCategory);
              return testType?.numFailed ?? 0;
            })()}
          />
        )}
      </CardContent>
    </Card>
  );
};

export default RiskCard;
