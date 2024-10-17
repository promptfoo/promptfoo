import React, { useState } from 'react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import Paper from '@mui/material/Paper';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import fuzzysearch from 'fuzzysearch';
import type { ResultLightweightWithLabel } from './types';

interface EvalSelectorDialogProps {
  open: boolean;
  onClose: () => void;
  recentEvals: ResultLightweightWithLabel[];
  onRecentEvalSelected: (evalId: string) => void;
  title?: string;
  description?: string;
}

const EvalSelectorDialog: React.FC<EvalSelectorDialogProps> = ({
  open,
  onClose,
  recentEvals,
  onRecentEvalSelected,
  title,
  description,
}) => {
  const [searchText, setSearchText] = useState<string>('');
  const [focusedIndex, setFocusedIndex] = useState<number>(-1);
  const searchInputRef = React.useRef<HTMLInputElement>(null);
  const tableContainerRef = React.useRef<HTMLDivElement>(null);

  const handleClose = () => {
    onClose();
    setSearchText('');
    setFocusedIndex(-1);
  };

  const filteredEvals = recentEvals.filter(
    (_eval) =>
      fuzzysearch(searchText.toLowerCase(), String(_eval.label).toLowerCase()) ||
      (typeof _eval.description === 'string' &&
        fuzzysearch(searchText.toLowerCase(), String(_eval.description).toLowerCase())),
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
    event.stopPropagation();
    if (!open) {
      return;
    }

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
      case 'Escape':
        event.preventDefault();
        handleClose();
        break;
    }
  };

  React.useEffect(() => {
    scrollToFocusedItem();
  }, [scrollToFocusedItem]);

  React.useEffect(() => {
    if (open) {
      setFocusedIndex(0);
      setTimeout(() => {
        searchInputRef.current?.focus();
      }, 0);
    }
  }, [open]);

  const dialogId = React.useId();
  return (
    <Dialog open={open} onClose={handleClose} maxWidth="md" fullWidth>
      {title ? <DialogTitle>{title}</DialogTitle> : null}
      <DialogContent>
        {description ? <Box sx={{ mb: 4 }}>{description}</Box> : null}
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
            id={`eval-selector-search-${dialogId}`}
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
                {filteredEvals.length > 0 ? (
                  filteredEvals.map((_eval, index) => (
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
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={3} align="center" sx={{ py: 4 }}>
                      <Box sx={{ textAlign: 'center', color: 'text.secondary' }}>
                        <Box sx={{ fontSize: '3rem', mb: 2 }}>🔍</Box>
                        <Typography variant="h6" gutterBottom>
                          No evaluations found
                        </Typography>
                        <Typography variant="body2">
                          Try adjusting your search or create a new evaluation
                        </Typography>
                      </Box>
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </TableContainer>
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={handleClose}>Cancel</Button>
      </DialogActions>
    </Dialog>
  );
};

export default EvalSelectorDialog;
