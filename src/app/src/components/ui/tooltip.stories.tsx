import { HelpCircle, Info, Settings } from 'lucide-react';
import { Button } from './button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from './tooltip';
import type { Meta, StoryObj } from '@storybook/react-vite';

const meta: Meta<typeof Tooltip> = {
  title: 'UI/Tooltip',
  component: Tooltip,
  tags: ['autodocs'],
  decorators: [
    (Story) => (
      <TooltipProvider>
        <Story />
      </TooltipProvider>
    ),
  ],
};

export default meta;
type Story = StoryObj<typeof Tooltip>;

// Default tooltip
export const Default: Story = {
  render: () => (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button variant="outline">Hover me</Button>
      </TooltipTrigger>
      <TooltipContent>
        <p>This is a tooltip</p>
      </TooltipContent>
    </Tooltip>
  ),
};

// Different positions
export const Positions: Story = {
  render: () => (
    <div className="flex items-center justify-center gap-8 p-20">
      <Tooltip>
        <TooltipTrigger asChild>
          <Button variant="outline">Top</Button>
        </TooltipTrigger>
        <TooltipContent side="top">
          <p>Tooltip on top</p>
        </TooltipContent>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button variant="outline">Right</Button>
        </TooltipTrigger>
        <TooltipContent side="right">
          <p>Tooltip on right</p>
        </TooltipContent>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button variant="outline">Bottom</Button>
        </TooltipTrigger>
        <TooltipContent side="bottom">
          <p>Tooltip on bottom</p>
        </TooltipContent>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button variant="outline">Left</Button>
        </TooltipTrigger>
        <TooltipContent side="left">
          <p>Tooltip on left</p>
        </TooltipContent>
      </Tooltip>
    </div>
  ),
};

// On icon button
export const OnIconButton: Story = {
  render: () => (
    <div className="flex items-center gap-4">
      <Tooltip>
        <TooltipTrigger asChild>
          <Button variant="ghost" size="icon">
            <Settings className="size-4" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>
          <p>Settings</p>
        </TooltipContent>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button variant="ghost" size="icon">
            <HelpCircle className="size-4" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>
          <p>Help</p>
        </TooltipContent>
      </Tooltip>
    </div>
  ),
};

// With delay
export const WithDelay: Story = {
  render: () => (
    <TooltipProvider delayDuration={700}>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button variant="outline">Delayed tooltip (700ms)</Button>
        </TooltipTrigger>
        <TooltipContent>
          <p>This tooltip has a longer delay</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  ),
};

// Help text example
export const HelpText: Story = {
  render: () => (
    <div className="flex items-center gap-2">
      <span className="text-sm">API Key</span>
      <Tooltip>
        <TooltipTrigger asChild>
          <button className="cursor-help">
            <Info className="size-4 text-muted-foreground" />
          </button>
        </TooltipTrigger>
        <TooltipContent className="max-w-xs">
          <p>
            Your API key is used to authenticate requests. Keep it secret and never share it
            publicly.
          </p>
        </TooltipContent>
      </Tooltip>
    </div>
  ),
};

// Disabled button with tooltip
export const DisabledButtonTooltip: Story = {
  render: () => (
    <Tooltip>
      <TooltipTrigger asChild>
        <span tabIndex={0}>
          <Button disabled>Disabled Button</Button>
        </span>
      </TooltipTrigger>
      <TooltipContent>
        <p>This button is disabled because you don't have permission</p>
      </TooltipContent>
    </Tooltip>
  ),
};

// Multiple tooltips
export const MultipleTooltips: Story = {
  render: () => (
    <div className="flex gap-2">
      <Tooltip>
        <TooltipTrigger asChild>
          <Button size="icon" variant="outline">
            1
          </Button>
        </TooltipTrigger>
        <TooltipContent>First action</TooltipContent>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button size="icon" variant="outline">
            2
          </Button>
        </TooltipTrigger>
        <TooltipContent>Second action</TooltipContent>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button size="icon" variant="outline">
            3
          </Button>
        </TooltipTrigger>
        <TooltipContent>Third action</TooltipContent>
      </Tooltip>
    </div>
  ),
};
