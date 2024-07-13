import React, { useState } from 'react';
import { getApiBaseUrl } from '@/api';
import CompareIcon from '@mui/icons-material/Compare';
import ListItemIcon from '@mui/material/ListItemIcon';
import ListItemText from '@mui/material/ListItemText';
import MenuItem from '@mui/material/MenuItem';
import EvalSelectorDialog from './EvalSelectorDialog';
import { useStore } from './store';
import { ResultLightweightWithLabel } from './types';

interface CompareEvalMenuItemProps {
  initialEvals: ResultLightweightWithLabel[];
  onComparisonEvalSelected: (evalId: string) => void;
}

function CompareEvalMenuItem({ initialEvals, onComparisonEvalSelected }: CompareEvalMenuItemProps) {
  const { evalId: currentEvalId } = useStore();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [recentEvals, setRecentEvals] = useState<ResultLightweightWithLabel[]>(initialEvals);

  const fetchRecentEvals = async () => {
    try {
      const apiBaseUrl = await getApiBaseUrl();

      // First, get the dataset for the currentEvalId
      // TODO(ian): In theory we already have this datasetId because we've fetched the current eval...
      const currentEvalResponse = await fetch(
        `${apiBaseUrl}/api/results/${currentEvalId || initialEvals[0].evalId}`,
        {
          cache: 'no-store',
        },
      );
      const currentEvalData = await currentEvalResponse.json();
      const datasetId = currentEvalData.data.config.datasetId || '';
      console.log('datasetId:', datasetId);

      // Then, fetch the results with the obtained datasetId
      const response = await fetch(`${apiBaseUrl}/api/results?datasetId=${datasetId}`, {
        cache: 'no-store',
      });
      const body = await response.json();
      setRecentEvals(body.data);
    } catch (error) {
      console.error('Error fetching recent evals:', error);
    }
  };

  const handleOpenDialog = () => {
    fetchRecentEvals();
    setDialogOpen(true);
  };

  const handleCloseDialog = () => {
    setDialogOpen(false);
  };

  const handleEvalSelected = (evalId: string) => {
    onComparisonEvalSelected(evalId);
    handleCloseDialog();
  };

  return (
    <>
      <MenuItem onClick={handleOpenDialog}>
        <ListItemIcon>
          <CompareIcon fontSize="small" />
        </ListItemIcon>
        <ListItemText>Compare with another eval</ListItemText>
      </MenuItem>
      <EvalSelectorDialog
        open={dialogOpen}
        onClose={handleCloseDialog}
        recentEvals={recentEvals}
        onRecentEvalSelected={handleEvalSelected}
        title="Select an eval to compare"
      />
    </>
  );
}

export default CompareEvalMenuItem;
