import { useState } from 'react';

import { Card, CardContent, CardHeader, CardTitle } from '@app/components/ui/card';
import { Tabs, TabsList, TabsTrigger } from '@app/components/ui/tabs';
import { cn } from '@app/lib/utils';
import { useStore } from '@app/stores/evalConfig';
import { UnifiedConfig } from '@promptfoo/types';
import { Code, Eye } from 'lucide-react';
import RunTestSuiteButton from './RunTestSuiteButton';
import YamlEditor from './YamlEditor';

interface ConfigSummaryItemProps {
  label: string;
  value: number;
  isEmpty: boolean;
}

function ConfigSummaryItem({ label, value, isEmpty }: ConfigSummaryItemProps) {
  return (
    <div className="flex items-center justify-between py-2 px-3 rounded-lg bg-muted/50">
      <span className="text-muted-foreground">{label}</span>
      <span
        className={cn(
          'font-medium tabular-nums',
          isEmpty ? 'text-amber-600 dark:text-amber-400' : 'text-foreground',
        )}
      >
        {value}
      </span>
    </div>
  );
}

interface ConfigSummaryProps {
  config: Partial<UnifiedConfig>;
}

function ConfigSummary({ config }: ConfigSummaryProps) {
  const providersCount = Array.isArray(config.providers) ? config.providers.length : 0;
  const promptsCount = Array.isArray(config.prompts) ? config.prompts.length : 0;
  const testsCount = Array.isArray(config.tests) ? config.tests.length : 0;

  return (
    <div className="space-y-3 text-sm">
      <ConfigSummaryItem label="Providers" value={providersCount} isEmpty={providersCount === 0} />
      <ConfigSummaryItem label="Prompts" value={promptsCount} isEmpty={promptsCount === 0} />
      <ConfigSummaryItem label="Test Cases" value={testsCount} isEmpty={testsCount === 0} />
    </div>
  );
}

export function ConfigPreview() {
  const { config } = useStore();
  const [view, setView] = useState<'preview' | 'yaml'>('preview');

  return (
    <Card className="bg-white dark:bg-zinc-900 shadow-sm">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg">Configuration</CardTitle>
          <Tabs value={view} onValueChange={(v) => setView(v as 'preview' | 'yaml')}>
            <TabsList className="h-8">
              <TabsTrigger value="preview" className="text-xs">
                <Eye className="size-3 mr-1" />
                Preview
              </TabsTrigger>
              <TabsTrigger value="yaml" className="text-xs">
                <Code className="size-3 mr-1" />
                YAML
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
      </CardHeader>
      <CardContent className="pt-0 space-y-4">
        {view === 'preview' ? (
          <ConfigSummary config={config} />
        ) : (
          <div className="max-h-[500px] overflow-auto">
            <YamlEditor initialConfig={useStore.getState().getTestSuite()} />
          </div>
        )}

        <div className="pt-4 border-t flex justify-center">
          <RunTestSuiteButton />
        </div>
      </CardContent>
    </Card>
  );
}
