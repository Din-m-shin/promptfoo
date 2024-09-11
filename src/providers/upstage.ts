import { fetchWithCache } from '../cache';
import logger from '../logger';
import type {
  ApiProvider,
  CallApiContextParams,
  CallApiOptionsParams,
  EnvOverrides,
  ProviderResponse,
  TokenUsage,
} from '../types';
import { safeJsonStringify } from '../util/json';
import { REQUEST_TIMEOUT_MS, parseChatPrompt } from './shared';

const UPSTAGE_CHAT_MODELS = [
  ...['solar'].map((model) => ({
    id: model,
    cost: {
      input: 5 / 1000000,
      output: 15 / 1000000,
    },
  })),
];

interface UpstageAiSharedOptions {
  apiKey?: string;
  apiKeyEnvar?: string;
  apiHost?: string;
  apiBaseUrl?: string;
  organization?: string;
  cost?: number;
  headers?: { [key: string]: string };
}

type UpstageCompletionOptions = UpstageAiSharedOptions & {
  temperature?: number;
  max_tokens?: number;
  top_p?: number;
  frequency_penalty?: number;
  presence_penalty?: number;
  best_of?: number;
  //   functions?: UpstageFunction[];
  function_call?: 'none' | 'auto' | { name: string };
  //   tools?: UpstageTool[];
  tool_choice?: 'none' | 'auto' | 'required' | { type: 'function'; function?: { name: string } };
  response_format?: { type: 'json_object' };
  stop?: string[];
  seed?: number;
  passthrough?: object;

  /**
   * If set, automatically call these functions when the assistant activates
   * these function tools.
   */
  //   functionToolCallbacks?: Record<
  //     Upstage.FunctionDefinition['name'],
  //     (arg: string) => Promise<string>
  //   >;
};

function formatUpstageError(data: {
  error: { message: string; type?: string; code?: string };
}): string {
  let errorMessage = `API error: ${data.error.message}`;
  if (data.error.type) {
    errorMessage += `, Type: ${data.error.type}`;
  }
  if (data.error.code) {
    errorMessage += `, Code: ${data.error.code}`;
  }
  errorMessage += '\n\n' + safeJsonStringify(data, true /* prettyPrint */);
  return errorMessage;
}

function calculateCost(
  modelName: string,
  config: UpstageAiSharedOptions,
  promptTokens?: number,
  completionTokens?: number,
): number | undefined {
  if (!promptTokens || !completionTokens) {
    return undefined;
  }

  const model = [...UPSTAGE_CHAT_MODELS].find((m) => m.id === modelName);
  if (!model || !model.cost) {
    return undefined;
  }

  const inputCost = config.cost ?? model.cost.input;
  const outputCost = config.cost ?? model.cost.output;
  return inputCost * promptTokens + outputCost * completionTokens || undefined;
}

function getTokenUsage(data: any, cached: boolean): Partial<TokenUsage> {
  if (data.usage) {
    if (cached) {
      return { cached: data.usage.total_tokens, total: data.usage.total_tokens };
    } else {
      return {
        total: data.usage.total_tokens,
        prompt: data.usage.prompt_tokens || 0,
        completion: data.usage.completion_tokens || 0,
      };
    }
  }
  return {};
}

export class UpstageGenericProvider implements ApiProvider {
  modelName: string;

  config: UpstageAiSharedOptions;
  env?: EnvOverrides;

  constructor(
    modelName: string,
    options: { config?: UpstageAiSharedOptions; id?: string; env?: EnvOverrides } = {},
  ) {
    const { config, id, env } = options;
    this.env = env;
    this.modelName = modelName;
    this.config = config || {};
    this.id = id ? () => id : this.id;
  }

  id(): string {
    return this.config.apiHost || this.config.apiBaseUrl
      ? this.modelName
      : `Upstage:${this.modelName}`;
  }

  toString(): string {
    return `[Upstage Provider ${this.modelName}]`;
  }

  getOrganization(): string | undefined {
    return (
      this.config.organization ||
      //   || this.env?.UPSTAGE_ORGANIZATION
      process.env.UPSTAGE_ORGANIZATION
    );
  }

  getApiUrlDefault(): string {
    return 'http://192.168.17.100:41020/v1';
  }

  getApiUrl(): string {
    const apiHost =
      this.config.apiHost || this.env?.UPSTAGE_API_HOST || process.env.UPSTAGE_API_HOST;
    if (apiHost) {
      return `https://${apiHost}/v1`;
    }
    return (
      this.config.apiBaseUrl ||
      this.env?.UPSTAGE_API_BASE_URL ||
      this.env?.UPSTAGE_BASE_URL ||
      process.env.UPSTAGE_API_BASE_URL ||
      process.env.UPSTAGE_BASE_URL ||
      this.getApiUrlDefault()
    );
  }

  getApiKey(): string | undefined {
    return (
      this.config.apiKey ||
      (this.config?.apiKeyEnvar
        ? process.env[this.config.apiKeyEnvar] ||
          this.env?.[this.config.apiKeyEnvar as keyof EnvOverrides]
        : undefined) ||
      this.env?.UPSTAGE_API_KEY ||
      process.env.UPSTAGE_API_KEY
    );
  }

  // @ts-ignore: Params are not used in this implementation
  async callApi(
    prompt: string,
    context?: CallApiContextParams,
    callApiOptions?: CallApiOptionsParams,
  ): Promise<ProviderResponse> {
    throw new Error('Not implemented');
  }
}

