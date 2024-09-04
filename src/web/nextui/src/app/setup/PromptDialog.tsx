import React from 'react';
import { getApiBaseUrl } from '@/api';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Button,
  Typography,
  TextareaAutosize,
  Autocomplete,
} from '@mui/material';

interface PromptDialogProps {
  open: boolean;
  prompt: string;
  index: number;
  onAdd: (prompt: string) => void;
  onCancel: () => void;
}

const PromptDialog: React.FC<PromptDialogProps> = ({ open, prompt, index, onAdd, onCancel }) => {
  const [editingPrompt, setEditingPrompt] = React.useState(prompt);
  const textFieldRef = React.useRef<HTMLInputElement>(null);
  const [jsonFiles, setJsonFiles] = React.useState([]);
  const [selectedFile, setSelectedFile] = React.useState({ fullPath: '', fileName: '' });
  const [fileContent, setFileContent] = React.useState('');

  const fetchJsonFiles = async () => {
    try {
      (async () => {
        fetch(`${await getApiBaseUrl()}/api/prompts/uploadfile`)
          .then((response) => response.json())
          .then((data) => {
            setJsonFiles(data.data);
          })
          .catch((error) => {
            console.error('Error fetching files', error);
          });
      })();
    } catch (error) {
      console.error('Failed to fetch JSON files:', error);
    }
  };

  const getFileOptions = (files: string[]) => {
    return files.map((file) => {
      const parts = file.split('/');
      return {
        fullPath: file,
        fileName: parts[parts.length - 1], // Gets the last part after the last '/'
      };
    });
  };

  const fetchFileContent = async (filePath: string) => {
    const formdata = new FormData();
    formdata.append('filePath', filePath);

    const requestOptions = { method: 'POST', body: formdata };
    const apiBaseUrl = await getApiBaseUrl();
    const response = await fetch(`${apiBaseUrl}/api/prompts/uploadfile`, requestOptions);

    if (response.ok) {
      const result = await response.json();

      const json_string = result.data;

      setFileContent(json_string);
    }
  };

  React.useEffect(() => {
    if (open) {
      fetchJsonFiles();
      setSelectedFile({ fullPath: '', fileName: '' });
      setEditingPrompt('');
      fetchFileContent('');
    }

    setEditingPrompt(prompt);
  }, [prompt, open]);

  const handleAdd = (close: boolean) => {
    onAdd(editingPrompt);
    setEditingPrompt('');
    if (close) {
      onCancel();
    } else if (textFieldRef.current) {
      textFieldRef.current.focus();
    }
  };

  const handleFileSelect = (fileObject: any) => {
    setSelectedFile(fileObject);
    setEditingPrompt(fileObject.fullPath);

    if (fileObject.fullPath === '') {
      setSelectedFile({ fullPath: '', fileName: '' });
      setEditingPrompt('');
      setFileContent('');
    } else {
      fetchFileContent(fileObject.fullPath);
    }
  };

  return (
    <Dialog open={open} onClose={onCancel} fullWidth maxWidth="md">
      <DialogTitle>{`Edit Prompt ${index + 1}`}</DialogTitle>
      <DialogContent>
        <TextField
          value={editingPrompt}
          onChange={(e) => setEditingPrompt(e.target.value)}
          fullWidth
          margin="normal"
          multiline
          placeholder="The quick brown {{animal1}} jumps over the lazy {{animal2}}."
          helperText="Tip: use the {{varname}} syntax to add variables to your prompt."
          inputRef={textFieldRef}
        />
        <Autocomplete
          value={selectedFile}
          onChange={(event, newValue) => {
            if (newValue === null) {
              handleFileSelect({ fullPath: '', fileName: '' });
            } else {
              handleFileSelect(newValue);
            }
          }}
          // options={getFileOptions(jsonFiles)}
          options={getFileOptions(jsonFiles).sort((a, b) => -b.fileName.localeCompare(a.fileName))}
          groupBy={(option) => option.fileName[0].toUpperCase()}
          getOptionLabel={(option) => option.fileName}
          renderInput={(params) => (
            <TextField {...params} label="Select the JSON file uploaded to the server." />
          )}
          fullWidth
        />
        {fileContent && (
          <>
            <Typography variant="subtitle1" style={{ marginBottom: '1rem', marginTop: '1rem' }}>
              Json content of the selected file
            </Typography>
            <TextareaAutosize
              readOnly
              value={(() => {
                try {
                  return JSON.stringify(JSON.parse(fileContent), null, 2);
                } catch (e) {
                  console.error('Error parsing JSON', e);
                  return 'Invalid JSON content.';
                }
              })()}
              style={{ width: '100%', padding: '0.75rem' }}
              maxRows={20}
            />
          </>
        )}
      </DialogContent>
      <DialogActions>
        <Button
          onClick={handleAdd.bind(null, true)}
          color="primary"
          variant="contained"
          disabled={!editingPrompt.length}
        >
          Add
        </Button>
        <Button
          onClick={handleAdd.bind(null, false)}
          color="primary"
          variant="contained"
          disabled={!editingPrompt.length}
        >
          Add Another
        </Button>
        <Button onClick={onCancel} color="secondary">
          Cancel
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default PromptDialog;
