import React, { useState } from 'react';

import { useEmailVerification } from '@app/hooks/useEmailVerification';
import { useToast } from '@app/hooks/useToast';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';

interface EmailVerificationDialogProps {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
  message?: string;
}

export function EmailVerificationDialog({
  open,
  onClose,
  onSuccess,
  message = 'Redteam evals require email verification. Please enter your work email:',
}: EmailVerificationDialogProps) {
  const [email, setEmail] = useState('');
  const [emailError, setEmailError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { saveEmail } = useEmailVerification();
  const { showToast } = useToast();

  const validateEmail = (email: string): boolean => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  };

  const handleEmailChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const newEmail = event.target.value;
    setEmail(newEmail);

    if (emailError && newEmail && validateEmail(newEmail)) {
      setEmailError('');
    }
  };

  const handleSubmit = async () => {
    if (!email.trim()) {
      setEmailError('Email is required');
      return;
    }

    if (!validateEmail(email)) {
      setEmailError('Please enter a valid email address');
      return;
    }

    setIsSubmitting(true);
    setEmailError('');

    try {
      const result = await saveEmail(email);

      if (result.error) {
        setEmailError(result.error || 'Failed to verify email');
        return;
      }
      showToast('Email saved successfully, starting redteam.');
      onSuccess();
    } catch (error) {
      console.error('Error submitting email:', error);
      setEmailError(
        `An unexpected error occurred: ${error instanceof Error ? error.message : error}.`,
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleKeyPress = (event: React.KeyboardEvent) => {
    if (event.key === 'Enter' && !isSubmitting) {
      handleSubmit();
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="sm"
      fullWidth
      disableEscapeKeyDown={isSubmitting}
      slotProps={{
        backdrop: {
          onClick: isSubmitting ? (event) => event.stopPropagation() : undefined,
        },
      }}
    >
      <DialogTitle>Email Required</DialogTitle>
      <DialogContent>
        <Box sx={{ mb: 2 }}>
          <Typography variant="body1" sx={{ mb: 2 }}>
            {message}
          </Typography>

          <TextField
            autoFocus
            fullWidth
            label="Work Email Address"
            type="email"
            value={email}
            onChange={handleEmailChange}
            onKeyDown={handleKeyPress}
            error={!!emailError}
            helperText={emailError}
            disabled={isSubmitting}
            placeholder="your.email@company.com"
          />
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={isSubmitting}>
          Cancel
        </Button>
        <Button
          onClick={handleSubmit}
          variant="contained"
          disabled={isSubmitting || !email.trim()}
          startIcon={isSubmitting ? <CircularProgress size={20} /> : null}
        >
          {isSubmitting ? 'Verifying...' : 'Verify Email'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
