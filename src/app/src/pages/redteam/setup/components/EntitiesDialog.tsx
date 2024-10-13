import React, { useState, useEffect } from 'react';
import { callApi } from '@app/utils/api';
import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  Box,
  Typography,
  Switch,
  FormControlLabel,
  List,
  ListItem,
  ListItemText,
  IconButton,
  Tooltip,
} from '@mui/material';
import { useDebouncedCallback } from 'use-debounce';

interface EntitiesDialogProps {
  open: boolean;
  onClose: () => void;
  entities: string[];
  updateEntities: (newEntities: string[]) => void;
  prompts: string[];
}

export default function EntitiesDialog({
  open,
  onClose,
  entities,
  updateEntities,
  prompts,
}: EntitiesDialogProps) {
  const [localEntities, setLocalEntities] = useState<string[]>(entities);
  const [newEntity, setNewEntity] = useState('');
  const [isAutoGenerated, setIsAutoGenerated] = useState(true);

  useEffect(() => {
    setLocalEntities(entities);
  }, [entities]);

  const debouncedUpdateEntities = useDebouncedCallback(async (prompts: string[]) => {
    try {
      const response = await callApi('/redteam/entities', {
        method: 'POST',
        body: JSON.stringify({ prompts }),
      });
      const data = await response.json();
      console.warn(`data: ${data}`);
      setLocalEntities(data.entities);
      updateEntities(data.entities);
    } catch (error) {
      console.error('Failed to update entities:', error);
    }
  }, 1000);

  const handleAddEntity = () => {
    if (newEntity.trim()) {
      const updatedEntities = [...localEntities, newEntity.trim()];
      setLocalEntities(updatedEntities);
      updateEntities(updatedEntities);
      setNewEntity('');
      setIsAutoGenerated(false);
    }
  };

  const handleDeleteEntity = (index: number) => {
    const updatedEntities = localEntities.filter((_, i) => i !== index);
    setLocalEntities(updatedEntities);
    updateEntities(updatedEntities);
    setIsAutoGenerated(false);
  };

  const handleAutoGeneratedToggle = (event: React.ChangeEvent<HTMLInputElement>) => {
    const isChecked = event.target.checked;
    setIsAutoGenerated(isChecked);
    if (isChecked) {
      debouncedUpdateEntities(prompts);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle>Manage Entities</DialogTitle>
      <DialogContent>
        <Typography variant="body1" paragraph>
          Entities are key concepts, objects, or themes mentioned in your prompts. They help in
          understanding the scope and focus of your application.
        </Typography>
        <Box mb={2}>
          <FormControlLabel
            control={
              <Switch
                checked={isAutoGenerated}
                onChange={handleAutoGeneratedToggle}
                name="autoGenerated"
              />
            }
            label="Auto-generate entities"
          />
        </Box>
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
            disabled={isAutoGenerated}
          />
          <Button
            startIcon={<AddIcon />}
            onClick={handleAddEntity}
            disabled={isAutoGenerated || !newEntity.trim()}
            sx={{ ml: 2 }}
          >
            Add
          </Button>
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} color="primary">
          Close
        </Button>
      </DialogActions>
    </Dialog>
  );
}