export class UpstageChatCompletionProvider extends UpstageGenericProvider {
  static UPSTAGE_CHAT_MODELS = UPSTAGE_CHAT_MODELS;

  static Upstage_CHAT_MODEL_NAMES = UPSTAGE_CHAT_MODELS.map((model) => model.id);

  config: UpstageCompletionOptions;

  constructor(
    modelName: string,
    options: { config?: UpstageCompletionOptions; id?: string; env?: EnvOverrides } = {},
  ) {
    if (!UpstageChatCompletionProvider.Upstage_CHAT_MODEL_NAMES.includes(modelName)) {
      logger.debug(`Using unknown Upstage chat model: ${modelName}`);
    }
    super(modelName, options);
    this.config = options.config || {};
  }

  async callApi(
    prompt: string,
    context?: CallApiContextParams,
    callApiOptions?: CallApiOptionsParams,
  ): Promise<ProviderResponse> {
    // solar not use api key
    // if (!this.getApiKey()) {
    //   throw new Error(
    //     'Upstage API key is not set. Set the Upstage_API_KEY environment variable or add `apiKey` to the provider config.',
    //   );
    // }

    const messages = parseChatPrompt(prompt, [{ role: 'user', content: prompt }]);

    const body = {
      model: this.modelName,
      messages: messages,
      seed: this.config.seed || 0,
      max_tokens:
        this.config.max_tokens ?? Number.parseInt(process.env.Upstage_MAX_TOKENS || '1024'),
      temperature:
        this.config.temperature ?? Number.parseFloat(process.env.Upstage_TEMPERATURE || '0'),
      top_p: this.config.top_p ?? Number.parseFloat(process.env.Upstage_TOP_P || '1'),
      presence_penalty:
        this.config.presence_penalty ??
        Number.parseFloat(process.env.Upstage_PRESENCE_PENALTY || '0'),
      frequency_penalty:
        this.config.frequency_penalty ??
        Number.parseFloat(process.env.Upstage_FREQUENCY_PENALTY || '0'),
      //   ...(this.config.functions
      //     ? { functions: renderVarsInObject(this.config.functions, context?.vars) }
      //     : {}),
      ...(this.config.function_call ? { function_call: this.config.function_call } : {}),
      //   ...(this.config.tools ? { tools: renderVarsInObject(this.config.tools, context?.vars) } : {}),
      ...(this.config.tool_choice ? { tool_choice: this.config.tool_choice } : {}),
      ...(this.config.response_format ? { response_format: this.config.response_format } : {}),
      ...(callApiOptions?.includeLogProbs ? { logprobs: callApiOptions.includeLogProbs } : {}),
      ...(this.config.stop ? { stop: this.config.stop } : {}),
      ...(this.config.passthrough || {}),
    };
    logger.debug(`Calling Upstage API: ${JSON.stringify(body)}`);

    let data,
      cached = false;
    try {
      ({ data, cached } = (await fetchWithCache(
        `${this.getApiUrl()}/chat/completions`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${this.getApiKey()}`,
            ...(this.getOrganization() ? { 'Upstage-Organization': this.getOrganization() } : {}),
            ...this.config.headers,
          },
          body: JSON.stringify(body),
        },
        REQUEST_TIMEOUT_MS,
      )) as unknown as { data: any; cached: boolean });
    } catch (err) {
      return {
        error: `API call error: ${String(err)}`,
      };
    }

    logger.debug(`\tUpstage chat completions API response: ${JSON.stringify(data)}`);
    if (data.error) {
      return {
        error: formatUpstageError(data),
      };
    }
    try {
      const calling_jaon = body;
      const response_json = data;
      const message = data.choices[0].message;
      let output = '';
      if (message.content && (message.function_call || message.tool_calls)) {
        output = message;
      } else if (message.content === null) {
        output = message.function_call || message.tool_calls;
      } else {
        output = message.content;
      }
      const logProbs = data.choices[0].logprobs?.content?.map(
        (logProbObj: { token: string; logprob: number }) => logProbObj.logprob,
      );

      // Handle function tool callbacks
      //   const functionCalls = message.function_call ? [message.function_call] : message.tool_calls;
      //   if (functionCalls && this.config.functionToolCallbacks) {
      //     for (const functionCall of functionCalls) {
      //       const functionName = functionCall.name;
      //       if (this.config.functionToolCallbacks[functionName]) {
      //         const functionResult = await this.config.functionToolCallbacks[functionName](
      //           message.function_call.arguments,
      //         );
      //         return {
      //           output: functionResult,
      //           tokenUsage: getTokenUsage(data, cached),
      //           cached,
      //           logProbs,
      //           cost: calculateCost(
      //             this.modelName,
      //             this.config,
      //             data.usage?.prompt_tokens,
      //             data.usage?.completion_tokens,
      //           ),
      //         };
      //       }
      //     }
      //   }

      return {
        output,
        tokenUsage: getTokenUsage(data, cached),
        cached,
        logProbs,
        cost: calculateCost(
          this.modelName,
          this.config,
          data.usage?.prompt_tokens,
          data.usage?.completion_tokens,
        ),
        calling_jaon,
        response_json,
      };
    } catch (err) {
      return {
        error: `API error: ${String(err)}: ${JSON.stringify(data)}`,
      };
    }
  }
}
