import React from 'react';
import JsonTextField from '@app/components/JsonTextField';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import TextField from '@mui/material/TextField';
import type { ProviderOptions } from '@promptfoo/types';

interface ProviderConfigDialogProps {
  open: boolean;
  providerId: string;
  config: ProviderOptions['config'];
  onClose: () => void;
  onSave: (config: ProviderOptions['config']) => void;
}

const ProviderConfigDialog: React.FC<ProviderConfigDialogProps> = ({
  open,
  providerId,
  config,
  onClose,
  onSave,
}) => {
  const [localConfig, setLocalConfig] = React.useState(config);

  React.useEffect(() => {
    setLocalConfig(config);
  }, [config]);

  const handleSave = () => {
    onSave(localConfig);
  };

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="md">
      <DialogTitle>
        Edit {providerId.length > 50 ? providerId.slice(0, 50) + '...' : providerId}
      </DialogTitle>
      <DialogContent>
        {Object.keys(localConfig).map((key) => {
          const value = localConfig[key];
          let handleChange;

          if (
            typeof value === 'number' ||
            typeof value === 'boolean' ||
            typeof value === 'string'
          ) {
            if (typeof value === 'number') {
              handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
                const inputValue = e.target.value;
                const parsedValue = Number.parseFloat(inputValue);

                if (Number.isNaN(parsedValue)) {
                  setLocalConfig({ ...localConfig, [key]: inputValue });
                } else {
                  setLocalConfig({ ...localConfig, [key]: parsedValue });
                }
              };
            } else if (typeof value === 'string') {
              handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
                const inputValue = e.target.value;
                const parsedValue = Number.parseFloat(inputValue);

                if (Number.isNaN(parsedValue)) {
                  setLocalConfig({ ...localConfig, [key]: inputValue });
                } else {
                  setLocalConfig({ ...localConfig, [key]: parsedValue });
                }
              };
            } else if (typeof value === 'boolean') {
              handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
                const firstChar = e.target.value.trim().toLowerCase()[0];
                const boolValue = firstChar === 't' ? true : firstChar === 'f' ? false : value;
                setLocalConfig({ ...localConfig, [key]: boolValue });
              };
            }

            return (
              <Box key={key} my={2}>
                <TextField
                  label={key}
                  value={value}
                  onChange={handleChange}
                  fullWidth
                  InputLabelProps={{ shrink: true }}
                  type={typeof value === 'number' ? 'number' : 'text'}
                />
              </Box>
            );
          } else {
            return (
              <Box key={key} my={2}>
                <JsonTextField
                  label={key}
                  defaultValue={JSON.stringify(value)}
                  onChange={(parsed) => {
                    setLocalConfig({ ...localConfig, [key]: parsed });
                  }}
                  fullWidth
                  multiline
                  minRows={2}
                  InputLabelProps={{ shrink: true }}
                />
              </Box>
            );
          }
        })}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button onClick={handleSave}>Save</Button>
      </DialogActions>
    </Dialog>
  );
};

export default ProviderConfigDialog;
