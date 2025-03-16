import React from 'react';
import CloseIcon from '@mui/icons-material/Close';
import KeyboardArrowRightIcon from '@mui/icons-material/KeyboardArrowRight';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import Grid from '@mui/material/Grid';
import IconButton from '@mui/material/IconButton';
import Link from '@mui/material/Link';
import Typography from '@mui/material/Typography';
import { useTheme } from '@mui/material/styles';

interface SetupProps {
  open: boolean;
  onClose: () => void;
}

export default function Setup({ open, onClose }: SetupProps) {
  const theme = useTheme();

  return (
    <Dialog
      open={open}
      onClose={onClose}
      aria-labelledby="setup-dialog-title"
      aria-describedby="setup-dialog-description"
      maxWidth="md"
      fullWidth
    >
      <DialogTitle id="setup-dialog-title">
        LLM Red Team Configuration Setup
        <IconButton
          onClick={onClose}
          sx={{
            position: 'absolute',
            right: theme.spacing(1),
            top: theme.spacing(1),
          }}
        >
          <CloseIcon />
        </IconButton>
      </DialogTitle>
      <DialogContent dividers>
        <Typography variant="body1">
          You are about to set up several components that define how your AI system will be tested:
        </Typography>
        <ul>
          <li>
            <strong>Application:</strong> Metadata used to tailor the adversarial inputs to your
            application.
          </li>
          <li>
            <strong>Targets:</strong> The specific endpoints, models, or components of your AI
            system that will be tested.
          </li>
          <li>
            <strong>Plugins:</strong> Modules that generate diverse adversarial inputs, simulating
            various types of attacks or edge cases.
          </li>
          <li>
            <strong>Strategies:</strong> Define how adversarial inputs are delivered to your system,
            including techniques like jailbreaking and prompt injection.
          </li>
        </ul>
        <Grid item xs={12}>
          <Box
            sx={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              mt: 4,
            }}
          >
            <Link
              href="https://www.promptfoo.dev/docs/red-team/"
              target="_blank"
              rel="noopener noreferrer"
              sx={{ textDecoration: 'none', color: theme.palette.primary.main }}
            >
              Learn more about LLM red teaming
            </Link>
            <Button
              variant="contained"
              endIcon={<KeyboardArrowRightIcon />}
              onClick={onClose}
              sx={{
                backgroundColor: theme.palette.primary.main,
                '&:hover': { backgroundColor: theme.palette.primary.dark },
                px: 4,
                py: 1,
              }}
            >
              Get Started
            </Button>
          </Box>
        </Grid>
      </DialogContent>
    </Dialog>
  );
}
