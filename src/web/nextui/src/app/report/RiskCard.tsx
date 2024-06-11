import React from 'react';
import {
  Card,
  CardContent,
  Typography,
  Grid,
  CircularProgress,
  List,
  ListItem,
  ListItemText,
  Box,
  Tooltip,
} from '@mui/material';
import { Gauge, gaugeClasses } from '@mui/x-charts/Gauge';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import CancelIcon from '@mui/icons-material/Cancel';

import { categoryAliases, subCategoryDescriptions } from './constants';

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
                title={subCategoryDescriptions[test.name as keyof typeof subCategoryDescriptions]}
                placement="left"
                arrow
              >
                <ListItem className="risk-card-list-item">
                  <ListItemText
                    primary={categoryAliases[test.name as keyof typeof categoryAliases]}
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
