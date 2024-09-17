import React, { useState } from 'react';
import { useStore } from '@app/stores/evalConfig';
import SettingsIcon from '@mui/icons-material/Settings';
import Accordion from '@mui/material/Accordion';
import AccordionDetails from '@mui/material/AccordionDetails';
import AccordionSummary from '@mui/material/AccordionSummary';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import TextField from '@mui/material/TextField';

const ConfigureEnvButton: React.FC = () => {
  const { env: defaultEnv, setEnv: saveEnv } = useStore();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [env, setEnv] = useState(defaultEnv);

  const handleOpen = () => {
    setDialogOpen(true);
  };

  const handleClose = () => {
    setDialogOpen(false);
  };

  const handleSave = () => {
    saveEnv(env);
    handleClose();
  };

  return (
    <>
      <Button variant="outlined" startIcon={<SettingsIcon />} onClick={handleOpen}>
        API keys
      </Button>
      <Dialog open={dialogOpen} onClose={handleClose} fullWidth maxWidth="md">
        <DialogTitle>Provider settings</DialogTitle>
        <DialogContent>
          <Accordion defaultExpanded>
            <AccordionSummary>OpenAI</AccordionSummary>
            <AccordionDetails>
              <TextField
                label="OpenAI API key"
                fullWidth
                margin="normal"
                value={env.OPENAI_API_KEY}
                onChange={(e) => setEnv({ ...env, OPENAI_API_KEY: e.target.value })}
              />
              <TextField
                label="OpenAI API host"
                fullWidth
                margin="normal"
                value={env.OPENAI_API_HOST}
                onChange={(e) => setEnv({ ...env, OPENAI_API_HOST: e.target.value })}
              />
              <TextField
                label="OpenAI organization"
                fullWidth
                margin="normal"
                value={env.OPENAI_ORGANIZATION}
                onChange={(e) => setEnv({ ...env, OPENAI_ORGANIZATION: e.target.value })}
              />
            </AccordionDetails>
          </Accordion>
          <Accordion>
            <AccordionSummary>Azure</AccordionSummary>
            <AccordionDetails>
              <TextField
                label="Azure API key"
                fullWidth
                margin="normal"
                value={env.AZURE_OPENAI_API_KEY}
                onChange={(e) => setEnv({ ...env, AZURE_OPENAI_API_KEY: e.target.value })}
              />
            </AccordionDetails>
          </Accordion>
          <Accordion>
            <AccordionSummary>Amazon Bedrock</AccordionSummary>
            <AccordionDetails>
              <TextField
                label="Bedrock Region"
                fullWidth
                margin="normal"
                value={env.AWS_BEDROCK_REGION}
                onChange={(e) => setEnv({ ...env, AWS_BEDROCK_REGION: e.target.value })}
              />
            </AccordionDetails>
          </Accordion>
          <Accordion>
            <AccordionSummary>Anthropic</AccordionSummary>
            <AccordionDetails>
              <TextField
                label="Anthropic API key"
                fullWidth
                margin="normal"
                value={env.ANTHROPIC_API_KEY}
                onChange={(e) => setEnv({ ...env, ANTHROPIC_API_KEY: e.target.value })}
              />
            </AccordionDetails>
          </Accordion>
          <Accordion>
            <AccordionSummary>Google Vertex AI</AccordionSummary>
            <AccordionDetails>
              <TextField
                label="Vertex API Key"
                fullWidth
                margin="normal"
                value={env.VERTEX_API_KEY}
                onChange={(e) => setEnv({ ...env, VERTEX_API_KEY: e.target.value })}
              />
            </AccordionDetails>
            <AccordionDetails>
              <TextField
                label="Vertex Project ID"
                fullWidth
                margin="normal"
                value={env.VERTEX_PROJECT_ID}
                onChange={(e) => setEnv({ ...env, VERTEX_PROJECT_ID: e.target.value })}
              />
            </AccordionDetails>
            <AccordionDetails>
              <TextField
                label="Vertex Region"
                fullWidth
                margin="normal"
                value={env.VERTEX_REGION}
                onChange={(e) => setEnv({ ...env, VERTEX_REGION: e.target.value })}
              />
            </AccordionDetails>
          </Accordion>
          <Accordion>
            <AccordionSummary>Replicate</AccordionSummary>
            <AccordionDetails>
              <TextField
                label="Replicate API key"
                fullWidth
                margin="normal"
                value={env.REPLICATE_API_KEY}
                onChange={(e) => setEnv({ ...env, REPLICATE_API_KEY: e.target.value })}
              />
            </AccordionDetails>
          </Accordion>
          <Accordion>
            <AccordionSummary>Upstage</AccordionSummary>
            <AccordionDetails>
              <TextField
                label="Upstage Base Url"
                fullWidth
                margin="normal"
                value={env.UPSTAGE_BASE_URL}
                onChange={(e) => setEnv({ ...env, UPSTAGE_BASE_URL: e.target.value })}
              />
              <TextField
                label="Upstage API key"
                fullWidth
                margin="normal"
                value={env.UPSTAGE_API_KEY}
                onChange={(e) => setEnv({ ...env, A6000_API_KEY: e.target.value })}
              />
            </AccordionDetails>
          </Accordion>
          <Accordion>
            <AccordionSummary>Saltlux</AccordionSummary>
            <AccordionDetails>
              <TextField
                label="Saltlux API key"
                fullWidth
                margin="normal"
                defaultValue="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6Ijc2NjI5ZjE2LWI2ZTktNGZjYi05YWFkLWE4MzA1NGY5YTEzMSJ9.pXrrad6HedTl5lNCRvMXTXOUje0Ak-_MoYgQp3PNdw4"
                value={env.SALTLUX_API_KEY}
                onChange={(e) => setEnv({ ...env, SALTLUX_API_KEY: e.target.value })}
              />
              <TextField
                label="Saltlux Base Url"
                fullWidth
                margin="normal"
                value={env.SALTLUX_BASE_URL}
                onChange={(e) => setEnv({ ...env, SALTLUX_BASE_URL: e.target.value })}
              />
            </AccordionDetails>
          </Accordion>
          <Accordion>
            <AccordionSummary>A6000</AccordionSummary>
            <AccordionDetails>
              <TextField
                label="A6000 Base Url"
                fullWidth
                margin="normal"
                defaultValue="http://192.168.17.95:18080/v1"
                value={env.A6000_BASE_URL}
                onChange={(e) => setEnv({ ...env, A6000_BASE_URL: e.target.value })}
              />
              <TextField
                label="A6000 Model Name"
                fullWidth
                margin="normal"
                value={env.A6000_MODEL_NAME}
                onChange={(e) => {
                  setEnv({ ...env, A6000_MODEL_NAME: e.target.value });
                  process.env.A6000_MODEL_NAME = e.target.value;
                }}
              />
              <TextField
                label="A6000 API key"
                fullWidth
                margin="normal"
                value={env.A6000_API_KEY}
                onChange={(e) => setEnv({ ...env, A6000_API_KEY: e.target.value })}
              />
            </AccordionDetails>
          </Accordion>
          <Accordion>
            <AccordionSummary>A770</AccordionSummary>
            <AccordionDetails>
              <TextField
                label="A770 Base Url"
                fullWidth
                margin="normal"
                defaultValue="http://192.168.17.153:41020/v1"
                value={env.A770_BASE_URL}
                onChange={(e) => setEnv({ ...env, A770_BASE_URL: e.target.value })}
              />
              <TextField
                label="A770 Model Name"
                fullWidth
                margin="normal"
                value={env.A770_MODEL_NAME}
                onChange={(e) => {
                  setEnv({ ...env, A770_MODEL_NAME: e.target.value });
                  process.env.A770_MODEL_NAME = e.target.value;
                }}
              />
              <TextField
                label="A770 API key"
                fullWidth
                margin="normal"
                value={env.A770_API_KEY}
                onChange={(e) => setEnv({ ...env, A770_API_KEY: e.target.value })}
              />
            </AccordionDetails>
          </Accordion>
          <Accordion>
            <AccordionSummary>Konan</AccordionSummary>
            <AccordionDetails>
              <TextField
                label="Konan Base Url"
                fullWidth
                margin="normal"
                defaultValue="https://konanllm.konantech.com/v3"
                value={env.KONAN_BASE_URL}
                onChange={(e) => setEnv({ ...env, KONAN_BASE_URL: e.target.value })}
              />
              <TextField
                label="Konan Model Name"
                fullWidth
                margin="normal"
                value={env.KONAN_MODEL_NAME}
                onChange={(e) => {
                  setEnv({ ...env, KONAN_MODEL_NAME: e.target.value });
                  process.env.KONAN_MODEL_NAME = e.target.value;
                }}
              />
              <TextField
                label="Konan API key"
                fullWidth
                margin="normal"
                value={env.KONAN_API_KEY}
                onChange={(e) => setEnv({ ...env, KONAN_API_KEY: e.target.value })}
              />
            </AccordionDetails>
          </Accordion>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleClose} color="primary">
            Cancel
          </Button>
          <Button onClick={handleSave} color="primary" variant="contained">
            Save
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
};

export default ConfigureEnvButton;
