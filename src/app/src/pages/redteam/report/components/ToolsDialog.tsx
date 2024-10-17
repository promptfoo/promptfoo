import React from 'react';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import ListItemText from '@mui/material/ListItemText';
import Typography from '@mui/material/Typography';

interface Tool {
  type: string;
  function?: {
    name: string;
    description: string;
    parameters: {
      type: string;
      properties: Record<string, unknown>;
      required: string[];
    };
  };
}

interface ToolsDialogProps {
  open: boolean;
  onClose: () => void;
  tools: Tool[];
}

const ToolsDialog: React.FC<ToolsDialogProps> = ({ open, onClose, tools }) => {
  if (!tools || tools.length === 0) {
    return null;
  }
  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle>Available Tools</DialogTitle>
      <DialogContent>
        <List>
          {tools.map((tool, index) => (
            <ListItem key={index}>
              {tool?.type === 'function' && tool.function ? (
                <ListItemText
                  primary={tool.function.name}
                  secondary={
                    <>
                      <Typography component="span" variant="body2" color="text.primary">
                        {tool.function.description}
                      </Typography>
                      <Typography component="pre" variant="body2">
                        {JSON.stringify(tool.function.parameters, null, 2)}
                      </Typography>
                    </>
                  }
                />
              ) : (
                <ListItemText
                  primary="Unknown Tool Type"
                  secondary={
                    <Typography component="pre" variant="body2">
                      {JSON.stringify(tool, null, 2)}
                    </Typography>
                  }
                />
              )}
            </ListItem>
          ))}
        </List>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Close</Button>
      </DialogActions>
    </Dialog>
  );
};

export default ToolsDialog;
