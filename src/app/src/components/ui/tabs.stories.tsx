import { Home, Settings, User } from 'lucide-react';
import { Button } from './button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from './card';
import { Input } from './input';
import { Label } from './label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './tabs';
import type { Meta, StoryObj } from '@storybook/react-vite';

const meta: Meta<typeof Tabs> = {
  title: 'UI/Tabs',
  component: Tabs,
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof Tabs>;

// Default tabs
export const Default: Story = {
  render: () => (
    <Tabs defaultValue="tab1" className="w-[400px]">
      <TabsList>
        <TabsTrigger value="tab1">Tab 1</TabsTrigger>
        <TabsTrigger value="tab2">Tab 2</TabsTrigger>
        <TabsTrigger value="tab3">Tab 3</TabsTrigger>
      </TabsList>
      <TabsContent value="tab1">
        <p className="text-sm text-muted-foreground">Content for Tab 1</p>
      </TabsContent>
      <TabsContent value="tab2">
        <p className="text-sm text-muted-foreground">Content for Tab 2</p>
      </TabsContent>
      <TabsContent value="tab3">
        <p className="text-sm text-muted-foreground">Content for Tab 3</p>
      </TabsContent>
    </Tabs>
  ),
};

// With cards
export const WithCards: Story = {
  render: () => (
    <Tabs defaultValue="account" className="w-[400px]">
      <TabsList className="grid w-full grid-cols-2">
        <TabsTrigger value="account">Account</TabsTrigger>
        <TabsTrigger value="password">Password</TabsTrigger>
      </TabsList>
      <TabsContent value="account">
        <Card>
          <CardHeader>
            <CardTitle>Account</CardTitle>
            <CardDescription>Make changes to your account here.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="space-y-1">
              <Label htmlFor="name">Name</Label>
              <Input id="name" defaultValue="John Doe" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="username">Username</Label>
              <Input id="username" defaultValue="@johndoe" />
            </div>
          </CardContent>
          <CardFooter>
            <Button>Save changes</Button>
          </CardFooter>
        </Card>
      </TabsContent>
      <TabsContent value="password">
        <Card>
          <CardHeader>
            <CardTitle>Password</CardTitle>
            <CardDescription>Change your password here.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="space-y-1">
              <Label htmlFor="current">Current password</Label>
              <Input id="current" type="password" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="new">New password</Label>
              <Input id="new" type="password" />
            </div>
          </CardContent>
          <CardFooter>
            <Button>Update password</Button>
          </CardFooter>
        </Card>
      </TabsContent>
    </Tabs>
  ),
};

// Many tabs
export const ManyTabs: Story = {
  render: () => (
    <Tabs defaultValue="overview" className="w-full">
      <TabsList>
        <TabsTrigger value="overview">Overview</TabsTrigger>
        <TabsTrigger value="analytics">Analytics</TabsTrigger>
        <TabsTrigger value="reports">Reports</TabsTrigger>
        <TabsTrigger value="notifications">Notifications</TabsTrigger>
        <TabsTrigger value="settings">Settings</TabsTrigger>
      </TabsList>
      <TabsContent value="overview">
        <div className="p-4 border rounded-lg mt-2">
          <h3 className="font-medium">Overview</h3>
          <p className="text-sm text-muted-foreground mt-2">
            View your dashboard overview and key metrics.
          </p>
        </div>
      </TabsContent>
      <TabsContent value="analytics">
        <div className="p-4 border rounded-lg mt-2">
          <h3 className="font-medium">Analytics</h3>
          <p className="text-sm text-muted-foreground mt-2">Analyze your data and trends.</p>
        </div>
      </TabsContent>
      <TabsContent value="reports">
        <div className="p-4 border rounded-lg mt-2">
          <h3 className="font-medium">Reports</h3>
          <p className="text-sm text-muted-foreground mt-2">Generate and view reports.</p>
        </div>
      </TabsContent>
      <TabsContent value="notifications">
        <div className="p-4 border rounded-lg mt-2">
          <h3 className="font-medium">Notifications</h3>
          <p className="text-sm text-muted-foreground mt-2">
            Manage your notification preferences.
          </p>
        </div>
      </TabsContent>
      <TabsContent value="settings">
        <div className="p-4 border rounded-lg mt-2">
          <h3 className="font-medium">Settings</h3>
          <p className="text-sm text-muted-foreground mt-2">Configure your account settings.</p>
        </div>
      </TabsContent>
    </Tabs>
  ),
};

// Disabled tab
export const DisabledTab: Story = {
  render: () => (
    <Tabs defaultValue="active" className="w-[400px]">
      <TabsList>
        <TabsTrigger value="active">Active</TabsTrigger>
        <TabsTrigger value="disabled" disabled>
          Disabled
        </TabsTrigger>
        <TabsTrigger value="another">Another</TabsTrigger>
      </TabsList>
      <TabsContent value="active">
        <p className="text-sm text-muted-foreground">This tab is active.</p>
      </TabsContent>
      <TabsContent value="disabled">
        <p className="text-sm text-muted-foreground">This content won't be shown.</p>
      </TabsContent>
      <TabsContent value="another">
        <p className="text-sm text-muted-foreground">Another active tab.</p>
      </TabsContent>
    </Tabs>
  ),
};

// Full width tabs using fullWidth prop
export const FullWidth: Story = {
  render: () => (
    <Tabs defaultValue="all" className="w-full">
      <TabsList fullWidth>
        <TabsTrigger value="all" className="flex-1">
          All
        </TabsTrigger>
        <TabsTrigger value="passed" className="flex-1">
          Passed
        </TabsTrigger>
        <TabsTrigger value="failed" className="flex-1">
          Failed
        </TabsTrigger>
      </TabsList>
      <TabsContent value="all">
        <p className="text-sm text-muted-foreground p-4">Showing all results</p>
      </TabsContent>
      <TabsContent value="passed">
        <p className="text-sm text-muted-foreground p-4">Showing passed results</p>
      </TabsContent>
      <TabsContent value="failed">
        <p className="text-sm text-muted-foreground p-4">Showing failed results</p>
      </TabsContent>
    </Tabs>
  ),
};

// Line variant
export const LineVariant: Story = {
  render: () => (
    <Tabs defaultValue="overview" className="w-full">
      <TabsList variant="line">
        <TabsTrigger value="overview">Overview</TabsTrigger>
        <TabsTrigger value="analytics">Analytics</TabsTrigger>
        <TabsTrigger value="reports">Reports</TabsTrigger>
      </TabsList>
      <TabsContent value="overview">
        <div className="p-4">
          <h3 className="font-medium">Overview</h3>
          <p className="text-sm text-muted-foreground mt-2">
            View your dashboard overview and key metrics.
          </p>
        </div>
      </TabsContent>
      <TabsContent value="analytics">
        <div className="p-4">
          <h3 className="font-medium">Analytics</h3>
          <p className="text-sm text-muted-foreground mt-2">Analyze your data and trends.</p>
        </div>
      </TabsContent>
      <TabsContent value="reports">
        <div className="p-4">
          <h3 className="font-medium">Reports</h3>
          <p className="text-sm text-muted-foreground mt-2">Generate and view reports.</p>
        </div>
      </TabsContent>
    </Tabs>
  ),
};

// Vertical orientation with pill variant
export const VerticalPill: Story = {
  render: () => (
    <Tabs defaultValue="home" orientation="vertical" className="flex gap-4 w-full">
      <TabsList>
        <TabsTrigger value="home">Home</TabsTrigger>
        <TabsTrigger value="profile">Profile</TabsTrigger>
        <TabsTrigger value="settings">Settings</TabsTrigger>
      </TabsList>
      <div className="flex-1">
        <TabsContent value="home">
          <div className="p-4 border rounded-lg">
            <h3 className="font-medium">Home</h3>
            <p className="text-sm text-muted-foreground mt-2">Welcome to your dashboard.</p>
          </div>
        </TabsContent>
        <TabsContent value="profile">
          <div className="p-4 border rounded-lg">
            <h3 className="font-medium">Profile</h3>
            <p className="text-sm text-muted-foreground mt-2">Manage your profile settings.</p>
          </div>
        </TabsContent>
        <TabsContent value="settings">
          <div className="p-4 border rounded-lg">
            <h3 className="font-medium">Settings</h3>
            <p className="text-sm text-muted-foreground mt-2">Configure your application.</p>
          </div>
        </TabsContent>
      </div>
    </Tabs>
  ),
};

// Vertical orientation with line variant
export const VerticalLine: Story = {
  render: () => (
    <Tabs defaultValue="home" orientation="vertical" className="flex gap-4 w-full">
      <TabsList variant="line">
        <TabsTrigger value="home">Home</TabsTrigger>
        <TabsTrigger value="profile">Profile</TabsTrigger>
        <TabsTrigger value="settings">Settings</TabsTrigger>
      </TabsList>
      <div className="flex-1">
        <TabsContent value="home">
          <div className="p-4 border rounded-lg">
            <h3 className="font-medium">Home</h3>
            <p className="text-sm text-muted-foreground mt-2">Welcome to your dashboard.</p>
          </div>
        </TabsContent>
        <TabsContent value="profile">
          <div className="p-4 border rounded-lg">
            <h3 className="font-medium">Profile</h3>
            <p className="text-sm text-muted-foreground mt-2">Manage your profile settings.</p>
          </div>
        </TabsContent>
        <TabsContent value="settings">
          <div className="p-4 border rounded-lg">
            <h3 className="font-medium">Settings</h3>
            <p className="text-sm text-muted-foreground mt-2">Configure your application.</p>
          </div>
        </TabsContent>
      </div>
    </Tabs>
  ),
};

// With icons
export const WithIcons: Story = {
  render: () => (
    <Tabs defaultValue="home" className="w-[400px]">
      <TabsList>
        <TabsTrigger value="home" icon={<Home />}>
          Home
        </TabsTrigger>
        <TabsTrigger value="profile" icon={<User />}>
          Profile
        </TabsTrigger>
        <TabsTrigger value="settings" icon={<Settings />}>
          Settings
        </TabsTrigger>
      </TabsList>
      <TabsContent value="home">
        <p className="text-sm text-muted-foreground">Home content</p>
      </TabsContent>
      <TabsContent value="profile">
        <p className="text-sm text-muted-foreground">Profile content</p>
      </TabsContent>
      <TabsContent value="settings">
        <p className="text-sm text-muted-foreground">Settings content</p>
      </TabsContent>
    </Tabs>
  ),
};

// With icons at end
export const WithIconsEnd: Story = {
  render: () => (
    <Tabs defaultValue="home" className="w-[400px]">
      <TabsList>
        <TabsTrigger value="home" icon={<Home />} iconPosition="end">
          Home
        </TabsTrigger>
        <TabsTrigger value="profile" icon={<User />} iconPosition="end">
          Profile
        </TabsTrigger>
        <TabsTrigger value="settings" icon={<Settings />} iconPosition="end">
          Settings
        </TabsTrigger>
      </TabsList>
      <TabsContent value="home">
        <p className="text-sm text-muted-foreground">Home content</p>
      </TabsContent>
      <TabsContent value="profile">
        <p className="text-sm text-muted-foreground">Profile content</p>
      </TabsContent>
      <TabsContent value="settings">
        <p className="text-sm text-muted-foreground">Settings content</p>
      </TabsContent>
    </Tabs>
  ),
};

// Line variant with icons
export const LineWithIcons: Story = {
  render: () => (
    <Tabs defaultValue="home" className="w-full">
      <TabsList variant="line">
        <TabsTrigger value="home" icon={<Home />}>
          Home
        </TabsTrigger>
        <TabsTrigger value="profile" icon={<User />}>
          Profile
        </TabsTrigger>
        <TabsTrigger value="settings" icon={<Settings />}>
          Settings
        </TabsTrigger>
      </TabsList>
      <TabsContent value="home">
        <div className="p-4">
          <p className="text-sm text-muted-foreground">Home content</p>
        </div>
      </TabsContent>
      <TabsContent value="profile">
        <div className="p-4">
          <p className="text-sm text-muted-foreground">Profile content</p>
        </div>
      </TabsContent>
      <TabsContent value="settings">
        <div className="p-4">
          <p className="text-sm text-muted-foreground">Settings content</p>
        </div>
      </TabsContent>
    </Tabs>
  ),
};
