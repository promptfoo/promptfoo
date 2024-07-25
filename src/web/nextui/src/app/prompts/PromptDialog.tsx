import React from 'react';
import type { PromptWithMetadata } from '@/../../../types';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import TextareaAutosize from '@mui/material/TextareaAutosize';
import Typography from '@mui/material/Typography';
import Link from 'next/link';

interface PromptDialogProps {
  openDialog: boolean;
  handleClose: () => void;
  selectedPrompt: PromptWithMetadata & { recentEvalDate: string };
}

const PromptDialog: React.FC<PromptDialogProps> = ({ openDialog, handleClose, selectedPrompt }) => {
  return (
    <Dialog open={openDialog} onClose={handleClose} fullWidth maxWidth="lg">
      <DialogTitle>Prompt {selectedPrompt.id.slice(0, 6)}</DialogTitle>
      <DialogContent>
        <Typography variant="h6" style={{ marginTop: '1rem' }}>
          Prompt
        </Typography>
        <TextareaAutosize
          readOnly
          value={selectedPrompt?.prompt?.raw}
          style={{ width: '100%', padding: '0.75rem' }}
          maxRows={50}
        />
        <Typography variant="h6" style={{ marginTop: '1rem' }}>
          Used in...
        </Typography>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell>Eval ID</TableCell>
              <TableCell>Dataset ID</TableCell>
              <TableCell>Raw score</TableCell>
              <TableCell>Pass rate</TableCell>
              <TableCell>Pass count</TableCell>
              <TableCell>Fail count</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {selectedPrompt?.evals
              .sort((a, b) => b.id.localeCompare(a.id))
              .map((evalData) => {
                const passCount = evalData.metrics?.testPassCount ?? 0;
                const failCount = evalData.metrics?.testFailCount ?? 0;
                const passRate =
                  passCount + failCount > 0
                    ? `${((passCount / (passCount + failCount)) * 100.0).toFixed(2)}%`
                    : '-';
                return (
                  <TableRow key={`eval-${evalData.id}`}>
                    <TableCell>
                      <Link href={`/eval/?evalId=${evalData.id}`}>{evalData.id}</Link>
                    </TableCell>
                    <TableCell>
                      <Link href={`/datasets/?id=${evalData.datasetId}`}>
                        {evalData.datasetId.slice(0, 6)}
                      </Link>
                    </TableCell>
                    <TableCell>{evalData.metrics?.score?.toFixed(2) ?? '-'}</TableCell>
                    <TableCell>{passRate}</TableCell>
                    <TableCell>{passCount}</TableCell>
                    <TableCell>{failCount}</TableCell>
                  </TableRow>
                );
              })}
          </TableBody>
        </Table>
      </DialogContent>
      <DialogActions>
        <Button onClick={handleClose}>Close</Button>
      </DialogActions>
    </Dialog>
  );
};

export default PromptDialog;
