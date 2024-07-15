import * as React from 'react';
import AddIcon from '@mui/icons-material/Add';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogContentText from '@mui/material/DialogContentText';
import DialogTitle from '@mui/material/DialogTitle';
import useTheme from '@mui/material/styles/useTheme';

function GenerateTestCases() {
  /*
  const {config, table} = useStore();
  const handleGenerateTestCases = async () => {
    try {
      const prompts = table?.head.prompts.map((prompt) => prompt.raw);
      const tests = config?.tests.map((test) => test.raw);
      const response = await fetch('/api/dataset/generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          prompts,
          tests,
        }),
      });
      if (!response.ok) {
        throw new Error('Network response was not ok');
      }
      const data = await response.json();
      console.log('Test cases generated:', data.results);
    } catch (error) {
      console.error('Failed to generate test cases:', error);
    }
  };
  */
  const theme = useTheme();
  const [openDialog, setOpenDialog] = React.useState(false);

  const handleOpenDialog = () => {
    setOpenDialog(true);
  };

  const handleCloseDialog = () => {
    setOpenDialog(false);
  };

  return (
    <>
      <div style={{ textAlign: 'center', marginTop: 20, marginBottom: 40 }}>
        <Button variant="text" color="primary" startIcon={<AddIcon />} onClick={handleOpenDialog}>
          Generate test cases
        </Button>
      </div>
      <Dialog open={openDialog} onClose={handleCloseDialog}>
        <DialogTitle>Run on Command Line</DialogTitle>
        <DialogContent>
          <DialogContentText>
            <p>This feature is in beta. UI coming soon.</p>
            <p>
              Run{' '}
              <Box
                component="code"
                sx={{
                  backgroundColor: theme.palette.mode === 'dark' ? '#424242' : '#f0f0f0',
                  padding: '2px 4px',
                  borderRadius: '4px',
                }}
              >
                promptfoo generate dataset
              </Box>
              to generate test cases on the command line.
            </p>
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseDialog} color="primary">
            Close
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}

export default GenerateTestCases;
