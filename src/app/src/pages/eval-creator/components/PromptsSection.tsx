import React, { useState, useRef, useEffect } from 'react';
import { useStore } from '@app/stores/evalConfig';
import Copy from '@mui/icons-material/ContentCopy';
import Delete from '@mui/icons-material/Delete';
import Edit from '@mui/icons-material/Edit';
import Publish from '@mui/icons-material/Publish';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogContentText from '@mui/material/DialogContentText';
import DialogTitle from '@mui/material/DialogTitle';
import IconButton from '@mui/material/IconButton';
import Stack from '@mui/material/Stack';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableRow from '@mui/material/TableRow';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import PromptDialog from './PromptDialog';
import './PromptsSection.css';

const PromptsSection: React.FC = () => {
  const [promptDialogOpen, setPromptDialogOpen] = useState(false);
  const [editingPromptIndex, setEditingPromptIndex] = useState<number | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [promptToDelete, setPromptToDelete] = useState<number | null>(null);

  const { config, updateConfig } = useStore();
  const prompts = (config.prompts || []) as string[];
  const setPrompts = (p: string[]) => updateConfig({ prompts: p });
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
    setPromptToDelete(indexToRemove);
    setDeleteDialogOpen(true);
  };

  const confirmDeletePrompt = () => {
    if (promptToDelete !== null) {
      setPrompts(prompts.filter((_, index) => index !== promptToDelete));
      setPromptToDelete(null);
    }
    setDeleteDialogOpen(false);
  };

  const cancelDeletePrompt = () => {
    setPromptToDelete(null);
    setDeleteDialogOpen(false);
  };

  return (
    <div>
      <Stack direction="row" spacing={2} mb={2} justifyContent="space-between">
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
          {prompts.length === 0 && (
            <Button
              color="secondary"
              onClick={() => {
                const examplePrompt =
                  'Write a short, fun story about a {{animal}} going on an adventure in {{location}}. Make it entertaining and suitable for children.';
                setPrompts([...prompts, examplePrompt]);
              }}
              sx={{ mr: 1 }}
            >
              Add Example
            </Button>
          )}
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
                        .map((part: string, i: number) =>
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
        prompt={editingPromptIndex === null ? '' : prompts[editingPromptIndex]}
        index={editingPromptIndex === null ? 0 : editingPromptIndex}
        onAdd={(newPrompt) => {
          if (editingPromptIndex === null) {
            setPrompts([...prompts, newPrompt]);
          } else {
            handleChangePrompt(editingPromptIndex, newPrompt);
          }
          setEditingPromptIndex(null);
        }}
        onCancel={() => {
          setEditingPromptIndex(null);
          setPromptDialogOpen(false);
        }}
      />

      {/* Delete Confirmation Dialog */}
      <Dialog
        open={deleteDialogOpen}
        onClose={cancelDeletePrompt}
        aria-labelledby="delete-prompt-dialog-title"
      >
        <DialogTitle id="delete-prompt-dialog-title">Delete Prompt</DialogTitle>
        <DialogContent>
          <DialogContentText>
            Are you sure you want to delete this prompt? This action cannot be undone.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={cancelDeletePrompt} color="primary">
            Cancel
          </Button>
          <Button onClick={confirmDeletePrompt} color="error" autoFocus>
            Delete
          </Button>
        </DialogActions>
      </Dialog>
    </div>
  );
};

export default PromptsSection;
