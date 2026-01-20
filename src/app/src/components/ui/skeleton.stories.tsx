import { Skeleton } from './skeleton';
import type { Meta, StoryObj } from '@storybook/react-vite';

const meta: Meta<typeof Skeleton> = {
  title: 'UI/Skeleton',
  component: Skeleton,
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof Skeleton>;

// Default skeleton
export const Default: Story = {
  render: () => <Skeleton className="h-4 w-[250px]" />,
};

// Different sizes
export const Sizes: Story = {
  render: () => (
    <div className="space-y-4">
      <Skeleton className="h-4 w-[250px]" />
      <Skeleton className="h-6 w-[300px]" />
      <Skeleton className="h-8 w-[350px]" />
      <Skeleton className="h-12 w-[400px]" />
    </div>
  ),
};

// Card skeleton
export const CardSkeleton: Story = {
  render: () => (
    <div className="flex flex-col space-y-3 w-[350px]">
      <Skeleton className="h-[125px] w-full rounded-xl" />
      <div className="space-y-2">
        <Skeleton className="h-4 w-[250px]" />
        <Skeleton className="h-4 w-[200px]" />
      </div>
    </div>
  ),
};

// Avatar and text
export const AvatarAndText: Story = {
  render: () => (
    <div className="flex items-center space-x-4">
      <Skeleton className="size-12 rounded-full" />
      <div className="space-y-2">
        <Skeleton className="h-4 w-[150px]" />
        <Skeleton className="h-4 w-[100px]" />
      </div>
    </div>
  ),
};

// Table skeleton
export const TableSkeleton: Story = {
  render: () => (
    <div className="space-y-4 w-full">
      {/* Header */}
      <div className="flex gap-4">
        <Skeleton className="h-8 w-[100px]" />
        <Skeleton className="h-8 flex-1" />
        <Skeleton className="h-8 w-[80px]" />
        <Skeleton className="h-8 w-[80px]" />
      </div>
      {/* Rows */}
      {[...Array(5)].map((_, i) => (
        <div key={i} className="flex gap-4">
          <Skeleton className="h-6 w-[100px]" />
          <Skeleton className="h-6 flex-1" />
          <Skeleton className="h-6 w-[80px]" />
          <Skeleton className="h-6 w-[80px]" />
        </div>
      ))}
    </div>
  ),
};

// Stats cards skeleton
export const StatsCardsSkeleton: Story = {
  render: () => (
    <div className="grid grid-cols-3 gap-4">
      {[...Array(3)].map((_, i) => (
        <div key={i} className="p-6 border rounded-lg space-y-3">
          <Skeleton className="h-4 w-[80px]" />
          <Skeleton className="h-8 w-[60px]" />
          <Skeleton className="h-3 w-[100px]" />
        </div>
      ))}
    </div>
  ),
};

// List skeleton
export const ListSkeleton: Story = {
  render: () => (
    <div className="space-y-4">
      {[...Array(4)].map((_, i) => (
        <div key={i} className="flex items-center space-x-4 p-4 border rounded-lg">
          <Skeleton className="size-10 rounded-full" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-3 w-1/2" />
          </div>
          <Skeleton className="h-8 w-[60px]" />
        </div>
      ))}
    </div>
  ),
};

// Form skeleton
export const FormSkeleton: Story = {
  render: () => (
    <div className="space-y-6 w-[400px]">
      <div className="space-y-2">
        <Skeleton className="h-4 w-[60px]" />
        <Skeleton className="h-10 w-full" />
      </div>
      <div className="space-y-2">
        <Skeleton className="h-4 w-[80px]" />
        <Skeleton className="h-10 w-full" />
      </div>
      <div className="space-y-2">
        <Skeleton className="h-4 w-[100px]" />
        <Skeleton className="h-24 w-full" />
      </div>
      <Skeleton className="h-10 w-[100px]" />
    </div>
  ),
};

// Full page skeleton
export const FullPageSkeleton: Story = {
  render: () => (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div className="space-y-2">
          <Skeleton className="h-8 w-[200px]" />
          <Skeleton className="h-4 w-[300px]" />
        </div>
        <Skeleton className="h-10 w-[100px]" />
      </div>
      {/* Content */}
      <div className="grid grid-cols-4 gap-4">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="p-4 border rounded-lg space-y-3">
            <Skeleton className="h-4 w-[80px]" />
            <Skeleton className="h-6 w-[60px]" />
          </div>
        ))}
      </div>
      {/* Table */}
      <div className="space-y-3">
        {[...Array(5)].map((_, i) => (
          <Skeleton key={i} className="h-12 w-full" />
        ))}
      </div>
    </div>
  ),
};
