import React, { useState, useEffect } from 'react';
import { callApi } from '@app/utils/api';
import { useToast } from '@app/hooks/useToast';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import RefreshIcon from '@mui/icons-material/Refresh';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Chip from '@mui/material/Chip';
import CircularProgress from '@mui/material/CircularProgress';
import IconButton from '@mui/material/IconButton';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';

interface SmartVariableSuggestionsProps {
  promptContent: string;
  variables: string[];
  onApplySuggestions: (suggestions: Record<string, string>) => void;
}

interface VariableSuggestion {
  variable: string;
  suggestions: string[];
  explanation?: string;
}

export default function SmartVariableSuggestions({
  promptContent,
  variables,
  onApplySuggestions,
}: SmartVariableSuggestionsProps) {
  const [loading, setLoading] = useState(false);
  const [suggestions, setSuggestions] = useState<VariableSuggestion[]>([]);
  const [selectedValues, setSelectedValues] = useState<Record<string, string>>({});
  const { showToast } = useToast();

  useEffect(() => {
    // Reset when variables change
    setSuggestions([]);
    setSelectedValues({});
  }, [variables.join(',')]);

  const generateSuggestions = async () => {
    if (variables.length === 0) {
      showToast('No variables found in the prompt', 'info');
      return;
    }

    setLoading(true);
    try {
      // Prepare the prompt for the LLM
      const systemPrompt = `You are an AI assistant helping to generate test values for prompt variables.
Given a prompt template and a list of variables, suggest 3-5 realistic test values for each variable.
Consider the context of the prompt to make relevant suggestions.

Output format (JSON):
{
  "suggestions": [
    {
      "variable": "variable_name",
      "suggestions": ["value1", "value2", "value3"],
      "explanation": "Brief explanation of why these values are suitable"
    }
  ]
}`;

      const userPrompt = `Prompt template:
${promptContent}

Variables to generate suggestions for: ${variables.join(', ')}

Generate diverse, realistic test values that would help test different aspects of this prompt.`;

      const response = await callApi('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: userPrompt,
          systemPrompt,
          provider: 'openai:gpt-3.5-turbo',
          temperature: 0.7,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to generate suggestions');
      }

      const data = await response.json();
      
      // Parse the LLM response
      let parsedSuggestions;
      try {
        const output = typeof data.output === 'string' ? data.output : JSON.stringify(data.output);
        // Extract JSON from the response (in case it's wrapped in markdown or other text)
        const jsonMatch = output.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          parsedSuggestions = JSON.parse(jsonMatch[0]);
        } else {
          throw new Error('No JSON found in response');
        }
      } catch (parseError) {
        console.error('Failed to parse LLM response:', parseError);
        // Fallback to simple suggestions
        parsedSuggestions = {
          suggestions: variables.map(v => ({
            variable: v,
            suggestions: generateFallbackSuggestions(v, promptContent),
            explanation: 'Generated based on variable name',
          })),
        };
      }

      setSuggestions(parsedSuggestions.suggestions);
      
      // Auto-select first suggestion for each variable
      const initialSelections: Record<string, string> = {};
      parsedSuggestions.suggestions.forEach((s: VariableSuggestion) => {
        if (s.suggestions.length > 0) {
          initialSelections[s.variable] = s.suggestions[0];
        }
      });
      setSelectedValues(initialSelections);
      
    } catch (error) {
      console.error('Error generating suggestions:', error);
      // Generate fallback suggestions
      const fallbackSuggestions = variables.map(v => ({
        variable: v,
        suggestions: generateFallbackSuggestions(v, promptContent),
        explanation: 'Generated based on variable name and context',
      }));
      setSuggestions(fallbackSuggestions);
      
      showToast('Using fallback suggestions. For better results, configure an LLM provider.', 'warning');
    } finally {
      setLoading(false);
    }
  };

  const generateFallbackSuggestions = (variable: string, prompt: string): string[] => {
    const lowerVar = variable.toLowerCase();
    const lowerPrompt = prompt.toLowerCase();

    // Common test values based on variable name patterns
    if (lowerVar.includes('name') || lowerVar.includes('user')) {
      return ['Alice Johnson', 'Bob Smith', 'Charlie Brown', 'Test User'];
    }
    if (lowerVar.includes('email')) {
      return ['user@example.com', 'test@company.com', 'admin@site.org'];
    }
    if (lowerVar.includes('age') || lowerVar.includes('number') || lowerVar.includes('count')) {
      return ['25', '42', '18', '65'];
    }
    if (lowerVar.includes('date') || lowerVar.includes('time')) {
      return ['2024-01-15', 'today', 'next week', '2023-12-25'];
    }
    if (lowerVar.includes('question') || lowerVar.includes('query')) {
      if (lowerPrompt.includes('customer') || lowerPrompt.includes('support')) {
        return [
          'How do I reset my password?',
          'What is your refund policy?',
          'My order hasn\'t arrived yet',
          'How can I contact support?'
        ];
      }
      return ['What is this?', 'How does it work?', 'Can you help me?', 'Tell me more'];
    }
    if (lowerVar.includes('text') || lowerVar.includes('content') || lowerVar.includes('message')) {
      return [
        'This is a test message',
        'Lorem ipsum dolor sit amet',
        'Please process this request',
        'Hello, I need assistance'
      ];
    }
    if (lowerVar.includes('url') || lowerVar.includes('link')) {
      return ['https://example.com', 'https://test.org/page', 'https://demo.site/api'];
    }
    if (lowerVar.includes('code')) {
      return ['console.log("test");', 'function hello() { return "world"; }', 'SELECT * FROM users;'];
    }
    
    // Generic fallback
    return [`test_${variable}_1`, `sample_${variable}`, `example ${variable}`, variable];
  };

  const handleSelectValue = (variable: string, value: string) => {
    setSelectedValues(prev => ({
      ...prev,
      [variable]: value,
    }));
  };

  const handleCopyValue = (value: string) => {
    navigator.clipboard.writeText(value);
    showToast('Copied to clipboard', 'success');
  };

  const handleApplyAll = () => {
    onApplySuggestions(selectedValues);
    showToast('Applied all suggestions', 'success');
  };

  const handleApplySingle = (variable: string) => {
    if (selectedValues[variable]) {
      onApplySuggestions({ [variable]: selectedValues[variable] });
      showToast(`Applied suggestion for ${variable}`, 'success');
    }
  };

  if (variables.length === 0) {
    return null;
  }

  return (
    <Card variant="outlined" sx={{ mt: 2 }}>
      <CardContent>
        <Stack direction="row" alignItems="center" justifyContent="space-between" mb={2}>
          <Stack direction="row" alignItems="center" spacing={1}>
            <AutoAwesomeIcon color="primary" />
            <Typography variant="h6">Smart Variable Suggestions</Typography>
          </Stack>
          <Stack direction="row" spacing={1}>
            {suggestions.length > 0 && (
              <Button
                size="small"
                variant="contained"
                onClick={handleApplyAll}
                disabled={Object.keys(selectedValues).length === 0}
              >
                Apply All
              </Button>
            )}
            <Button
              size="small"
              startIcon={loading ? <CircularProgress size={16} /> : <RefreshIcon />}
              onClick={generateSuggestions}
              disabled={loading}
            >
              {loading ? 'Generating...' : suggestions.length > 0 ? 'Regenerate' : 'Generate'}
            </Button>
          </Stack>
        </Stack>

        {suggestions.length === 0 && !loading && (
          <Typography variant="body2" color="text.secondary">
            Click "Generate" to get AI-powered suggestions for your variables based on the prompt context.
          </Typography>
        )}

        {suggestions.map((suggestion) => (
          <Paper key={suggestion.variable} variant="outlined" sx={{ p: 2, mb: 2 }}>
            <Stack direction="row" alignItems="center" justifyContent="space-between" mb={1}>
              <Typography variant="subtitle1" fontWeight={500}>
                {suggestion.variable}
              </Typography>
              <Button
                size="small"
                onClick={() => handleApplySingle(suggestion.variable)}
                disabled={!selectedValues[suggestion.variable]}
              >
                Apply
              </Button>
            </Stack>
            
            {suggestion.explanation && (
              <Typography variant="caption" color="text.secondary" display="block" mb={1}>
                {suggestion.explanation}
              </Typography>
            )}
            
            <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
              {suggestion.suggestions.map((value) => (
                <Chip
                  key={value}
                  label={value}
                  onClick={() => handleSelectValue(suggestion.variable, value)}
                  onDelete={() => handleCopyValue(value)}
                  deleteIcon={
                    <Tooltip title="Copy to clipboard">
                      <ContentCopyIcon fontSize="small" />
                    </Tooltip>
                  }
                  color={selectedValues[suggestion.variable] === value ? 'primary' : 'default'}
                  variant={selectedValues[suggestion.variable] === value ? 'filled' : 'outlined'}
                  sx={{ mb: 1 }}
                />
              ))}
            </Stack>
          </Paper>
        ))}
      </CardContent>
    </Card>
  );
} 