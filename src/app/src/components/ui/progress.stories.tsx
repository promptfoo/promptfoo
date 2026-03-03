import { useEffect, useState } from 'react';

import { Progress } from './progress';
import type { Meta, StoryObj } from '@storybook/react-vite';

const meta: Meta<typeof Progress> = {
  title: 'UI/Progress',
  component: Progress,
  tags: ['autodocs'],
  argTypes: {
    value: {
      control: { type: 'range', min: 0, max: 100, step: 1 },
      description: 'The current progress value (0-100)',
    },
  },
};

export default meta;
type Story = StoryObj<typeof Progress>;

// Default progress
export const Default: Story = {
  args: {
    value: 60,
  },
};

// Different values
export const DifferentValues: Story = {
  render: () => (
    <div className="space-y-4 w-[300px]">
      <div className="space-y-2">
        <div className="flex justify-between text-sm">
          <span>0%</span>
        </div>
        <Progress value={0} />
      </div>
      <div className="space-y-2">
        <div className="flex justify-between text-sm">
          <span>25%</span>
        </div>
        <Progress value={25} />
      </div>
      <div className="space-y-2">
        <div className="flex justify-between text-sm">
          <span>50%</span>
        </div>
        <Progress value={50} />
      </div>
      <div className="space-y-2">
        <div className="flex justify-between text-sm">
          <span>75%</span>
        </div>
        <Progress value={75} />
      </div>
      <div className="space-y-2">
        <div className="flex justify-between text-sm">
          <span>100%</span>
        </div>
        <Progress value={100} />
      </div>
    </div>
  ),
};

// Animated progress
export const Animated: Story = {
  render: function AnimatedProgress() {
    const [progress, setProgress] = useState(0);

    useEffect(() => {
      const interval = setInterval(() => {
        setProgress((prev) => {
          if (prev >= 100) {
            return 0;
          }
          return prev + 10;
        });
      }, 500);

      return () => clearInterval(interval);
    }, []);

    return (
      <div className="space-y-2 w-[300px]">
        <Progress value={progress} />
        <p className="text-sm text-muted-foreground text-center">{progress}%</p>
      </div>
    );
  },
};

// With label
export const WithLabel: Story = {
  render: () => (
    <div className="space-y-2 w-[300px]">
      <div className="flex justify-between text-sm">
        <span className="font-medium">Upload Progress</span>
        <span className="text-muted-foreground">66%</span>
      </div>
      <Progress value={66} />
    </div>
  ),
};

// File upload example
export const FileUpload: Story = {
  render: function FileUploadProgress() {
    const [progress, setProgress] = useState(0);
    const [status, setStatus] = useState<'idle' | 'uploading' | 'complete'>('idle');

    const startUpload = () => {
      setStatus('uploading');
      setProgress(0);

      const interval = setInterval(() => {
        setProgress((prev) => {
          if (prev >= 100) {
            clearInterval(interval);
            setStatus('complete');
            return 100;
          }
          return prev + Math.random() * 15;
        });
      }, 200);
    };

    const reset = () => {
      setStatus('idle');
      setProgress(0);
    };

    return (
      <div className="space-y-4 w-[300px]">
        <div className="space-y-2">
          <div className="flex justify-between text-sm">
            <span className="font-medium">document.pdf</span>
            <span className="text-muted-foreground">
              {status === 'complete'
                ? 'Complete'
                : status === 'uploading'
                  ? `${Math.round(progress)}%`
                  : 'Ready'}
            </span>
          </div>
          <Progress value={Math.min(progress, 100)} />
        </div>
        <div className="flex gap-2">
          <button
            onClick={startUpload}
            disabled={status === 'uploading'}
            className="px-3 py-1.5 text-sm bg-primary text-primary-foreground rounded-md disabled:opacity-50"
          >
            Upload
          </button>
          <button
            onClick={reset}
            disabled={status === 'uploading'}
            className="px-3 py-1.5 text-sm border rounded-md disabled:opacity-50"
          >
            Reset
          </button>
        </div>
      </div>
    );
  },
};

// Multiple progress bars
export const MultipleProgress: Story = {
  render: () => (
    <div className="space-y-4 w-[300px]">
      <div className="space-y-1">
        <div className="flex justify-between text-sm">
          <span>Tests passed</span>
          <span className="text-emerald-600">85%</span>
        </div>
        <Progress value={85} className="[&>div]:bg-emerald-500" />
      </div>
      <div className="space-y-1">
        <div className="flex justify-between text-sm">
          <span>Tests failed</span>
          <span className="text-red-600">10%</span>
        </div>
        <Progress value={10} className="[&>div]:bg-red-500" />
      </div>
      <div className="space-y-1">
        <div className="flex justify-between text-sm">
          <span>Tests skipped</span>
          <span className="text-amber-600">5%</span>
        </div>
        <Progress value={5} className="[&>div]:bg-amber-500" />
      </div>
    </div>
  ),
};
