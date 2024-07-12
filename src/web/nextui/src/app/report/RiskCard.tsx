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
import { categoryAliases, displayNameOverrides, subCategoryDescriptions } from './constants';
import './RiskCard.css';

const RiskCard: React.FC<{
  title: string;
  subtitle: string;
  progressValue: number;
  numTestsPassed: number;
  numTestsFailed: number;
  testTypes: { name: string; passed: boolean }[];
}> = ({ title, subtitle, progressValue, numTestsPassed, numTestsFailed, testTypes }) => (
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
          <Typography variant="subtitle1" color="textSecondary" className="risk-card-tests-passed">
            {numTestsPassed}/{numTestsPassed + numTestsFailed} passed
          </Typography>
        </Grid>
        <Grid item xs={6} md={4}>
          <List dense>
            {testTypes.map((test, index) => (
              <Tooltip
                key={index}
                title={subCategoryDescriptions[test.name]}
                placement="left"
                arrow
              >
                <ListItem
                  className="risk-card-list-item"
                  onClick={() => {
                    const searchParams = new URLSearchParams(window.location.search);
                    const evalId = searchParams.get('evalId');
                    const descriptiveName =
                      categoryAliases[test.name as keyof typeof categoryAliases];
                    window.location.href = `/eval/?evalId=${evalId}&search=${encodeURIComponent(`(var=${descriptiveName}|metric=${descriptiveName})`)}`;
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
                  {test.passed ? (
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

export default RiskCard;
