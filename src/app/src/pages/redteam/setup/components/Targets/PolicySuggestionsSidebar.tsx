import React from 'react';

import AddIcon from '@mui/icons-material/Add';
import AutoFixHighIcon from '@mui/icons-material/AutoFixHigh';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import CircularProgress from '@mui/material/CircularProgress';
import Paper from '@mui/material/Paper';
import Typography from '@mui/material/Typography';

type PolicySuggestion = {
  name: string;
  text: string;
};

type PolicySuggestionsSidebarProps = {
  isGeneratingPolicies: boolean;
  suggestedPolicies: PolicySuggestion[];
  onGeneratePolicies: () => void;
  onAddSuggestedPolicy: (policy: PolicySuggestion) => void;
};

export const PolicySuggestionsSidebar: React.FC<PolicySuggestionsSidebarProps> = ({
  isGeneratingPolicies,
  suggestedPolicies,
  onGeneratePolicies,
  onAddSuggestedPolicy,
}) => {
  return (
    <Paper
      elevation={2}
      sx={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        backgroundColor: 'background.paper',
        border: '1px solid',
        borderColor: 'divider',
        overflow: 'hidden',
      }}
    >
      {/* Header - fixed */}
      <Box
        sx={{
          p: 2,
          borderBottom: '1px solid',
          borderColor: 'divider',
          backgroundColor: 'action.hover',
          flexShrink: 0,
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <AutoFixHighIcon color="action" />
          <Typography variant="subtitle1" fontWeight={600} color="text.primary">
            Suggested Policies
          </Typography>
        </Box>
      </Box>

      {/* Content - scrollable */}
      <Box
        sx={{
          flex: 1,
          overflow: 'auto',
          p: 2,
        }}
      >
        {/* Show generate button when not generating and no suggestions */}
        {!isGeneratingPolicies && suggestedPolicies.length === 0 && (
          <Box sx={{ py: 4, px: 1 }}>
            <Typography variant="body2" color="text.secondary" align="center" sx={{ mb: 2 }}>
              Generate AI-powered policy suggestions based on your application.
            </Typography>
            <Button
              variant="contained"
              color="primary"
              fullWidth
              onClick={onGeneratePolicies}
              startIcon={<AutoFixHighIcon />}
              disabled={isGeneratingPolicies}
            >
              Generate Suggestions
            </Button>
          </Box>
        )}

        {isGeneratingPolicies && suggestedPolicies.length === 0 && (
          <Box
            sx={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 2,
              py: 4,
            }}
          >
            <CircularProgress size={32} />
            <Typography variant="body2" color="text.secondary" align="center">
              Analyzing your application to generate relevant policies...
            </Typography>
          </Box>
        )}

        {suggestedPolicies.length > 0 && (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
            {suggestedPolicies.map((policy, index) => (
              <Card
                key={index}
                variant="outlined"
                onClick={() => onAddSuggestedPolicy(policy)}
                sx={{
                  backgroundColor: 'background.default',
                  cursor: 'pointer',
                  '&:hover': {
                    boxShadow: 2,
                    borderColor: 'primary.main',
                    backgroundColor: 'background.paper',
                    transform: 'translateY(-1px)',
                  },
                  transition: 'all 0.2s',
                }}
              >
                <CardContent sx={{ p: 1.5, '&:last-child': { pb: 1.5 } }}>
                  <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'flex-start' }}>
                    <AddIcon
                      fontSize="small"
                      color="primary"
                      sx={{
                        mt: 0.25,
                        flexShrink: 0,
                      }}
                    />
                    <Box sx={{ flex: 1 }}>
                      <Typography
                        variant="subtitle2"
                        fontWeight={600}
                        color="text.primary"
                        gutterBottom
                      >
                        {policy.name}
                      </Typography>
                      <Typography variant="body2" color="text.secondary" sx={{ lineHeight: 1.5 }}>
                        {policy.text}
                      </Typography>
                    </Box>
                  </Box>
                </CardContent>
              </Card>
            ))}
          </Box>
        )}
      </Box>
    </Paper>
  );
};
