import { useState } from 'react';

import {
  AlertTriangle,
  Bug,
  CheckCircle,
  Database,
  FileText,
  GraduationCap,
  History,
  Key,
  LayoutDashboard,
  Lock,
  Settings,
  Shield,
  SlidersHorizontal,
  User,
  Users,
  XCircle,
} from 'lucide-react';
import { type NavigationItem, NavigationSidebar } from './navigation-sidebar';
import type { Meta, StoryObj } from '@storybook/react-vite';

const meta: Meta<typeof NavigationSidebar> = {
  title: 'UI/NavigationSidebar',
  component: NavigationSidebar,
  tags: ['autodocs'],
  parameters: {
    layout: 'fullscreen',
  },
  decorators: [
    (Story) => (
      <div className="flex h-[500px] bg-muted/30">
        <Story />
        <div className="flex-1 p-8">
          <div className="rounded-lg border border-border bg-background p-6">
            <h2 className="text-lg font-semibold">Content Area</h2>
            <p className="text-sm text-muted-foreground mt-2">
              This is where your page content would go.
            </p>
          </div>
        </div>
      </div>
    ),
  ],
};

export default meta;
type Story = StoryObj<typeof NavigationSidebar>;

const defaultItems: NavigationItem[] = [
  { id: 'dashboard', label: 'Dashboard', icon: <LayoutDashboard className="size-4" /> },
  { id: 'settings', label: 'Settings', icon: <Settings className="size-4" /> },
  { id: 'vulnerabilities', label: 'Vulnerabilities', icon: <Bug className="size-4" /> },
  { id: 'history', label: 'Scan History', icon: <History className="size-4" /> },
];

export const Default: Story = {
  render: () => {
    const [activeId, setActiveId] = useState('dashboard');
    return <NavigationSidebar items={defaultItems} activeId={activeId} onNavigate={setActiveId} />;
  },
};

const itemsWithDisabled: NavigationItem[] = [
  { id: 'dashboard', label: 'Dashboard', icon: <LayoutDashboard className="size-4" /> },
  {
    id: 'settings',
    label: 'Settings',
    icon: <Settings className="size-4" />,
    disabled: true,
    tooltip: 'Only available for cloud targets',
  },
  { id: 'vulnerabilities', label: 'Vulnerabilities', icon: <Bug className="size-4" /> },
  { id: 'history', label: 'Scan History', icon: <History className="size-4" /> },
  {
    id: 'grading',
    label: 'Grading Examples',
    icon: <GraduationCap className="size-4" />,
    disabled: true,
    tooltip: 'Upgrade to Pro to access this feature',
  },
  { id: 'severities', label: 'Plugin Severities', icon: <SlidersHorizontal className="size-4" /> },
];

export const WithDisabledItems: Story = {
  render: () => {
    const [activeId, setActiveId] = useState('dashboard');
    return (
      <NavigationSidebar items={itemsWithDisabled} activeId={activeId} onNavigate={setActiveId} />
    );
  },
};

export const WithHeader: Story = {
  render: () => {
    const [activeId, setActiveId] = useState('dashboard');
    return (
      <NavigationSidebar
        items={defaultItems}
        activeId={activeId}
        onNavigate={setActiveId}
        header={
          <div className="rounded-md border border-border bg-muted/50 px-3 py-2">
            <p className="text-xs font-medium text-muted-foreground">Current Target</p>
            <p className="text-sm font-semibold truncate">Production API v2</p>
          </div>
        }
      />
    );
  },
};

export const WithFooter: Story = {
  render: () => {
    const [activeId, setActiveId] = useState('dashboard');
    return (
      <NavigationSidebar
        items={defaultItems}
        activeId={activeId}
        onNavigate={setActiveId}
        footer={
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Users className="size-4" />
            <span>Team Settings</span>
          </div>
        }
      />
    );
  },
};

