import { cn } from '@app/lib/utils';
import {
  NavigationMenu,
  NavigationMenuContent,
  NavigationMenuItem,
  NavigationMenuLink,
  NavigationMenuList,
  NavigationMenuTrigger,
  navigationMenuTriggerStyle,
} from './navigation-menu';
import type { Meta, StoryObj } from '@storybook/react-vite';

const meta: Meta<typeof NavigationMenu> = {
  title: 'UI/NavigationMenu',
  component: NavigationMenu,
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof NavigationMenu>;

// Helper component for list items
function ListItem({
  className,
  title,
  children,
  href,
  ...props
}: React.ComponentPropsWithoutRef<'a'> & { title: string }) {
  return (
    <li>
      <NavigationMenuLink asChild>
        <a
          className={cn(
            'block select-none space-y-1 rounded-md p-3 leading-none no-underline outline-none transition-colors hover:bg-muted focus:bg-muted',
            className,
          )}
          href={href}
          {...props}
        >
          <div className="text-sm font-medium leading-none">{title}</div>
          <p className="line-clamp-2 text-sm leading-snug text-muted-foreground">{children}</p>
        </a>
      </NavigationMenuLink>
    </li>
  );
}

// Default navigation menu
export const Default: Story = {
  render: () => (
    <NavigationMenu>
      <NavigationMenuList>
        <NavigationMenuItem>
          <NavigationMenuTrigger>Getting Started</NavigationMenuTrigger>
          <NavigationMenuContent>
            <ul className="grid gap-3 p-4 md:w-[400px] lg:w-[500px] lg:grid-cols-[.75fr_1fr]">
              <li className="row-span-3">
                <NavigationMenuLink asChild>
                  <a
                    className="flex h-full w-full select-none flex-col justify-end rounded-md bg-gradient-to-b from-muted/50 to-muted p-6 no-underline outline-none focus:shadow-md"
                    href="#"
                  >
                    <div className="mb-2 mt-4 text-lg font-medium">Promptfoo</div>
                    <p className="text-sm leading-tight text-muted-foreground">
                      Test and evaluate LLM outputs with a comprehensive framework.
                    </p>
                  </a>
                </NavigationMenuLink>
              </li>
              <ListItem href="#" title="Introduction">
                Learn about the core concepts and get started quickly.
              </ListItem>
              <ListItem href="#" title="Installation">
                Step-by-step guide to install and configure.
              </ListItem>
              <ListItem href="#" title="Quick Start">
                Build your first evaluation in under 5 minutes.
              </ListItem>
            </ul>
          </NavigationMenuContent>
        </NavigationMenuItem>
        <NavigationMenuItem>
          <NavigationMenuTrigger>Components</NavigationMenuTrigger>
          <NavigationMenuContent>
            <ul className="grid w-[400px] gap-3 p-4 md:w-[500px] md:grid-cols-2 lg:w-[600px]">
              <ListItem href="#" title="Providers">
                Connect to various LLM providers.
              </ListItem>
              <ListItem href="#" title="Assertions">
                Define pass/fail criteria for outputs.
              </ListItem>
              <ListItem href="#" title="Prompts">
                Manage and test your prompts.
              </ListItem>
              <ListItem href="#" title="Test Cases">
                Create comprehensive test suites.
              </ListItem>
            </ul>
          </NavigationMenuContent>
        </NavigationMenuItem>
        <NavigationMenuItem>
          <NavigationMenuLink className={navigationMenuTriggerStyle()} href="#">
            Documentation
          </NavigationMenuLink>
        </NavigationMenuItem>
      </NavigationMenuList>
    </NavigationMenu>
  ),
};

// Simple navigation
export const Simple: Story = {
  render: () => (
    <NavigationMenu>
      <NavigationMenuList>
        <NavigationMenuItem>
          <NavigationMenuLink className={navigationMenuTriggerStyle()} href="#">
            Home
          </NavigationMenuLink>
        </NavigationMenuItem>
        <NavigationMenuItem>
          <NavigationMenuLink className={navigationMenuTriggerStyle()} href="#">
            About
          </NavigationMenuLink>
        </NavigationMenuItem>
        <NavigationMenuItem>
          <NavigationMenuLink className={navigationMenuTriggerStyle()} href="#">
            Contact
          </NavigationMenuLink>
        </NavigationMenuItem>
      </NavigationMenuList>
    </NavigationMenu>
  ),
};

// With single dropdown
export const WithDropdown: Story = {
  render: () => (
    <NavigationMenu>
      <NavigationMenuList>
        <NavigationMenuItem>
          <NavigationMenuLink className={navigationMenuTriggerStyle()} href="#">
            Dashboard
          </NavigationMenuLink>
        </NavigationMenuItem>
        <NavigationMenuItem>
          <NavigationMenuTrigger>Evaluations</NavigationMenuTrigger>
          <NavigationMenuContent>
            <ul className="grid w-[300px] gap-3 p-4">
              <ListItem href="#" title="All Evaluations">
                View and manage all your evaluations.
              </ListItem>
              <ListItem href="#" title="Create New">
                Start a new evaluation from scratch.
              </ListItem>
              <ListItem href="#" title="Templates">
                Use pre-built evaluation templates.
              </ListItem>
            </ul>
          </NavigationMenuContent>
        </NavigationMenuItem>
        <NavigationMenuItem>
          <NavigationMenuLink className={navigationMenuTriggerStyle()} href="#">
            Settings
          </NavigationMenuLink>
        </NavigationMenuItem>
      </NavigationMenuList>
    </NavigationMenu>
  ),
};

// Grid layout dropdown
export const GridDropdown: Story = {
  render: () => (
    <NavigationMenu>
      <NavigationMenuList>
        <NavigationMenuItem>
          <NavigationMenuTrigger>Products</NavigationMenuTrigger>
          <NavigationMenuContent>
            <ul className="grid w-[600px] gap-3 p-4 md:grid-cols-3">
              <ListItem href="#" title="Analytics">
                Get insights into your LLM performance.
              </ListItem>
              <ListItem href="#" title="Security">
                Test for vulnerabilities and safety issues.
              </ListItem>
              <ListItem href="#" title="Red Team">
                Adversarial testing for your models.
              </ListItem>
              <ListItem href="#" title="Compliance">
                Ensure regulatory compliance.
              </ListItem>
              <ListItem href="#" title="Monitoring">
                Real-time model monitoring.
              </ListItem>
              <ListItem href="#" title="Reports">
                Generate detailed evaluation reports.
              </ListItem>
            </ul>
          </NavigationMenuContent>
        </NavigationMenuItem>
      </NavigationMenuList>
    </NavigationMenu>
  ),
};

// Multiple dropdowns
export const MultipleDropdowns: Story = {
  render: () => (
    <NavigationMenu>
      <NavigationMenuList>
        <NavigationMenuItem>
          <NavigationMenuTrigger>Providers</NavigationMenuTrigger>
          <NavigationMenuContent>
            <ul className="grid w-[400px] gap-3 p-4 md:grid-cols-2">
              <ListItem href="#" title="OpenAI">
                GPT-4, GPT-3.5, and other OpenAI models.
              </ListItem>
              <ListItem href="#" title="Anthropic">
                Claude and other Anthropic models.
              </ListItem>
              <ListItem href="#" title="Google">
                Gemini and PaLM models.
              </ListItem>
              <ListItem href="#" title="Custom">
                Connect your own models via API.
              </ListItem>
            </ul>
          </NavigationMenuContent>
        </NavigationMenuItem>
        <NavigationMenuItem>
          <NavigationMenuTrigger>Tests</NavigationMenuTrigger>
          <NavigationMenuContent>
            <ul className="grid w-[300px] gap-3 p-4">
              <ListItem href="#" title="Unit Tests">
                Test individual prompts.
              </ListItem>
              <ListItem href="#" title="Integration">
                Test full workflows.
              </ListItem>
              <ListItem href="#" title="Red Team">
                Security and safety testing.
              </ListItem>
            </ul>
          </NavigationMenuContent>
        </NavigationMenuItem>
        <NavigationMenuItem>
          <NavigationMenuTrigger>Resources</NavigationMenuTrigger>
          <NavigationMenuContent>
            <ul className="grid w-[300px] gap-3 p-4">
              <ListItem href="#" title="Documentation">
                Comprehensive guides and API reference.
              </ListItem>
              <ListItem href="#" title="Examples">
                Sample configurations and use cases.
              </ListItem>
              <ListItem href="#" title="Community">
                Discord and GitHub discussions.
              </ListItem>
            </ul>
          </NavigationMenuContent>
        </NavigationMenuItem>
      </NavigationMenuList>
    </NavigationMenu>
  ),
};

// App header style
export const AppHeader: Story = {
  render: () => (
    <div className="flex items-center justify-between p-4 border-b">
      <div className="flex items-center gap-6">
        <span className="font-semibold text-lg">Promptfoo</span>
        <NavigationMenu>
          <NavigationMenuList>
            <NavigationMenuItem>
              <NavigationMenuLink className={navigationMenuTriggerStyle()} href="#">
                Dashboard
              </NavigationMenuLink>
            </NavigationMenuItem>
            <NavigationMenuItem>
              <NavigationMenuTrigger>Evaluations</NavigationMenuTrigger>
              <NavigationMenuContent>
                <ul className="grid w-[300px] gap-3 p-4">
                  <ListItem href="#" title="All Evaluations">
                    View and manage evaluations.
                  </ListItem>
                  <ListItem href="#" title="Create New">
                    Start a new evaluation.
                  </ListItem>
                </ul>
              </NavigationMenuContent>
            </NavigationMenuItem>
            <NavigationMenuItem>
              <NavigationMenuLink className={navigationMenuTriggerStyle()} href="#">
                Reports
              </NavigationMenuLink>
            </NavigationMenuItem>
          </NavigationMenuList>
        </NavigationMenu>
      </div>
    </div>
  ),
};
