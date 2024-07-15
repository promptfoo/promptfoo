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
import Tooltip from '@mui/material/Tooltip';
import fuzzysearch from 'fuzzysearch';
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
  const [focusedIndex, setFocusedIndex] = useState(-1);
  const searchInputRef = React.useRef<HTMLInputElement>(null);
  const tableContainerRef = React.useRef<HTMLDivElement>(null);

  const handleOpen = () => {
    setOpen(true);
    setFocusedIndex(0);
    // Focus the search box when the dialog is opened
    setTimeout(() => {
      searchInputRef.current?.focus();
    }, 0);
  };

  const handleClose = () => {
    setOpen(false);
    setSearchText('');
    setFocusedIndex(-1);
  };

  const filteredEvals = recentEvals.filter(
    (_eval) =>
      fuzzysearch(searchText.toLowerCase(), _eval.label.toLowerCase()) ||
      (typeof _eval.description === 'string' &&
        fuzzysearch(searchText.toLowerCase(), _eval.description.toLowerCase())),
  );

  const handleSelectEval = (evalId: string) => {
    onRecentEvalSelected(evalId);
    handleClose();
  };

  const scrollToFocusedItem = React.useCallback(() => {
    if (focusedIndex >= 0 && tableContainerRef.current) {
      const tableRows = tableContainerRef.current.querySelectorAll('tbody tr');
      const targetIndex = Math.min(focusedIndex + 3, tableRows.length - 1);
      if (tableRows[targetIndex]) {
        tableRows[targetIndex].scrollIntoView({
          behavior: 'smooth',
          block: 'nearest',
        });
      }
    }
  }, [focusedIndex]);

  const handleKeyDown = (event: React.KeyboardEvent) => {
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        setFocusedIndex((prevIndex) => Math.min(prevIndex + 1, filteredEvals.length - 1));
        break;
      case 'ArrowUp':
        event.preventDefault();
        setFocusedIndex((prevIndex) => Math.max(prevIndex - 1, 0));
        break;
      case 'Enter':
        event.preventDefault();
        if (focusedIndex >= 0 && focusedIndex < filteredEvals.length) {
          handleSelectEval(filteredEvals[focusedIndex].evalId);
        } else if (filteredEvals.length > 0) {
          handleSelectEval(filteredEvals[0].evalId);
        }
        break;
    }
  };

  React.useEffect(() => {
    scrollToFocusedItem();
  }, [scrollToFocusedItem]);

  React.useEffect(() => {
    const handleGlobalKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key === 'k') {
        event.preventDefault();
        handleOpen();
      }
    };

    window.addEventListener('keydown', handleGlobalKeyDown);

    return () => {
      window.removeEventListener('keydown', handleGlobalKeyDown);
    };
  }, []);

  const isMac =
    typeof navigator === 'undefined'
      ? false
      : navigator.platform.toUpperCase().indexOf('MAC') !== -1;
  const tooltipTitle = isMac ? 'Search for Evals (⌘ + K)' : 'Search for Evals (Ctrl + K)';

  return (
    <>
      <Tooltip title={tooltipTitle} arrow>
        <IconButton onClick={handleOpen} color="primary" size="small">
          <FolderIcon />
        </IconButton>
      </Tooltip>
      <Dialog open={open} onClose={handleClose} maxWidth="md" fullWidth>
        <DialogTitle>Open an Eval</DialogTitle>
        <DialogContent>
          <Box sx={{ width: '100%', mt: 2 }}>
            <TextField
              fullWidth
              variant="outlined"
              placeholder="Search"
              value={searchText}
              onChange={(e) => {
                setSearchText(e.target.value);
                setFocusedIndex(0);
              }}
              onKeyDown={handleKeyDown}
              sx={{ mb: 2 }}
              inputRef={searchInputRef}
            />
            <TableContainer
              component={Paper}
              sx={{ height: '600px', overflow: 'auto' }}
              ref={tableContainerRef}
            >
              <Table stickyHeader>
                <TableHead>
                  <TableRow>
                    <TableCell>Created</TableCell>
                    <TableCell>Description</TableCell>
                    <TableCell># Tests</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {filteredEvals.map((_eval, index) => (
                    <TableRow
                      key={_eval.evalId}
                      hover
                      onClick={() => handleSelectEval(_eval.evalId)}
                      sx={{
                        cursor: 'pointer',
                        backgroundColor:
                          index === focusedIndex ? 'rgba(255, 255, 0, 0.1)' : 'inherit',
                      }}
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