const simpleItems: NavigationItem[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'analytics', label: 'Analytics' },
  { id: 'reports', label: 'Reports' },
  { id: 'settings', label: 'Settings' },
];

export const WithoutIcons: Story = {
  render: () => {
    const [activeId, setActiveId] = useState('overview');
    return <NavigationSidebar items={simpleItems} activeId={activeId} onNavigate={setActiveId} />;
  },
};

const itemsWithStatus: NavigationItem[] = [
  {
    id: 'dashboard',
    label: 'Dashboard',
    icon: <LayoutDashboard className="size-4" />,
    status: 'success',
  },
  {
    id: 'vulnerabilities',
    label: 'Vulnerabilities',
    icon: <Bug className="size-4" />,
    status: 'error',
    tooltip: '3 critical vulnerabilities found',
  },
  {
    id: 'settings',
    label: 'Settings',
    icon: <Settings className="size-4" />,
    status: 'warning',
    tooltip: 'Configuration incomplete',
  },
  {
    id: 'history',
    label: 'Scan History',
    icon: <History className="size-4" />,
    status: 'info',
  },
];

export const WithStatusIndicators: Story = {
  render: () => {
    const [activeId, setActiveId] = useState('dashboard');
    return (
      <NavigationSidebar items={itemsWithStatus} activeId={activeId} onNavigate={setActiveId} />
    );
  },
};

const itemsWithStatusIcons: NavigationItem[] = [
  {
    id: 'dashboard',
    label: 'Dashboard',
    icon: <LayoutDashboard className="size-4" />,
    status: 'success',
    statusIcon: <CheckCircle className="size-4" />,
  },
  {
    id: 'vulnerabilities',
    label: 'Vulnerabilities',
    icon: <Bug className="size-4" />,
    status: 'error',
    statusIcon: <XCircle className="size-4" />,
    tooltip: '3 critical vulnerabilities found',
  },
  {
    id: 'settings',
    label: 'Settings',
    icon: <Settings className="size-4" />,
    status: 'warning',
    statusIcon: <AlertTriangle className="size-4" />,
    tooltip: 'Configuration incomplete',
  },
  { id: 'history', label: 'Scan History', icon: <History className="size-4" /> },
];

export const WithStatusIcons: Story = {
  render: () => {
    const [activeId, setActiveId] = useState('dashboard');
    return (
      <NavigationSidebar
        items={itemsWithStatusIcons}
        activeId={activeId}
        onNavigate={setActiveId}
      />
    );
  },
};

const nestedItems: NavigationItem[] = [
  { id: 'dashboard', label: 'Dashboard', icon: <LayoutDashboard className="size-4" /> },
  {
    id: 'settings',
    label: 'Settings',
    icon: <Settings className="size-4" />,
    defaultExpanded: true,
    children: [
      { id: 'settings-general', label: 'General', icon: <SlidersHorizontal className="size-4" /> },
      { id: 'settings-profile', label: 'Profile', icon: <User className="size-4" /> },
      {
        id: 'settings-security',
        label: 'Security',
        icon: <Shield className="size-4" />,
        children: [
          {
            id: 'settings-security-auth',
            label: 'Authentication',
            icon: <Key className="size-4" />,
          },
          {
            id: 'settings-security-permissions',
            label: 'Permissions',
            icon: <Lock className="size-4" />,
          },
        ],
      },
    ],
  },
  {
    id: 'data',
    label: 'Data',
    icon: <Database className="size-4" />,
    children: [
      { id: 'data-imports', label: 'Imports' },
      { id: 'data-exports', label: 'Exports' },
    ],
  },
  { id: 'history', label: 'History', icon: <History className="size-4" /> },
];

export const NestedItems: Story = {
  render: () => {
    const [activeId, setActiveId] = useState('dashboard');
    return <NavigationSidebar items={nestedItems} activeId={activeId} onNavigate={setActiveId} />;
  },
};

