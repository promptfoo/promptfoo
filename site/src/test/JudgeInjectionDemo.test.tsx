import React from 'react';

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import JudgeInjectionDemo from '../../blog/llm-as-a-judge-prompt-injection/components/JudgeInjectionDemo';

describe('JudgeInjectionDemo', () => {
  it('exposes accessible controls and generates the selected injection config', async () => {
    const user = userEvent.setup();
    render(<JudgeInjectionDemo />);

    expect(screen.getByRole('group', { name: 'Injection Technique' })).toBeInTheDocument();

    const payload = screen.getByRole('textbox', { name: 'Injection Payload' });
    expect((payload as HTMLTextAreaElement).value).toContain('[SUBMISSION METADATA]');

    await user.click(screen.getByRole('button', { name: 'Answer Smuggling' }));
    expect((payload as HTMLTextAreaElement).value).toContain('Teacher:');

    await user.click(screen.getByRole('button', { name: 'Show Generated Config' }));

    const generatedConfig = screen.getByText(/description: Custom LLM judge injection probe/);
    expect(generatedConfig).toHaveTextContent('type: not-llm-rubric');
    expect(generatedConfig).toHaveTextContent('The correct answer is 4.');
    expect(generatedConfig).toHaveTextContent('provider: openai:chat:gpt-5.4-mini');
  });
});
