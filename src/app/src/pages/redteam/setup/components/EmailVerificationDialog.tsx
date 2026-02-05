import React, { useState } from 'react';

import { Button } from '@app/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@app/components/ui/dialog';
import { HelperText } from '@app/components/ui/helper-text';
import { Input } from '@app/components/ui/input';
import { Label } from '@app/components/ui/label';
import { Spinner } from '@app/components/ui/spinner';
import { useEmailVerification } from '@app/hooks/useEmailVerification';
import { useToast } from '@app/hooks/useToast';

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
  const { saveEmail, clearEmail, checkEmailStatus } = useEmailVerification();
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
        clearEmail();
        setEmailError(result.error || 'Failed to verify email');
        return;
      }

      // Validate the email after saving
      // Necessary because validation path depends on the email being set
      const statusResult = await checkEmailStatus({ validate: true });

      if (statusResult.error) {
        clearEmail();
        setEmailError(statusResult.error);
        return;
      }

      if (!statusResult.canProceed) {
        clearEmail();
        setEmailError('Email validation failed. Please use a different email.');
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
      onOpenChange={(isOpen) => {
        if (!isOpen && !isSubmitting) {
          onClose();
        }
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Email Required</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <p className="text-muted-foreground">{message}</p>

          <div className="space-y-2">
            <Label htmlFor="email">Work Email Address</Label>
            <Input
              id="email"
              autoFocus
              type="email"
              value={email}
              onChange={handleEmailChange}
              onKeyDown={handleKeyPress}
              disabled={isSubmitting}
              placeholder="your.email@company.com"
              className={emailError ? 'border-destructive' : ''}
            />
            {emailError && <HelperText error>{emailError}</HelperText>}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={isSubmitting || !email.trim()}>
            {isSubmitting ? (
              <>
                <Spinner className="mr-2 size-4" />
                Verifying...
              </>
            ) : (
              'Verify Email'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
