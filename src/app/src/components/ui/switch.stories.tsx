import { useState } from 'react';

import { Label } from './label';
import { Switch } from './switch';
import type { Meta, StoryObj } from '@storybook/react-vite';

const meta: Meta<typeof Switch> = {
  title: 'UI/Switch',
  component: Switch,
  tags: ['autodocs'],
  argTypes: {
    checked: {
      control: 'boolean',
      description: 'Whether the switch is checked',
    },
    disabled: {
      control: 'boolean',
      description: 'Whether the switch is disabled',
    },
  },
};

export default meta;
type Story = StoryObj<typeof Switch>;

// Default switch
export const Default: Story = {
  args: {},
};

// Checked state
export const Checked: Story = {
  args: {
    checked: true,
  },
};

// With label
export const WithLabel: Story = {
  render: () => (
    <div className="flex items-center space-x-2">
      <Switch id="airplane-mode" />
      <Label htmlFor="airplane-mode">Airplane Mode</Label>
    </div>
  ),
};

// Disabled states
export const Disabled: Story = {
  render: () => (
    <div className="space-y-4">
      <div className="flex items-center space-x-2">
        <Switch id="disabled-off" disabled />
        <Label htmlFor="disabled-off" className="text-muted-foreground">
          Disabled (off)
        </Label>
      </div>
      <div className="flex items-center space-x-2">
        <Switch id="disabled-on" disabled checked />
        <Label htmlFor="disabled-on" className="text-muted-foreground">
          Disabled (on)
        </Label>
      </div>
    </div>
  ),
};

// Interactive example
export const Interactive: Story = {
  render: function InteractiveSwitch() {
    const [checked, setChecked] = useState(false);
    return (
      <div className="space-y-4">
        <div className="flex items-center space-x-2">
          <Switch id="interactive" checked={checked} onCheckedChange={setChecked} />
          <Label htmlFor="interactive">Enable notifications</Label>
        </div>
        <p className="text-sm text-muted-foreground">
          Notifications are: {checked ? 'enabled' : 'disabled'}
        </p>
      </div>
    );
  },
};

// Settings example
export const SettingsExample: Story = {
  render: function SettingsPanel() {
    const [settings, setSettings] = useState({
      email: true,
      push: false,
      marketing: false,
    });

    const updateSetting = (key: keyof typeof settings) => {
      setSettings((prev) => ({ ...prev, [key]: !prev[key] }));
    };

    return (
      <div className="space-y-6 w-[300px]">
        <h3 className="text-lg font-medium">Notification Settings</h3>
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label htmlFor="email-notif">Email notifications</Label>
              <p className="text-xs text-muted-foreground">Receive emails about your account</p>
            </div>
            <Switch
              id="email-notif"
              checked={settings.email}
              onCheckedChange={() => updateSetting('email')}
            />
          </div>
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label htmlFor="push-notif">Push notifications</Label>
              <p className="text-xs text-muted-foreground">Receive push notifications</p>
            </div>
            <Switch
              id="push-notif"
              checked={settings.push}
              onCheckedChange={() => updateSetting('push')}
            />
          </div>
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label htmlFor="marketing">Marketing emails</Label>
              <p className="text-xs text-muted-foreground">Receive emails about new products</p>
            </div>
            <Switch
              id="marketing"
              checked={settings.marketing}
              onCheckedChange={() => updateSetting('marketing')}
            />
          </div>
        </div>
      </div>
    );
  },
};

// All states
export const AllStates: Story = {
  render: () => (
    <div className="flex gap-8">
      <div className="space-y-2">
        <p className="text-sm font-medium">Off</p>
        <Switch />
      </div>
      <div className="space-y-2">
        <p className="text-sm font-medium">On</p>
        <Switch checked />
      </div>
      <div className="space-y-2">
        <p className="text-sm font-medium">Disabled (off)</p>
        <Switch disabled />
      </div>
      <div className="space-y-2">
        <p className="text-sm font-medium">Disabled (on)</p>
        <Switch disabled checked />
      </div>
    </div>
  ),
};
