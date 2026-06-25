import { type ComponentProps, useState } from 'react';

import { TooltipProvider } from '@app/components/ui/tooltip';
import { RunOptionsContent } from './RunOptions';
import type { Meta, StoryObj } from '@storybook/react-vite';

import type { Config } from '../types';

const meta = {
  title: 'Pages/Redteam/Setup/RunOptions',
  component: RunOptionsContent,
  parameters: {
    layout: 'centered',
  },
} satisfies Meta<typeof RunOptionsContent>;

export default meta;
type Story = StoryObj<typeof meta>;
type RunOptionsProps = ComponentProps<typeof RunOptionsContent>;

const InteractiveRunOptions = () => {
  const [numTests, setNumTests] = useState<number | undefined>(10);
  const [maxCharsPerMessage, setMaxCharsPerMessage] = useState<number | undefined>(25);
  const [minCharsPerMessage, setMinCharsPerMessage] = useState<number | undefined>(50);
  const [runOptions, setRunOptions] = useState<NonNullable<RunOptionsProps['runOptions']>>({
    delay: 0,
    maxConcurrency: 1,
    verbose: false,
  });

  const updateConfig = (section: keyof Config, value: Config[keyof Config]) => {
    if (section === 'numTests') {
      setNumTests(value as number | undefined);
    }
    if (section === 'maxCharsPerMessage') {
      setMaxCharsPerMessage(value as number | undefined);
    }
    if (section === 'minCharsPerMessage') {
      setMinCharsPerMessage(value as number | undefined);
    }
  };

  const updateRunOption = (...[key, value]: Parameters<RunOptionsProps['updateRunOption']>) => {
    setRunOptions((current) => ({ ...current, [key]: value }));
  };

  return (
    <TooltipProvider>
      <div className="w-[420px] rounded-lg border bg-background p-6 shadow-sm">
        <RunOptionsContent
          numTests={numTests}
          maxCharsPerMessage={maxCharsPerMessage}
          minCharsPerMessage={minCharsPerMessage}
          runOptions={runOptions}
          updateConfig={updateConfig}
          updateRunOption={updateRunOption}
        />
      </div>
    </TooltipProvider>
  );
};

export const InteractiveValidationProof: Story = {
  args: {
    numTests: 10,
    updateConfig: () => {},
    updateRunOption: () => {},
  },
  render: () => <InteractiveRunOptions />,
};
