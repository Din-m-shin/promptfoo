import type { AssistantCreationOptions, FunctionDefinition } from '@azure/openai-assistants';
import type { EnvOverrides } from '../../types/env';

export interface AzureCompletionOptions {
  // Azure identity params
  azureClientId?: string;
  azureClientSecret?: string;
  azureTenantId?: string;
  azureAuthorityHost?: string;
  azureTokenScope?: string;
  /** @deprecated Use isReasoningModel instead. Indicates if the model should be treated as a reasoning model */
  o1?: boolean;
  isReasoningModel?: boolean; // Indicates if the model should be treated as a reasoning model (o1, o3-mini, etc.)
  max_completion_tokens?: number; // Maximum number of tokens to generate for reasoning models

  // Azure cognitive services params
  deployment_id?: string;
  dataSources?: any;

  // Promptfoo supported params
  apiHost?: string;
  apiBaseUrl?: string;
  apiKey?: string;
  apiKeyEnvar?: string;
  apiVersion?: string;

  // OpenAI params
  max_tokens?: number;
  temperature?: number;
  top_p?: number;
  frequency_penalty?: number;
  presence_penalty?: number;
  best_of?: number;
  functions?: {
    name: string;
    description?: string;
    parameters: any;
  }[];
  function_call?: 'none' | 'auto' | { name: string };
  tools?: {
    type: string;
    function: {
      name: string;
      description?: string;
      parameters: any;
    };
  }[];
  tool_choice?: 'none' | 'auto' | { type: 'function'; function?: { name: string } };
  response_format?:
    | { type: 'json_object' }
    | {
        type: 'json_schema';
        json_schema: {
          name: string;
          strict: boolean;
          schema: {
            type: 'object';
            properties: Record<string, any>;
            required?: string[];
            additionalProperties: false;
            $defs?: Record<string, any>;
          };
        };
      };
  stop?: string[];
  seed?: number;
  reasoning_effort?: 'low' | 'medium' | 'high';

  passthrough?: object;
}

export interface AzureModelCost {
  id: string;
  cost: {
    input: number;
    output: number;
  };
}

export type AzureAssistantOptions = AzureCompletionOptions &
  Partial<AssistantCreationOptions> & {
    /**
     * If set, automatically call these functions when the assistant activates
     * these function tools.
     */
    functionToolCallbacks?: Record<FunctionDefinition['name'], (arg: string) => Promise<string>>;
  };

export interface AzureProviderOptions {
  config?: AzureCompletionOptions;
  id?: string;
  env?: EnvOverrides;
}

export interface AzureAssistantProviderOptions {
  config?: AzureAssistantOptions;
  id?: string;
  env?: EnvOverrides;
}
