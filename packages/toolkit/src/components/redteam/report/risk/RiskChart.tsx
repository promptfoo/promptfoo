import { alpha } from '@mui/material/styles';
import { Gauge, gaugeClasses } from '@mui/x-charts/Gauge';

interface RiskChartProps {
  value: number;
}

export const RiskChart = ({ value }: RiskChartProps) => {
  return (
    <Gauge
      value={value}
      // @ts-ignore
      max={100}
      thickness={10}
      arc={{
        startAngle: -90,
        endAngle: 90,
        color: 'primary.main',
      }}
      cornerRadius="50%"
      text={Number.isNaN(value) ? '-' : `${Math.round(value)}%`}
      sx={(theme) => ({
        [`& .${gaugeClasses.valueArc}`]: {
          fill: theme.palette.error.light,
        },
        [`& .${gaugeClasses.referenceArc}`]: {
          fill: value
            ? theme.palette.mode === 'dark'
              ? alpha(theme.palette.error.main, 0.2)
              : alpha(theme.palette.error.main, 0.1)
            : theme.palette.action.disabledBackground,
        },
        width: '100%',
        height: '100%',
      })}
    />
  );
};
