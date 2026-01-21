import { Button } from './button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from './card';
import { Input } from './input';
import { Label } from './label';
import type { Meta, StoryObj } from '@storybook/react-vite';

const meta: Meta<typeof Card> = {
  title: 'UI/Card',
  component: Card,
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof Card>;

// Default card
export const Default: Story = {
  render: () => (
    <Card className="w-[350px]">
      <CardHeader>
        <CardTitle>Card Title</CardTitle>
        <CardDescription>Card description goes here.</CardDescription>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground">Card content goes here.</p>
      </CardContent>
      <CardFooter>
        <Button>Action</Button>
      </CardFooter>
    </Card>
  ),
};

// Simple card
export const Simple: Story = {
  render: () => (
    <Card className="w-[350px]">
      <CardContent className="pt-6">
        <p className="text-sm text-muted-foreground">A simple card with just content.</p>
      </CardContent>
    </Card>
  ),
};

// Card with form
export const WithForm: Story = {
  render: () => (
    <Card className="w-[350px]">
      <CardHeader>
        <CardTitle>Create Account</CardTitle>
        <CardDescription>Enter your details to create a new account.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="name">Name</Label>
          <Input id="name" placeholder="Enter your name" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="email">Email</Label>
          <Input id="email" type="email" placeholder="Enter your email" />
        </div>
      </CardContent>
      <CardFooter className="flex justify-between">
        <Button variant="outline">Cancel</Button>
        <Button>Create</Button>
      </CardFooter>
    </Card>
  ),
};

// Notification card
export const Notification: Story = {
  render: () => (
    <Card className="w-[350px]">
      <CardHeader>
        <CardTitle>Notifications</CardTitle>
        <CardDescription>You have 3 unread messages.</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          <div className="flex items-start gap-3 rounded-lg border border-border p-3">
            <div className="size-2 mt-1.5 rounded-full bg-primary" />
            <div className="space-y-1">
              <p className="text-sm font-medium">New comment</p>
              <p className="text-xs text-muted-foreground">Someone commented on your post</p>
            </div>
          </div>
          <div className="flex items-start gap-3 rounded-lg border border-border p-3">
            <div className="size-2 mt-1.5 rounded-full bg-primary" />
            <div className="space-y-1">
              <p className="text-sm font-medium">New follower</p>
              <p className="text-xs text-muted-foreground">You have a new follower</p>
            </div>
          </div>
        </div>
      </CardContent>
      <CardFooter>
        <Button variant="outline" className="w-full">
          Mark all as read
        </Button>
      </CardFooter>
    </Card>
  ),
};

// Stats card
export const Stats: Story = {
  render: () => (
    <div className="grid grid-cols-3 gap-4">
      <Card>
        <CardHeader className="pb-2">
          <CardDescription>Total Tests</CardDescription>
          <CardTitle className="text-4xl">1,234</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-xs text-muted-foreground">+12% from last month</p>
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="pb-2">
          <CardDescription>Pass Rate</CardDescription>
          <CardTitle className="text-4xl">89%</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-xs text-muted-foreground">+4% from last month</p>
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="pb-2">
          <CardDescription>Vulnerabilities</CardDescription>
          <CardTitle className="text-4xl">23</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-xs text-destructive">+8 from last month</p>
        </CardContent>
      </Card>
    </div>
  ),
};
