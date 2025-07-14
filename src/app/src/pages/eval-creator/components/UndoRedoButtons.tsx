import React, { useEffect } from 'react';
import { IconButton, Tooltip, Stack } from '@mui/material';
import UndoIcon from '@mui/icons-material/Undo';
import RedoIcon from '@mui/icons-material/Redo';
import { useHistoryStore } from '@app/stores/evalConfigWithHistory';

export const UndoRedoButtons: React.FC = () => {
  const { canUndo, canRedo, undo, redo, getUndoDescription, getRedoDescription } =
    useHistoryStore();

  // Set up keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
      const isCtrlOrCmd = isMac ? e.metaKey : e.ctrlKey;

      if (isCtrlOrCmd && !e.shiftKey && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (canUndo) {
          undo();
        }
      } else if (
        (isCtrlOrCmd && e.shiftKey && e.key.toLowerCase() === 'z') ||
        (isCtrlOrCmd && e.key.toLowerCase() === 'y')
      ) {
        e.preventDefault();
        if (canRedo) {
          redo();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [canUndo, canRedo, undo, redo]);

  const undoDescription = getUndoDescription();
  const redoDescription = getRedoDescription();
  const isMac =
    typeof navigator !== 'undefined' && navigator.platform.toUpperCase().indexOf('MAC') >= 0;

  const undoShortcut = isMac ? '⌘Z' : 'Ctrl+Z';
  const redoShortcut = isMac ? '⌘⇧Z' : 'Ctrl+Y';

  return (
    <Stack direction="row" spacing={0.5}>
      <Tooltip
        title={
          canUndo
            ? `Undo ${undoDescription || 'last change'} (${undoShortcut})`
            : `Nothing to undo (${undoShortcut})`
        }
      >
        <span>
          <IconButton
            size="small"
            disabled={!canUndo}
            onClick={undo}
            sx={{
              opacity: canUndo ? 1 : 0.5,
              '&:disabled': {
                color: 'action.disabled',
              },
            }}
          >
            <UndoIcon fontSize="small" />
          </IconButton>
        </span>
      </Tooltip>

      <Tooltip
        title={
          canRedo
            ? `Redo ${redoDescription || 'last change'} (${redoShortcut})`
            : `Nothing to redo (${redoShortcut})`
        }
      >
        <span>
          <IconButton
            size="small"
            disabled={!canRedo}
            onClick={redo}
            sx={{
              opacity: canRedo ? 1 : 0.5,
              '&:disabled': {
                color: 'action.disabled',
              },
            }}
          >
            <RedoIcon fontSize="small" />
          </IconButton>
        </span>
      </Tooltip>
    </Stack>
  );
};
