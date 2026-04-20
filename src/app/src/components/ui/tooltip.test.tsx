import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from './tooltip';

describe('Tooltip', () => {
  it('renders tooltip trigger', () => {
    render(
      <TooltipProvider delayDuration={0}>
        <Tooltip>
          <TooltipTrigger>Hover me</TooltipTrigger>
          <TooltipContent>Tooltip text</TooltipContent>
        </Tooltip>
      </TooltipProvider>,
    );

    expect(screen.getByText('Hover me')).toBeInTheDocument();
  });

  it('shows tooltip on hover', async () => {
    const user = userEvent.setup();
    render(
      <TooltipProvider delayDuration={0}>
        <Tooltip>
          <TooltipTrigger>Hover me</TooltipTrigger>
          <TooltipContent>Tooltip text</TooltipContent>
        </Tooltip>
      </TooltipProvider>,
    );

    const trigger = screen.getByText('Hover me');
    await user.hover(trigger);

    expect(await screen.findByRole('tooltip')).toHaveTextContent('Tooltip text');
  });

  it('applies custom className to content', async () => {
    const user = userEvent.setup();
    render(
      <TooltipProvider delayDuration={0}>
        <Tooltip>
          <TooltipTrigger>Hover me</TooltipTrigger>
          <TooltipContent className="custom-tooltip">Tooltip text</TooltipContent>
        </Tooltip>
      </TooltipProvider>,
    );

    const trigger = screen.getByText('Hover me');
    await user.hover(trigger);

    const tooltip = await screen.findByRole('tooltip');
    expect(tooltip.parentElement).toHaveClass('custom-tooltip');
  });

  it('applies correct default styles to content', async () => {
    const user = userEvent.setup();
    render(
      <TooltipProvider delayDuration={0}>
        <Tooltip>
          <TooltipTrigger>Hover me</TooltipTrigger>
          <TooltipContent>Tooltip text</TooltipContent>
        </Tooltip>
      </TooltipProvider>,
    );

    const trigger = screen.getByText('Hover me');
    await user.hover(trigger);

    const tooltip = await screen.findByRole('tooltip');
    // Verify base styles are applied
    expect(tooltip.parentElement).toHaveClass('rounded-md', 'bg-foreground', 'text-background');
    // Verify simplified animation (fade only, no zoom/slide)
    expect(tooltip.parentElement).toHaveClass('animate-in', 'fade-in-0', 'duration-100');
  });

  it('supports open state control', async () => {
    render(
      <TooltipProvider delayDuration={0}>
        <Tooltip open={true}>
          <TooltipTrigger>Trigger</TooltipTrigger>
          <TooltipContent>Always visible</TooltipContent>
        </Tooltip>
      </TooltipProvider>,
    );

    expect(await screen.findByRole('tooltip')).toHaveTextContent('Always visible');
  });
});
