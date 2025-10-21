import { Box } from '@mui/material';
import { RiskChart } from 'promptfoo-toolkit';
import type { Meta, StoryObj } from '@storybook/react-vite';

// Wrapper component to control the size and layout
const RiskChartWrapper = ({ value, size = 200 }: { value: number; size?: number }) => {
  return (
    <Box
      sx={{
        width: size,
        height: size,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <RiskChart value={value} />
    </Box>
  );
};

// More on how to set up stories at: https://storybook.js.org/docs/writing-stories#default-export
const meta = {
  title: 'RedTeam/Report/Risk/RiskChart',
  component: RiskChartWrapper,
  parameters: {
    // Optional parameter to center the component in the Canvas. More info: https://storybook.js.org/docs/configure/story-layout
    layout: 'centered',
  },
  // This component will have an automatically generated Autodocs entry: https://storybook.js.org/docs/writing-docs/autodocs
  tags: ['autodocs'],
  // More on argTypes: https://storybook.js.org/docs/api/argtypes
  argTypes: {
    value: {
      control: { type: 'range', min: 0, max: 100, step: 1 },
      description: 'Risk percentage value (0-100)',
    },
    size: {
      control: { type: 'range', min: 100, max: 400, step: 50 },
      description: 'Size of the chart in pixels',
    },
  },
} satisfies Meta<typeof RiskChartWrapper>;

export default meta;
type Story = StoryObj<typeof meta>;

// More on writing stories with args: https://storybook.js.org/docs/writing-stories/args

export const Default: Story = {
  args: {
    value: 50,
    size: 200,
  },
};

export const LowRisk: Story = {
  args: {
    value: 15,
    size: 200,
  },
};

export const MediumRisk: Story = {
  args: {
    value: 45,
    size: 200,
  },
};

export const HighRisk: Story = {
  args: {
    value: 75,
    size: 200,
  },
};

export const CriticalRisk: Story = {
  args: {
    value: 95,
    size: 200,
  },
};

export const ZeroRisk: Story = {
  args: {
    value: 0,
    size: 200,
  },
};

export const MaximumRisk: Story = {
  args: {
    value: 100,
    size: 200,
  },
};

export const InvalidValue: Story = {
  args: {
    value: NaN,
    size: 200,
  },
};

export const SmallSize: Story = {
  args: {
    value: 60,
    size: 150,
  },
};

export const LargeSize: Story = {
  args: {
    value: 30,
    size: 300,
  },
};

export const VeryLowRisk: Story = {
  args: {
    value: 5,
    size: 200,
  },
};

export const ModerateRisk: Story = {
  args: {
    value: 35,
    size: 200,
  },
};

export const VeryHighRisk: Story = {
  args: {
    value: 85,
    size: 200,
  },
};

// Interactive story that allows real-time adjustment
export const Interactive: Story = {
  args: {
    value: 50,
    size: 250,
  },
  parameters: {
    docs: {
      description: {
        story:
          'Use the controls panel to adjust the risk value and see how the chart responds in real-time.',
      },
    },
  },
};

// Multiple charts in different sizes for comparison
export const SizeComparison: Story = {
  args: {
    value: 60,
    size: 200,
  },
  render: () => (
    <Box sx={{ display: 'flex', gap: 2, alignItems: 'center' }}>
      <RiskChartWrapper value={60} size={120} />
      <RiskChartWrapper value={60} size={180} />
      <RiskChartWrapper value={60} size={240} />
    </Box>
  ),
  parameters: {
    docs: {
      description: {
        story: 'RiskChart scales appropriately to different sizes while maintaining proportions.',
      },
    },
  },
};

// Risk level showcase
export const RiskLevelShowcase: Story = {
  args: {
    value: 50,
    size: 200,
  },
  render: () => (
    <Box sx={{ display: 'flex', gap: 3, flexWrap: 'wrap' }}>
      <Box sx={{ textAlign: 'center' }}>
        <RiskChartWrapper value={10} size={150} />
        <Box sx={{ mt: 1, fontWeight: 'bold', color: 'success.main' }}>Low Risk (10%)</Box>
      </Box>
      <Box sx={{ textAlign: 'center' }}>
        <RiskChartWrapper value={40} size={150} />
        <Box sx={{ mt: 1, fontWeight: 'bold', color: 'warning.main' }}>Medium Risk (40%)</Box>
      </Box>
      <Box sx={{ textAlign: 'center' }}>
        <RiskChartWrapper value={70} size={150} />
        <Box sx={{ mt: 1, fontWeight: 'bold', color: 'error.main' }}>High Risk (70%)</Box>
      </Box>
      <Box sx={{ textAlign: 'center' }}>
        <RiskChartWrapper value={95} size={150} />
        <Box sx={{ mt: 1, fontWeight: 'bold', color: 'error.dark' }}>Critical Risk (95%)</Box>
      </Box>
    </Box>
  ),
  parameters: {
    docs: {
      description: {
        story: 'Different risk levels with appropriate color coding and labels.',
      },
    },
  },
};
