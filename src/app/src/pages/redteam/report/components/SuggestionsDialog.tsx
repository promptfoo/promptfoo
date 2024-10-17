import React from 'react';
import CloseIcon from '@mui/icons-material/Close';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import Accordion from '@mui/material/Accordion';
import AccordionDetails from '@mui/material/AccordionDetails';
import AccordionSummary from '@mui/material/AccordionSummary';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import IconButton from '@mui/material/IconButton';
import Typography from '@mui/material/Typography';
import { useTheme } from '@mui/material/styles';
import type { GradingResult, ResultSuggestion } from '@promptfoo/types';

interface SuggestionsDialogProps {
  open: boolean;
  onClose: () => void;
  gradingResult: GradingResult | undefined;
}

const extractSuggestions = (gradingResult: GradingResult | undefined): ResultSuggestion[] => {
  if (!gradingResult) {
    return [];
  }

  const suggestions: ResultSuggestion[] = [];

  if (gradingResult.suggestions) {
    suggestions.push(...gradingResult.suggestions);
  }

  if (gradingResult.componentResults) {
    gradingResult.componentResults.forEach((componentResult) => {
      if (componentResult.suggestions) {
        suggestions.push(...componentResult.suggestions);
      }
    });
  }

  return suggestions;
};

export default function SuggestionsDialog({
  open,
  onClose,
  gradingResult,
}: SuggestionsDialogProps) {
  const suggestions = extractSuggestions(gradingResult);
  const theme = useTheme();

  const [copiedIndex, setCopiedIndex] = React.useState<number | null>(null);

  const handleCopy = (text: string, index: number) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopiedIndex(index);
      setTimeout(() => setCopiedIndex(null), 2000);
    });
  };

  const getActionTitle = (action: string) => {
    console.log('action', action);
    switch (action) {
      case 'replace-prompt':
        return 'Modify prompt';
      default:
        return 'Suggestion';
    }
  };

  const getExplanation = (type: string) => {
    if (type === 'datamark') {
      return (
        <Typography variant="body2" sx={{ mb: 2 }}>
          This suggestion uses a technique known as "spotlighting" or "datamarking" for
          user-generated text, as described in the paper{' '}
          <a href="https://arxiv.org/abs/2403.14720" target="_blank" rel="noopener noreferrer">
            "Defending Against Indirect Prompt Injection Attacks With Spotlighting"
          </a>
          . Spotlighting helps improve LLMs' ability to distinguish between multiple sources of
          input.
        </Typography>
      );
    }
    if (type === 'encoding') {
      return (
        <Typography variant="body2" sx={{ mb: 2 }}>
          This suggestion uses a base64 encoding technique for user-generated text, as described in
          the paper{' '}
          <a href="https://arxiv.org/abs/2403.14720" target="_blank" rel="noopener noreferrer">
            "Defending Against Indirect Prompt Injection Attacks With Spotlighting"
          </a>
          . Encoding helps improve LLMs' ability to distinguish between multiple sources of input.
        </Typography>
      );
    }
    return null;
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      aria-labelledby="suggestion-dialog-title"
      maxWidth="md"
      fullWidth
    >
      <DialogTitle id="suggestion-dialog-title">
        <Typography variant="h5" component="span">
          Suggestions
        </Typography>
        <IconButton
          aria-label="close"
          onClick={onClose}
          sx={{
            position: 'absolute',
            right: 16,
            top: 16,
            color: theme.palette.grey[500],
          }}
        >
          <CloseIcon />
        </IconButton>
      </DialogTitle>
      <DialogContent sx={{ p: 3 }}>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          {suggestions.map((suggestion, index) => (
            <Card key={index} elevation={2}>
              <CardContent>
                <Typography variant="h6" gutterBottom>
                  {getActionTitle(suggestion.action || '')}
                </Typography>
                {getExplanation(suggestion.type)}
                <Accordion
                  sx={{
                    boxShadow: 'none',
                  }}
                >
                  <AccordionSummary
                    expandIcon={<ExpandMoreIcon />}
                    sx={{
                      px: 1,
                      py: 0,
                    }}
                  >
                    <Typography variant="body2">View suggested prompt</Typography>
                  </AccordionSummary>
                  <AccordionDetails
                    sx={{
                      px: 1,
                      py: 0,
                      position: 'relative',
                      '&:hover .copy-icon': {
                        display: 'block',
                      },
                    }}
                  >
                    <Box
                      component="pre"
                      sx={{
                        fontFamily: 'monospace',
                        whiteSpace: 'pre-wrap',
                        wordBreak: 'break-word',
                        p: 0,
                        pr: 6,
                        fontSize: '0.875rem',
                      }}
                    >
                      {suggestion.value}
                    </Box>
                    <IconButton
                      onClick={() => handleCopy(suggestion.value, index)}
                      className="copy-icon"
                      sx={{
                        position: 'absolute',
                        top: 8,
                        right: 8,
                        backgroundColor: theme.palette.background.paper,
                        display: 'none', // Initially hide the button
                        '&:hover': {
                          backgroundColor: theme.palette.action.hover,
                        },
                      }}
                    >
                      <ContentCopyIcon fontSize="small" />
                    </IconButton>
                    {copiedIndex === index && (
                      <Typography
                        variant="caption"
                        sx={{
                          position: 'absolute',
                          top: 14,
                          right: 48,
                          backgroundColor: theme.palette.background.paper,
                          padding: '2px 4px',
                          borderRadius: 1,
                        }}
                      >
                        Copied!
                      </Typography>
                    )}
                  </AccordionDetails>
                </Accordion>
              </CardContent>
            </Card>
          ))}
        </Box>
      </DialogContent>
      <DialogActions sx={{ p: 3, pt: 0 }}>
        <Button onClick={onClose} variant="contained" color="primary">
          Close
        </Button>
      </DialogActions>
    </Dialog>
  );
}
