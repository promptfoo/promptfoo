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
      // TODO(ian): In theory we already have this datasetId because we've fetched the current eval...dataset should probably be stored in the store
      const fetchEvalId = currentEvalId || initialEvals[0].evalId;
      const currentEvalResponse = await fetch(`${apiBaseUrl}/api/results/${fetchEvalId}`, {
        cache: 'no-store',
      });
      const currentEvalData = await currentEvalResponse.json();
      const datasetId = currentEvalData.data.datasetId;

      if (!datasetId) {
        console.error('No datasetId found for current eval ' + fetchEvalId);
        return;
      }

      // Then, fetch the results with the obtained datasetId
      const response = await fetch(`${apiBaseUrl}/api/results?datasetId=${datasetId}`, {
        cache: 'no-store',
      });
      const body = (await response.json()) as { data: ResultLightweightWithLabel[] };
      setRecentEvals(body.data.filter((_eval) => _eval.evalId !== fetchEvalId));
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
        description="Only evals with the same dataset can be compared."
      />
    </>
  );
}

export default CompareEvalMenuItem;
