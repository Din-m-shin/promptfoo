import React from 'react';
import { getApiBaseUrl } from '@/api';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Button,
  Select,
  MenuItem,
  Typography,
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
  const [selectedFile, setSelectedFile] = React.useState('');
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
      setSelectedFile('');
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

  const handleFileSelect = (event: { target: { value: any } }) => {
    const filePath = event.target.value;
    setSelectedFile(filePath);
    setEditingPrompt(filePath);

    if (filePath === '') {
      // Clearing out selections and content when 'None' is selected
      setSelectedFile('');
      setEditingPrompt('');
      setFileContent('');
    } else {
      // Fetch the content of the selected file
      fetchFileContent(filePath);
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
        <Select
          value={selectedFile}
          onChange={handleFileSelect}
          placeholder="Select the JSON file uploaded to the server."
          fullWidth
        >
          <MenuItem value="">
            <em>Not selected.</em>
          </MenuItem>
          {jsonFiles.map((file, i) => (
            <MenuItem key={i} value={file}>
              {file}
            </MenuItem>
          ))}
        </Select>
        {fileContent && (
          <Typography style={{ marginTop: 8, whiteSpace: 'pre-wrap' }}>
            {(() => {
              try {
                return JSON.stringify(JSON.parse(fileContent), null, 2);
              } catch (e) {
                console.error('Error parsing JSON', e);
                return 'Invalid JSON content.';
              }
            })()}
          </Typography>
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
