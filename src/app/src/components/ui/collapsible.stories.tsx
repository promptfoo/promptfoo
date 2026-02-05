import { useState } from 'react';

import { ChevronDown, ChevronsUpDown } from 'lucide-react';
import { Button } from './button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from './collapsible';
import type { Meta, StoryObj } from '@storybook/react-vite';

const meta: Meta<typeof Collapsible> = {
  title: 'UI/Collapsible',
  component: Collapsible,
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof Collapsible>;

// Default collapsible
export const Default: Story = {
  render: () => (
    <Collapsible className="w-[350px] space-y-2">
      <div className="flex items-center justify-between space-x-4 px-4">
        <h4 className="text-sm font-semibold">@peduarte starred 3 repositories</h4>
        <CollapsibleTrigger asChild>
          <Button variant="ghost" size="sm" className="w-9 p-0">
            <ChevronsUpDown className="h-4 w-4" />
            <span className="sr-only">Toggle</span>
          </Button>
        </CollapsibleTrigger>
      </div>
      <div className="rounded-md border px-4 py-3 font-mono text-sm">@radix-ui/primitives</div>
      <CollapsibleContent className="space-y-2">
        <div className="rounded-md border px-4 py-3 font-mono text-sm">@radix-ui/colors</div>
        <div className="rounded-md border px-4 py-3 font-mono text-sm">@stitches/react</div>
      </CollapsibleContent>
    </Collapsible>
  ),
};

// Controlled collapsible
export const Controlled: Story = {
  render: function ControlledCollapsible() {
    const [isOpen, setIsOpen] = useState(false);

    return (
      <Collapsible open={isOpen} onOpenChange={setIsOpen} className="w-[350px] space-y-2">
        <div className="flex items-center justify-between space-x-4 px-4">
          <h4 className="text-sm font-semibold">Show details ({isOpen ? 'open' : 'closed'})</h4>
          <CollapsibleTrigger asChild>
            <Button variant="ghost" size="sm" className="w-9 p-0">
              <ChevronDown
                className={`h-4 w-4 transition-transform ${isOpen ? 'rotate-180' : ''}`}
              />
              <span className="sr-only">Toggle</span>
            </Button>
          </CollapsibleTrigger>
        </div>
        <CollapsibleContent className="space-y-2">
          <div className="rounded-md border px-4 py-3 text-sm">
            <p>This content is collapsible.</p>
            <p className="text-muted-foreground mt-2">It can contain any React content.</p>
          </div>
        </CollapsibleContent>
      </Collapsible>
    );
  },
};

// FAQ example
export const FAQExample: Story = {
  render: function FAQCollapsible() {
    const [openItems, setOpenItems] = useState<number[]>([]);

    const toggleItem = (index: number) => {
      setOpenItems((prev) =>
        prev.includes(index) ? prev.filter((i) => i !== index) : [...prev, index],
      );
    };

    const faqs = [
      {
        question: 'What is Promptfoo?',
        answer:
          'Promptfoo is an open-source framework for evaluating and testing LLM applications. It helps you ensure your prompts are working correctly.',
      },
      {
        question: 'How do I get started?',
        answer:
          'You can get started by installing promptfoo via npm and running your first evaluation. Check out our documentation for detailed guides.',
      },
      {
        question: 'Is it free to use?',
        answer:
          'Yes, Promptfoo is completely open-source and free to use. You can self-host it or use our cloud offering.',
      },
    ];

    return (
      <div className="w-[400px] space-y-2">
        <h3 className="text-lg font-semibold mb-4">Frequently Asked Questions</h3>
        {faqs.map((faq, index) => (
          <Collapsible
            key={index}
            open={openItems.includes(index)}
            onOpenChange={() => toggleItem(index)}
          >
            <CollapsibleTrigger className="flex w-full items-center justify-between rounded-lg border p-4 hover:bg-muted/50 cursor-pointer">
              <span className="text-sm font-medium text-left">{faq.question}</span>
              <ChevronDown
                className={`h-4 w-4 shrink-0 transition-transform ${openItems.includes(index) ? 'rotate-180' : ''}`}
              />
            </CollapsibleTrigger>
            <CollapsibleContent className="px-4 pb-4">
              <p className="text-sm text-muted-foreground pt-2">{faq.answer}</p>
            </CollapsibleContent>
          </Collapsible>
        ))}
      </div>
    );
  },
};

// Settings panel
export const SettingsPanel: Story = {
  render: function SettingsPanelCollapsible() {
    const [openSections, setOpenSections] = useState<string[]>(['general']);

    const toggleSection = (section: string) => {
      setOpenSections((prev) =>
        prev.includes(section) ? prev.filter((s) => s !== section) : [...prev, section],
      );
    };

    return (
      <div className="w-[350px] space-y-2 border rounded-lg p-2">
        <Collapsible
          open={openSections.includes('general')}
          onOpenChange={() => toggleSection('general')}
        >
          <CollapsibleTrigger className="flex w-full items-center justify-between rounded-md p-2 hover:bg-muted/50 cursor-pointer">
            <span className="text-sm font-medium">General Settings</span>
            <ChevronDown
              className={`h-4 w-4 transition-transform ${openSections.includes('general') ? 'rotate-180' : ''}`}
            />
          </CollapsibleTrigger>
          <CollapsibleContent className="px-2 pb-2 space-y-2">
            <div className="flex items-center justify-between py-1">
              <span className="text-sm">Dark mode</span>
              <input type="checkbox" />
            </div>
            <div className="flex items-center justify-between py-1">
              <span className="text-sm">Notifications</span>
              <input type="checkbox" defaultChecked />
            </div>
          </CollapsibleContent>
        </Collapsible>

        <Collapsible
          open={openSections.includes('advanced')}
          onOpenChange={() => toggleSection('advanced')}
        >
          <CollapsibleTrigger className="flex w-full items-center justify-between rounded-md p-2 hover:bg-muted/50 cursor-pointer">
            <span className="text-sm font-medium">Advanced Settings</span>
            <ChevronDown
              className={`h-4 w-4 transition-transform ${openSections.includes('advanced') ? 'rotate-180' : ''}`}
            />
          </CollapsibleTrigger>
          <CollapsibleContent className="px-2 pb-2 space-y-2">
            <div className="flex items-center justify-between py-1">
              <span className="text-sm">Debug mode</span>
              <input type="checkbox" />
            </div>
            <div className="flex items-center justify-between py-1">
              <span className="text-sm">Cache results</span>
              <input type="checkbox" defaultChecked />
            </div>
          </CollapsibleContent>
        </Collapsible>
      </div>
    );
  },
};
