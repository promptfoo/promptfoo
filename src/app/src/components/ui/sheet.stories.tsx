import { Button } from './button';
import { Input } from './input';
import { Label } from './label';
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from './sheet';
import type { Meta, StoryObj } from '@storybook/react-vite';

const meta: Meta<typeof Sheet> = {
  title: 'UI/Sheet',
  component: Sheet,
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof Sheet>;

// Default (right side)
export const Default: Story = {
  render: () => (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="outline">Open Sheet</Button>
      </SheetTrigger>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>Sheet Title</SheetTitle>
          <SheetDescription>This is a description of the sheet content.</SheetDescription>
        </SheetHeader>
        <div className="py-4">
          <p className="text-sm text-muted-foreground">Sheet content goes here.</p>
        </div>
        <SheetFooter>
          <SheetClose asChild>
            <Button variant="outline">Cancel</Button>
          </SheetClose>
          <Button>Save</Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  ),
};

// Left side
export const LeftSide: Story = {
  render: () => (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="outline">Open Left Sheet</Button>
      </SheetTrigger>
      <SheetContent side="left">
        <SheetHeader>
          <SheetTitle>Navigation</SheetTitle>
          <SheetDescription>Browse sections of the application.</SheetDescription>
        </SheetHeader>
        <nav className="flex flex-col space-y-2 py-4">
          <a href="#" className="px-2 py-1.5 rounded-md hover:bg-muted">
            Dashboard
          </a>
          <a href="#" className="px-2 py-1.5 rounded-md hover:bg-muted">
            Evaluations
          </a>
          <a href="#" className="px-2 py-1.5 rounded-md hover:bg-muted">
            Red Team
          </a>
          <a href="#" className="px-2 py-1.5 rounded-md hover:bg-muted">
            Settings
          </a>
        </nav>
      </SheetContent>
    </Sheet>
  ),
};

// Top side
export const TopSide: Story = {
  render: () => (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="outline">Open Top Sheet</Button>
      </SheetTrigger>
      <SheetContent side="top">
        <SheetHeader>
          <SheetTitle>Search</SheetTitle>
          <SheetDescription>Search across all your evaluations and tests.</SheetDescription>
        </SheetHeader>
        <div className="py-4">
          <Input placeholder="Search..." />
        </div>
      </SheetContent>
    </Sheet>
  ),
};

// Bottom side
export const BottomSide: Story = {
  render: () => (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="outline">Open Bottom Sheet</Button>
      </SheetTrigger>
      <SheetContent side="bottom">
        <SheetHeader>
          <SheetTitle>Quick Actions</SheetTitle>
          <SheetDescription>Select an action to perform.</SheetDescription>
        </SheetHeader>
        <div className="flex gap-2 py-4">
          <Button variant="outline" className="flex-1">
            New Eval
          </Button>
          <Button variant="outline" className="flex-1">
            New Test
          </Button>
          <Button variant="outline" className="flex-1">
            Import
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  ),
};

// With form
export const WithForm: Story = {
  render: () => (
    <Sheet>
      <SheetTrigger asChild>
        <Button>Edit Profile</Button>
      </SheetTrigger>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>Edit Profile</SheetTitle>
          <SheetDescription>
            Make changes to your profile. Click save when you're done.
          </SheetDescription>
        </SheetHeader>
        <div className="grid gap-4 py-4">
          <div className="grid gap-2">
            <Label htmlFor="name">Name</Label>
            <Input id="name" defaultValue="John Doe" />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="username">Username</Label>
            <Input id="username" defaultValue="@johndoe" />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="email">Email</Label>
            <Input id="email" type="email" defaultValue="john@example.com" />
          </div>
        </div>
        <SheetFooter>
          <SheetClose asChild>
            <Button variant="outline">Cancel</Button>
          </SheetClose>
          <Button>Save changes</Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  ),
};

// All sides
export const AllSides: Story = {
  render: () => (
    <div className="flex gap-2 flex-wrap">
      <Sheet>
        <SheetTrigger asChild>
          <Button variant="outline">Right</Button>
        </SheetTrigger>
        <SheetContent side="right">
          <SheetHeader>
            <SheetTitle>Right Side</SheetTitle>
          </SheetHeader>
          <p className="text-sm text-muted-foreground py-4">This sheet opens from the right.</p>
        </SheetContent>
      </Sheet>
      <Sheet>
        <SheetTrigger asChild>
          <Button variant="outline">Left</Button>
        </SheetTrigger>
        <SheetContent side="left">
          <SheetHeader>
            <SheetTitle>Left Side</SheetTitle>
          </SheetHeader>
          <p className="text-sm text-muted-foreground py-4">This sheet opens from the left.</p>
        </SheetContent>
      </Sheet>
      <Sheet>
        <SheetTrigger asChild>
          <Button variant="outline">Top</Button>
        </SheetTrigger>
        <SheetContent side="top">
          <SheetHeader>
            <SheetTitle>Top Side</SheetTitle>
          </SheetHeader>
          <p className="text-sm text-muted-foreground py-4">This sheet opens from the top.</p>
        </SheetContent>
      </Sheet>
      <Sheet>
        <SheetTrigger asChild>
          <Button variant="outline">Bottom</Button>
        </SheetTrigger>
        <SheetContent side="bottom">
          <SheetHeader>
            <SheetTitle>Bottom Side</SheetTitle>
          </SheetHeader>
          <p className="text-sm text-muted-foreground py-4">This sheet opens from the bottom.</p>
        </SheetContent>
      </Sheet>
    </div>
  ),
};

// Without close button
export const NoCloseButton: Story = {
  render: () => (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="outline">Open Sheet</Button>
      </SheetTrigger>
      <SheetContent hideCloseButton>
        <SheetHeader>
          <SheetTitle>No Close Button</SheetTitle>
          <SheetDescription>
            This sheet has no close button. Use the button below to close.
          </SheetDescription>
        </SheetHeader>
        <div className="py-4">
          <p className="text-sm text-muted-foreground">
            Click outside or use the button below to close.
          </p>
        </div>
        <SheetFooter>
          <SheetClose asChild>
            <Button>Close</Button>
          </SheetClose>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  ),
};
