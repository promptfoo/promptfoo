import React from 'react';
import Editor from 'react-simple-code-editor';
import FormatIndentIncreaseIcon from '@mui/icons-material/FormatIndentIncrease';
import { Box, Typography, IconButton, useTheme } from '@mui/material';
import { highlight, languages } from 'prismjs/components/prism-core';
import 'prismjs/components/prism-javascript';

interface CodeEditorProps {
  label: string;
  value: string;
  onChange: (code: string) => void;
  placeholder?: string;
  minHeight?: string;
}

const CodeEditor: React.FC<CodeEditorProps> = ({
  label,
  value,
  onChange,
  placeholder,
  minHeight = '150px',
}) => {
  const theme = useTheme();
  const darkMode = theme.palette.mode === 'dark';

  const formatCode = () => {
    const code = value;
    if (!code.trim()) {
      return;
    }

    // Split into lines and find minimum indentation
    const lines = code.split('\n');
    const nonEmptyLines = lines.filter((line: string) => line.trim());
    const minIndent = Math.min(
      ...nonEmptyLines.map((line: string) => {
        const match = line.match(/^\s*/);
        return match ? match[0].length : 0;
      }),
    );

    // Remove common indentation and trim trailing whitespace
    const formattedLines = lines.map((line: string) => {
      if (!line.trim()) {
        return '';
      }
      return line.slice(minIndent).trimEnd();
    });

    // Trim leading/trailing empty lines
    while (formattedLines[0] === '') {
      formattedLines.shift();
    }
    while (formattedLines[formattedLines.length - 1] === '') {
      formattedLines.pop();
    }

    onChange(formattedLines.join('\n'));
  };

  return (
    <>
      <Box sx={{ display: 'flex', alignItems: 'center' }}>
        <Typography variant="subtitle1" sx={{ flexGrow: 1 }}>
          {label}
        </Typography>
        <IconButton onClick={formatCode} size="small" title="Format code">
          <FormatIndentIncreaseIcon />
        </IconButton>
      </Box>
      <Box
        sx={{
          border: 1,
          borderColor: theme.palette.divider,
          borderRadius: 1,
          backgroundColor: theme.palette.mode === 'dark' ? '#1e1e1e' : '#ffffff',
          '& .token': {
            background: 'transparent !important',
          },
          mt: 1,
          position: 'relative',
          minHeight,
        }}
      >
        <Editor
          value={value || ''}
          onValueChange={onChange}
          highlight={(code) => highlight(code, languages.javascript)}
          padding={10}
          style={{
            fontFamily: '"Fira code", "Fira Mono", monospace',
            fontSize: 14,
            backgroundColor: darkMode ? '#1e1e1e' : '#f5f5f5',
            color: theme.palette.text.primary,
            minHeight,
          }}
          placeholder={placeholder}
          className={darkMode ? 'dark-syntax' : ''}
        />
      </Box>
    </>
  );
};

export default CodeEditor;
