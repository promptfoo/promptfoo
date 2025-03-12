import React from 'react';
import CancelIcon from '@mui/icons-material/Cancel';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Grid from '@mui/material/Grid';
import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import ListItemText from '@mui/material/ListItemText';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import { Gauge } from '@mui/x-charts/Gauge';
import {
  categoryAliases,
  displayNameOverrides,
  subCategoryDescriptions,
} from '@promptfoo/redteam/constants';
import { type GradingResult } from '@promptfoo/types';
import RiskCategoryDrawer from './RiskCategoryDrawer';
import { useReportStore } from './store';
import './RiskCard.css';

const RiskCard: React.FC<{
  title: string;
  subtitle: string;
  progressValue: number;
  numTestsPassed: number;
  numTestsFailed: number;
  testTypes: { name: string; categoryPassed: boolean; numPassed: number; numFailed: number }[];
  evalId: string;
  failuresByPlugin: Record<
    string,
    { prompt: string; output: string; gradingResult?: GradingResult }[]
  >;
  passesByPlugin: Record<
    string,
    { prompt: string; output: string; gradingResult?: GradingResult }[]
  >;
  strategyStats: Record<string, { pass: number; total: number }>;
}> = ({
  title,
  subtitle,
  progressValue,
  numTestsPassed,
  numTestsFailed,
  testTypes,
  evalId,
  failuresByPlugin,
  passesByPlugin,
  strategyStats,
}) => {
  const { showPercentagesOnRiskCards, pluginPassRateThreshold } = useReportStore();
  const [drawerOpen, setDrawerOpen] = React.useState(false);
  const [selectedCategory, setSelectedCategory] = React.useState('');

  // Hide risk cards with no tests
  const filteredTestTypes = testTypes.filter((test) => test.numPassed + test.numFailed > 0);
  if (filteredTestTypes.length === 0) {
    return null;
  }

  return (
    <Card>
      <CardContent className="risk-card-container">
        <Grid container spacing={3}>
          <Grid
            item
            xs={12}
            md={6}
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              textAlign: 'center',
            }}
          >
            <Typography variant="h5" className="risk-card-title">
              {title}
            </Typography>
            <Typography variant="subtitle1" color="textSecondary" mb={2}>
              {subtitle}
            </Typography>
            <Box
              sx={{
                position: 'relative',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: 100,
                height: 100,
              }}
            >
              <Gauge
                value={progressValue}
                // @ts-ignore
                max={100}
                thickness={10}
                arc={{
                  startAngle: -90,
                  endAngle: 90,
                  color: 'primary.main',
                }}
                text={Number.isNaN(progressValue) ? '-' : `${Math.round(progressValue)}%`}
                sx={{
                  width: '100%',
                  height: '100%',
                }}
              />
            </Box>
            <Typography variant="h6" className="risk-card-issues">
              {numTestsFailed} failed probes
            </Typography>
            <Typography
              variant="subtitle1"
              color="textSecondary"
              className="risk-card-tests-passed"
            >
              {numTestsPassed}/{numTestsPassed + numTestsFailed} passed
            </Typography>
          </Grid>
          <Grid item xs={6} md={4}>
            <List dense>
              {filteredTestTypes.map((test, index) => {
                const percentage = test.numPassed / (test.numPassed + test.numFailed);
                return (
                  <Tooltip
                    key={index}
                    title={
                      subCategoryDescriptions[test.name as keyof typeof subCategoryDescriptions]
                    }
                    placement="left"
                    arrow
                  >
                    <ListItem
                      className="risk-card-list-item"
                      onClick={() => {
                        setSelectedCategory(test.name);
                        setDrawerOpen(true);
                      }}
                      style={{ cursor: 'pointer' }}
                    >
                      <ListItemText
                        primary={
                          displayNameOverrides[test.name as keyof typeof displayNameOverrides] ||
                          categoryAliases[test.name as keyof typeof categoryAliases]
                        }
                        primaryTypographyProps={{ variant: 'body2' }}
                      />
                      {showPercentagesOnRiskCards ? (
                        <Typography
                          variant="body2"
                          className={`risk-card-percentage ${
                            percentage >= 0.8
                              ? 'risk-card-percentage-high'
                              : percentage >= 0.5
                                ? 'risk-card-percentage-medium'
                                : 'risk-card-percentage-low'
                          }`}
                        >
                          {`${Math.round(percentage * 100)}%`}
                        </Typography>
                      ) : percentage >= pluginPassRateThreshold ? (
                        <CheckCircleIcon className="risk-card-icon-passed" />
                      ) : (
                        <CancelIcon className="risk-card-icon-failed" />
                      )}
                    </ListItem>
                  </Tooltip>
                );
              })}
            </List>
          </Grid>
        </Grid>
        {selectedCategory && (
          <RiskCategoryDrawer
            open={drawerOpen}
            onClose={() => setDrawerOpen(false)}
            category={selectedCategory}
            failures={failuresByPlugin[selectedCategory] || []}
            passes={passesByPlugin[selectedCategory] || []}
            evalId={evalId}
            numPassed={testTypes.find((t) => t.name === selectedCategory)?.numPassed || 0}
            numFailed={testTypes.find((t) => t.name === selectedCategory)?.numFailed || 0}
            strategyStats={strategyStats}
          />
        )}
      </CardContent>
    </Card>
  );
};

export default RiskCard;
