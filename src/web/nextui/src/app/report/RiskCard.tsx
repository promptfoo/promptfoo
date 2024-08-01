import React from 'react';
import CancelIcon from '@mui/icons-material/Cancel';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import RemoveCircleIcon from '@mui/icons-material/RemoveCircle';
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
import { categoryAliases, displayNameOverrides, subCategoryDescriptions } from './constants';
import { useReportStore } from './store';
import './RiskCard.css';

const RiskCard: React.FC<{
  title: string;
  subtitle: string;
  progressValue: number;
  numTestsPassed: number;
  numTestsFailed: number;
  testTypes: { name: string; passed: boolean; percentage: number; total: number }[];
}> = ({ title, subtitle, progressValue, numTestsPassed, numTestsFailed, testTypes }) => {
  const { showPercentagesOnRiskCards, pluginPassRateThreshold } = useReportStore();
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
                max={100}
                thickness={10}
                arc={{
                  startAngle: -90,
                  endAngle: 90,
                  color: 'primary.main',
                }}
                text={`${Math.round(progressValue)}%`}
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
              {testTypes.map((test, index) => (
                <Tooltip
                  key={index}
                  title={subCategoryDescriptions[test.name as keyof typeof subCategoryDescriptions]}
                  placement="left"
                  arrow
                >
                  <ListItem
                    className="risk-card-list-item"
                    onClick={(event) => {
                      const searchParams = new URLSearchParams(window.location.search);
                      const evalId = searchParams.get('evalId');
                      const descriptiveName =
                        categoryAliases[test.name as keyof typeof categoryAliases];
                      const url = `/eval/?evalId=${evalId}&search=${encodeURIComponent(`(var=${descriptiveName}|metric=${descriptiveName})`)}`;
                      if (event.ctrlKey || event.metaKey) {
                        window.open(url, '_blank');
                      } else {
                        window.location.href = url;
                      }
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
                          test.percentage >= 0.8
                            ? 'risk-card-percentage-high'
                            : test.percentage >= 0.5
                              ? 'risk-card-percentage-medium'
                              : 'risk-card-percentage-low'
                        }`}
                      >
                        {`${Math.round(test.percentage * 100)}%`}
                      </Typography>
                    ) : test.total === 0 ? (
                      <RemoveCircleIcon className="risk-card-icon-no-tests" />
                    ) : test.percentage >= pluginPassRateThreshold ? (
                      <CheckCircleIcon className="risk-card-icon-passed" />
                    ) : (
                      <CancelIcon className="risk-card-icon-failed" />
                    )}
                  </ListItem>
                </Tooltip>
              ))}
            </List>
          </Grid>
        </Grid>
      </CardContent>
    </Card>
  );
};

export default RiskCard;
