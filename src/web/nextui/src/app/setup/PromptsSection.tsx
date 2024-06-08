import React, { useState, useRef, useEffect } from 'react';
import Button from '@mui/material/Button';
import Typography from '@mui/material/Typography';
import IconButton from '@mui/material/IconButton';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableRow from '@mui/material/TableRow';
import Tooltip from '@mui/material/Tooltip';
import Stack from '@mui/material/Stack';
import Edit from '@mui/icons-material/Edit';
import Delete from '@mui/icons-material/Delete';
import Publish from '@mui/icons-material/Publish';
import Copy from '@mui/icons-material/ContentCopy';

import PromptDialog from './PromptDialog';
import { useStore } from '@/state/evalConfig';

import './PromptsSection.css';

const PromptsSection: React.FC = () => {
  const [promptDialogOpen, setPromptDialogOpen] = useState(false);
  const [editingPromptIndex, setEditingPromptIndex] = useState<number | null>(null);

  const { prompts, setPrompts } = useStore();
  const newPromptInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editingPromptIndex !== null && editingPromptIndex > 0 && newPromptInputRef.current) {
      newPromptInputRef.current.focus();
    }
  }, [editingPromptIndex]);

  const handleEditPrompt = (index: number) => {
    setEditingPromptIndex(index);
    setPromptDialogOpen(true);
  };

  const handleAddPromptFromFile = (event: React.ChangeEvent<HTMLInputElement>) => {
    event.stopPropagation();
    event.preventDefault();

    const file = event.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (e) => {
        const text = e.target?.result?.toString();
        if (text) {
          setPrompts([...prompts, text]);
        }
      };
      reader.readAsText(file);
    }
  };

  const handleDuplicatePrompt = (event: React.MouseEvent, index: number) => {
    event.stopPropagation();
    const duplicatedPrompt = prompts[index];
    setPrompts([...prompts, duplicatedPrompt]);
  };

  const handleChangePrompt = (index: number, newPrompt: string) => {
    setPrompts(prompts.map((p, i) => (i === index ? newPrompt : p)));
  };

  const handleRemovePrompt = (event: React.MouseEvent, indexToRemove: number) => {
    event.stopPropagation();

    if (confirm('Are you sure you want to remove this prompt?')) {
      setPrompts(prompts.filter((_, index) => index !== indexToRemove));
    }
  };

  return (
    <div>
      <Stack direction="row" spacing={2} justifyContent="space-between">
        <Typography variant="h5">Prompts</Typography>
        <div>
          <label htmlFor={`file-input-add-prompt`}>
            <Tooltip title="Upload prompt from file">
              <span>
                <IconButton component="span">
                  <Publish />
                </IconButton>
                <input
                  id={`file-input-add-prompt`}
                  type="file"
                  accept=".txt,.md"
                  onChange={handleAddPromptFromFile}
                  style={{ display: 'none' }}
                />
              </span>
            </Tooltip>
          </label>
          <Button
            color="primary"
            onClick={() => {
              setPromptDialogOpen(true);
            }}
            variant="contained"
          >
            Add Prompt
          </Button>
        </div>
      </Stack>
      <TableContainer>
        <Table>
          <TableBody>
            {prompts.length === 0 ? (
              <TableRow>
                <TableCell colSpan={2} align="center">
                  No prompts added yet.
                </TableCell>
              </TableRow>
            ) : (
              prompts.map((prompt, index) => (
                <TableRow
                  key={index}
                  sx={{
                    '&:hover': {
                      backgroundColor: 'rgba(0, 0, 0, 0.04)',
                      cursor: 'pointer',
                    },
                  }}
                  onClick={() => handleEditPrompt(index)}
                >
                  <TableCell>
                    <Typography variant="body2">
                      {`Prompt #${index + 1}: `}
                      {(prompt.length > 250 ? prompt.slice(0, 250) + ' ...' : prompt)
                        .split(/({{\w+}})/g)
                        .map((part, i) =>
                          /{{\s*(\w+)\s*}}/g.test(part) ? (
                            <span key={i} className="prompt-var-highlight">
                              {part}
                            </span>
                          ) : (
                            part
                          ),
                        )}
                    </Typography>
                  </TableCell>
                  <TableCell align="right" sx={{ minWidth: 150 }}>
                    <IconButton onClick={() => handleEditPrompt(index)} size="small">
                      <Edit />
                    </IconButton>
                    <IconButton
                      onClick={(event) => handleDuplicatePrompt(event, index)}
                      size="small"
                    >
                      <Copy />
                    </IconButton>
                    <IconButton onClick={(event) => handleRemovePrompt(event, index)} size="small">
                      <Delete />
                    </IconButton>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </TableContainer>
      <PromptDialog
        open={promptDialogOpen}
        prompt={editingPromptIndex !== null ? prompts[editingPromptIndex] : ''}
        index={editingPromptIndex !== null ? editingPromptIndex : 0}
        onAdd={(newPrompt) => {
          if (editingPromptIndex !== null) {
            handleChangePrompt(editingPromptIndex, newPrompt);
          } else {
            setPrompts([...prompts, newPrompt]);
          }
          setEditingPromptIndex(null);
        }}
        onCancel={() => {
          setEditingPromptIndex(null);
          setPromptDialogOpen(false);
        }}
      />
    </div>
  );
};

export default PromptsSection;
