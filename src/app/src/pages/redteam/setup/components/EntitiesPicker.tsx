import React, { useState, useEffect } from 'react';
import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import IconButton from '@mui/material/IconButton';
import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import ListItemText from '@mui/material/ListItemText';
import TextField from '@mui/material/TextField';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';

interface EntitiesProps {
  autoGenerate: boolean;
  entities: string[];
  updateEntities: (newEntities: string[]) => void;
  prompts: string[];
}

export default function Entities({
  entities,
  updateEntities,
  prompts,
  autoGenerate,
}: EntitiesProps) {
  const [localEntities, setLocalEntities] = useState<string[]>(entities);
  const [newEntity, setNewEntity] = useState('');

  useEffect(() => {
    setLocalEntities(entities);
  }, [entities]);

  const handleAddEntity = () => {
    if (newEntity.trim()) {
      const updatedEntities = [...localEntities, newEntity.trim()];
      setLocalEntities(updatedEntities);
      updateEntities(updatedEntities);
      setNewEntity('');
    }
  };

  const handleKeyPress = (event: React.KeyboardEvent) => {
    if (event.key === 'Enter') {
      handleAddEntity();
    }
  };

  const handleDeleteEntity = (index: number) => {
    const updatedEntities = localEntities.filter((_, i) => i !== index);
    setLocalEntities(updatedEntities);
    updateEntities(updatedEntities);
  };

  return (
    <Box>
      <Typography variant="body2">
        Entities are key concepts, people, or brands related to your application. We use these when
        generating inputs and grading outputs.
      </Typography>
      <List>
        {(localEntities ?? []).map((entity, index) => (
          <ListItem
            key={index}
            secondaryAction={
              <Tooltip title="Remove entity">
                <IconButton
                  edge="end"
                  aria-label="delete"
                  onClick={() => handleDeleteEntity(index)}
                >
                  <DeleteIcon />
                </IconButton>
              </Tooltip>
            }
          >
            <ListItemText primary={entity} />
          </ListItem>
        ))}
      </List>
      <Box display="flex" alignItems="center" mt={2}>
        <TextField
          fullWidth
          label="Add new entity"
          value={newEntity}
          onChange={(e) => setNewEntity(e.target.value)}
          onKeyPress={handleKeyPress}
          disabled={autoGenerate}
        />
        <Button
          startIcon={<AddIcon />}
          onClick={handleAddEntity}
          disabled={autoGenerate || !newEntity.trim()}
          sx={{ ml: 2 }}
        >
          Add
        </Button>
      </Box>
    </Box>
  );
}
