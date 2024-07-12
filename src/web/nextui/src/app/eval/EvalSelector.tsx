import React, { useState } from 'react';
import FolderIcon from '@mui/icons-material/FolderOpen';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import IconButton from '@mui/material/IconButton';
import Paper from '@mui/material/Paper';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import TextField from '@mui/material/TextField';
import { ResultLightweightWithLabel } from './types';

interface EvalSelectorProps {
  recentEvals: ResultLightweightWithLabel[];
  onRecentEvalSelected: (evalId: string) => void;
  currentEval: ResultLightweightWithLabel | null;
}

const EvalSelector: React.FC<EvalSelectorProps> = ({
  recentEvals,
  onRecentEvalSelected,
  currentEval,
}) => {
  const [open, setOpen] = useState(false);
  const [searchText, setSearchText] = useState('');
  const searchInputRef = React.useRef<HTMLInputElement>(null);

  const handleOpen = () => {
    setOpen(true);
    // Focus the search box when the dialog is opened
    setTimeout(() => {
      searchInputRef.current?.focus();
    }, 0);
  };

  const handleClose = () => {
    setOpen(false);
    setSearchText('');
  };

  const filteredEvals = recentEvals.filter(
    (_eval) =>
      _eval.label.toLowerCase().includes(searchText.toLowerCase()) ||
      _eval.description?.toLowerCase().includes(searchText.toLowerCase()),
  );

  const handleSelectEval = (evalId: string) => {
    onRecentEvalSelected(evalId);
    handleClose();
  };

  return (
    <>
      <IconButton onClick={handleOpen} color="primary">
        <FolderIcon />
      </IconButton>
      <Dialog open={open} onClose={handleClose} maxWidth="md" fullWidth>
        <DialogTitle>Select Eval</DialogTitle>
        <DialogContent>
          <Box sx={{ width: '100%', mt: 2 }}>
            <TextField
              fullWidth
              variant="outlined"
              placeholder="Search"
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              sx={{ mb: 2 }}
              inputRef={searchInputRef}
            />
            <TableContainer component={Paper} sx={{ height: '600px', overflow: 'auto' }}>
              <Table stickyHeader>
                <TableHead>
                  <TableRow>
                    <TableCell>Created</TableCell>
                    <TableCell>Description</TableCell>
                    <TableCell># Tests</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {filteredEvals.map((_eval) => (
                    <TableRow
                      key={_eval.evalId}
                      hover
                      onClick={() => handleSelectEval(_eval.evalId)}
                      sx={{ cursor: 'pointer' }}
                    >
                      <TableCell>{new Date(_eval.createdAt).toLocaleString()}</TableCell>
                      <TableCell>{_eval.description || _eval.label}</TableCell>
                      <TableCell>{_eval.numTests}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleClose}>Cancel</Button>
        </DialogActions>
      </Dialog>
    </>
  );
};

export default EvalSelector;