const deeplyNestedItems: NavigationItem[] = [
  { id: 'home', label: 'Home', icon: <LayoutDashboard className="size-4" /> },
  {
    id: 'docs',
    label: 'Documentation',
    icon: <FileText className="size-4" />,
    defaultExpanded: true,
    children: [
      {
        id: 'docs-guides',
        label: 'Guides',
        defaultExpanded: true,
        children: [
          {
            id: 'docs-guides-getting-started',
            label: 'Getting Started',
            children: [
              { id: 'docs-guides-getting-started-install', label: 'Installation' },
              { id: 'docs-guides-getting-started-config', label: 'Configuration' },
              { id: 'docs-guides-getting-started-first-run', label: 'First Run' },
            ],
          },
          { id: 'docs-guides-advanced', label: 'Advanced Usage' },
        ],
      },
      { id: 'docs-api', label: 'API Reference' },
      { id: 'docs-faq', label: 'FAQ' },
    ],
  },
  { id: 'support', label: 'Support', icon: <Users className="size-4" /> },
];

export const DeeplyNested: Story = {
  render: () => {
    const [activeId, setActiveId] = useState('home');
    return (
      <NavigationSidebar items={deeplyNestedItems} activeId={activeId} onNavigate={setActiveId} />
    );
  },
};

const nestedWithStatus: NavigationItem[] = [
  {
    id: 'dashboard',
    label: 'Dashboard',
    icon: <LayoutDashboard className="size-4" />,
    status: 'success',
  },
  {
    id: 'security',
    label: 'Security',
    icon: <Shield className="size-4" />,
    defaultExpanded: true,
    children: [
      { id: 'security-auth', label: 'Authentication', status: 'success' },
      {
        id: 'security-permissions',
        label: 'Permissions',
        status: 'warning',
        tooltip: '2 roles need review',
      },
      {
        id: 'security-audit',
        label: 'Audit Log',
        status: 'error',
        tooltip: '5 failed login attempts',
      },
    ],
  },
  { id: 'settings', label: 'Settings', icon: <Settings className="size-4" /> },
];

export const NestedWithStatus: Story = {
  render: () => {
    const [activeId, setActiveId] = useState('dashboard');
    return (
      <NavigationSidebar items={nestedWithStatus} activeId={activeId} onNavigate={setActiveId} />
    );
  },
};

const itemsWithGroups: NavigationItem[] = [
  { id: 'dashboard', label: 'Dashboard', icon: <LayoutDashboard className="size-4" /> },
  {
    id: 'main-group',
    label: 'Main',
    group: true,
    children: [
      { id: 'vulnerabilities', label: 'Vulnerabilities', icon: <Bug className="size-4" /> },
      { id: 'history', label: 'Scan History', icon: <History className="size-4" /> },
    ],
  },
  {
    id: 'settings-group',
    label: 'Settings',
    group: true,
    icon: <Settings className="size-4" />,
    children: [
      { id: 'settings-general', label: 'General', icon: <SlidersHorizontal className="size-4" /> },
      { id: 'settings-security', label: 'Security', icon: <Shield className="size-4" /> },
      { id: 'settings-users', label: 'Users', icon: <Users className="size-4" /> },
    ],
  },
];

export const WithGroups: Story = {
  render: () => {
    const [activeId, setActiveId] = useState('dashboard');
    return (
      <NavigationSidebar items={itemsWithGroups} activeId={activeId} onNavigate={setActiveId} />
    );
  },
};

export const Collapsible: Story = {
  render: () => {
    const [activeId, setActiveId] = useState('dashboard');
    return (
      <NavigationSidebar
        items={defaultItems}
        activeId={activeId}
        onNavigate={setActiveId}
        collapsible
      />
    );
  },
};

export const CollapsibleWithGroups: Story = {
  render: () => {
    const [activeId, setActiveId] = useState('dashboard');
    return (
      <NavigationSidebar
        items={itemsWithGroups}
        activeId={activeId}
        onNavigate={setActiveId}
        collapsible
      />
    );
  },
};
