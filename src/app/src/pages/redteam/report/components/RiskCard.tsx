import React from 'react';

import ArrowForwardIosIcon from '@mui/icons-material/ArrowForwardIos';
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
import { Gauge, gaugeClasses } from '@mui/x-charts/Gauge';
import {
  categoryAliases,
  displayNameOverrides,
  subCategoryDescriptions,
} from '@promptfoo/redteam/constants';
import { type GradingResult } from '@promptfoo/types';
import RiskCategoryDrawer from './RiskCategoryDrawer';
import { useReportStore } from './store';
import './RiskCard.css';

const RiskCard = ({
  title,
  subtitle,
  progressValue,
  numTestsPassed,
  numTestsFailed,
  testTypes,
  evalId,
  failuresByPlugin,
  passesByPlugin,
}: {
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
      <CardContent
        className="risk-card-container"
        sx={{ pageBreakInside: 'avoid', breakInside: 'avoid' }}
      >
        <Grid
          container
          spacing={3}
          sx={{
            '@media print': {
              flexDirection: 'column',
              gap: '2rem',
            },
          }}
        >
          <Grid
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              textAlign: 'center',
            }}
            size={{
              xs: 12,
              md: 6,
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
                innerRadius="80%"
                outerRadius="100%"
                startAngle={-90}
                endAngle={90}
                text={Number.isNaN(progressValue) ? '-' : `${Math.round(progressValue)}%`}
                sx={(theme) => ({
                  width: '100%',
                  height: '100%',
                  [`& .${gaugeClasses.valueArc}`]: {
                    fill: theme.palette.primary.main,
                  },
                })}
              />
            </Box>
            <Typography
              variant="h6"
              sx={{
                color: numTestsFailed === 0 ? 'text.secondary' : 'error.main',
              }}
            >
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
          <Grid size={{ xs: 6, md: 4 }}>
            <List dense>
              {filteredTestTypes.map((test, index) => {
                const percentage = test.numPassed / (test.numPassed + test.numFailed);
                return (
                  <Tooltip
                    key={index}
                    title={
                      subCategoryDescriptions[test.name as keyof typeof subCategoryDescriptions] ||
                      'Click to view details'
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
                      <Box sx={{ display: 'flex', alignItems: 'center' }}>
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
                          <CheckCircleIcon className="risk-card-icon-passed" color="success" />
                        ) : (
                          <CancelIcon className="risk-card-icon-failed" color="error" />
                        )}
                        <ArrowForwardIosIcon
                          className="risk-card-expand-icon print-hide"
                          fontSize="small"
                        />
                      </Box>
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
            numPassed={(() => {
              const testType = testTypes.find((t) => t.name === selectedCategory);
              return testType?.numPassed ?? 0;
            })()}
            numFailed={(() => {
              const testType = testTypes.find((t) => t.name === selectedCategory);
              return testType?.numFailed ?? 0;
            })()}
          />
        )}
      </CardContent>
    </Card>
  );
};

export default RiskCard;
