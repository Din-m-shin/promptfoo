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

interface ChatModel {
  id: string;
  cost: {
    input: number;
    output: number;
  };
}

class ChatModelConfig {
  private models: ChatModel[] = [];

  constructor(initialModels?: ChatModel[]) {
    if (initialModels) {
      this.models.push(...initialModels);
    }
  }

  addModelFromEnv(env: EnvOverrides): void {
    const modelId = env?.A770_MODEL_NAME || process.env.A770_MODEL_NAME;
    if (!modelId) {
      console.error('Environment variable A770_MODEL_NAME is not set.');
      return;
    }

    const existingModel = this.models.find((m) => m.id === modelId);
    if (existingModel) {
      console.error(`Model ID ${modelId} already exists.`);
      return;
    }

    // 예시로 비용 값을 하드 코딩함, 실제로는 환경 변수나 다른 설정에서 가져올 수 있음
    this.models.push({
      id: modelId,
      cost: {
        input: 5 / 1000000,
        output: 15 / 1000000,
      },
    });
    // console.log(`Model ${modelId} added successfully.`);
  }

  updateModelCost(modelId: string, inputCost?: number, outputCost?: number): void {
    const model = this.models.find((m) => m.id === modelId);
    if (model) {
      if (inputCost !== undefined) {
        model.cost.input = inputCost;
      }
      if (outputCost !== undefined) {
        model.cost.output = outputCost;
      }
    } else {
      console.error(`Model ID ${modelId} not found.`);
    }
  }

  getModels(): ChatModel[] {
    return this.models;
  }
}

const initialModels: ChatModel[] = [
  {
    id: '2-9b-it-Q8_0',
    cost: {
      input: 5 / 1000000,
      output: 15 / 1000000,
    },
  },
];

const chatModelsConfig = new ChatModelConfig(initialModels);

const A770_CHAT_MODELS = chatModelsConfig.getModels();

// const A770_CHAT_MODELS = [
//   ...['2-9b-it-Q8_0'].map((model) => ({
//     id: model,
//     cost: {
//       input: 5 / 1000000,
//       output: 15 / 1000000,
//     },
//   })),
// ];

interface A770AiSharedOptions {
  apiKey?: string;
  apiKeyEnvar?: string;
  apiHost?: string;
  apiBaseUrl?: string;
  organization?: string;
  cost?: number;
  headers?: { [key: string]: string };
}

type A770CompletionOptions = A770AiSharedOptions & {
  temperature?: number;
  max_tokens?: number;
  top_p?: number;
  frequency_penalty?: number;
  presence_penalty?: number;
  best_of?: number;
  //   functions?: A770Function[];
  function_call?: 'none' | 'auto' | { name: string };
  //   tools?: A770Tool[];
  tool_choice?: 'none' | 'auto' | 'required' | { type: 'function'; function?: { name: string } };
  response_format?: { type: 'json_object' };
  stop?: string[];
  seed?: number;
  passthrough?: object;
  stream?: boolean;

  /**
   * If set, automatically call these functions when the assistant activates
   * these function tools.
   */
  //   functionToolCallbacks?: Record<
  //     A770.FunctionDefinition['name'],
  //     (arg: string) => Promise<string>
  //   >;
};

function formatA770Error(data: {
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
  config: A770AiSharedOptions,
  promptTokens?: number,
  completionTokens?: number,
): number | undefined {
  if (!promptTokens || !completionTokens) {
    return undefined;
  }

  const model = [...A770_CHAT_MODELS].find((m) => m.id === modelName);
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

export class A770GenericProvider implements ApiProvider {
  modelName: string;

  config: A770AiSharedOptions;
  env?: EnvOverrides;

  constructor(
    modelName: string,
    options: { config?: A770AiSharedOptions; id?: string; env?: EnvOverrides } = {},
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
      : `A770:${this.modelName}`;
  }

  toString(): string {
    return `[A770 Provider ${this.modelName}]`;
  }

  getOrganization(): string | undefined {
    return (
      this.config.organization ||
      //   || this.env?.A770_ORGANIZATION
      process.env.A770_ORGANIZATION
    );
  }

  getApiUrlDefault(): string {
    return 'http://192.168.17.153:41020/v1';
  }

  getApiUrl(): string {
    //logger.error(`A770_BASE_URL: ${this.env?.A770_BASE_URL}`);
    const apiHost = this.config.apiHost || this.env?.A770_API_HOST || process.env.A770_API_HOST;
    if (apiHost) {
      return `https://${apiHost}/v1`;
    }
    return (
      this.config.apiBaseUrl ||
      this.env?.A770_API_BASE_URL ||
      this.env?.A770_BASE_URL ||
      process.env.A770_API_BASE_URL ||
      process.env.A770_BASE_URL ||
      this.getApiUrlDefault()
    );
  }

  getModelName(): string | undefined {
    return this.env?.A770_MODEL_NAME || process.env.A770_MODEL_NAME;
  }

  getApiKey(): string | undefined {
    return (
      this.config.apiKey ||
      (this.config?.apiKeyEnvar
        ? process.env[this.config.apiKeyEnvar] ||
          this.env?.[this.config.apiKeyEnvar as keyof EnvOverrides]
        : undefined) ||
      //   this.env?.A770_API_KEY ||
      process.env.A770_API_KEY
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

export class A770ChatCompletionProvider extends A770GenericProvider {
  static A770_CHAT_MODELS = A770_CHAT_MODELS;

  static A770_CHAT_MODEL_NAMES = A770_CHAT_MODELS.map((model) => model.id);

  config: A770CompletionOptions;

  constructor(
    modelName: string,
    options: { config?: A770CompletionOptions; id?: string; env?: EnvOverrides } = {},
  ) {
    if (!A770ChatCompletionProvider.A770_CHAT_MODEL_NAMES.includes(modelName)) {
      logger.debug(`Using unknown A770 chat model: ${modelName}`);
    }
    super(modelName, options);
    this.config = options.config || {};
  }

  async callApi(
    prompt: string,
    context?: CallApiContextParams,
    callApiOptions?: CallApiOptionsParams,
  ): Promise<ProviderResponse> {
    // not use api key
    // if (!this.getApiKey()) {
    //   throw new Error(
    //     'A770 API key is not set. Set the API_KEY environment variable or add `apiKey` to the provider config.',
    //   );
    // }

    const messages = parseChatPrompt(prompt, [{ role: 'user', content: prompt }]);

    const body = {
      model: this.modelName,
      messages: messages,
      seed: this.config.seed || 0,
      max_tokens: this.config.max_tokens ?? Number.parseInt(process.env.A770_MAX_TOKENS || '1024'),
      temperature:
        this.config.temperature ?? Number.parseFloat(process.env.A770_TEMPERATURE || '0'),
      stream: this.config.stream ?? false,
      top_p: this.config.top_p ?? Number.parseFloat(process.env.A770_TOP_P || '1'),
      presence_penalty:
        this.config.presence_penalty ?? Number.parseFloat(process.env.A770_PRESENCE_PENALTY || '0'),
      frequency_penalty:
        this.config.frequency_penalty ??
        Number.parseFloat(process.env.A770_FREQUENCY_PENALTY || '0'),
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
      ...(this.config.stream
        ? {
            stream_options: {
              include_usage: true,
            },
          }
        : {}),
    };
    logger.debug(`Calling A770 API: ${JSON.stringify(body)}`);

    if (this.config.stream) {
      interface StreamMetrics {
        avgLatencyMs: string;
        avgTokens: string;
        timeToFirstToken: string;
      }

      const cached = false;

      let totalAnswer = '';
      let totalResponse = '';
      let totalTokens = 0;
      let firstTokenTime = 0;
      let firstTokenReceived = false;
      let tokenEventsCount = 0;

      const streamStartTime = Date.now();
      console.log('streaming');
      try {
        const responseStream = await fetch(`${this.getApiUrl()}/chat/completions`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${this.getApiKey()}`,
            ...(this.getOrganization() ? { 'A770-Organization': this.getOrganization() } : {}),
            ...this.config.headers,
          },
          body: JSON.stringify(body),
        });

        const reader = responseStream.body?.getReader();
        const decoder = new TextDecoder('utf-8');
        let buffer = '';

        // eslint-disable-next-line no-constant-condition
        while (true) {
          const readResult = await reader?.read();
          if (!readResult) {
            break;
          }
          const { done, value } = readResult;
          if (done) {
            break;
          }
          const chunk = decoder.decode(value, { stream: true });
          buffer += chunk;

          if (!firstTokenReceived && buffer.trim().length > 0) {
            firstTokenTime = Date.now();
            firstTokenReceived = true;
          }

          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            if (line.trim() === 'data: [DONE]') {
              continue;
            }

            const jsonLine = line.startsWith('data: ') ? line.slice(6) : line;
            if (jsonLine.trim()) {
              const json = JSON.parse(jsonLine);
              const answer = json.choices[0]?.delta?.content;
              if (answer) {
                totalAnswer += answer;
              }

              if (json.choices.length === 0) {
                totalTokens = json.usage.total_tokens;
              }

              tokenEventsCount++;
              totalResponse += JSON.stringify(json);
            }
          }
        }

        const streamEndTime = Date.now();
        const totalsteamlatencyMs = streamEndTime - streamStartTime;
        const avgalatencyMs = totalsteamlatencyMs / tokenEventsCount;
        const avgTokens = totalTokens / tokenEventsCount;

        let timeToFirstToken = 0;
        if (streamStartTime) {
          timeToFirstToken = (firstTokenTime - streamStartTime) / 1000;
        }

        const streamMetrics: StreamMetrics = {
          avgLatencyMs: avgalatencyMs.toFixed(3),
          avgTokens: avgTokens.toFixed(3),
          timeToFirstToken: timeToFirstToken.toFixed(3),
        };

        const calling_jaon = body;
        const response_json = totalResponse;
        const output = totalAnswer;
        return {
          output,
          cached,
          calling_jaon,
          response_json,
          streamMetrics,
        };
      } catch (err) {
        return {
          error: `API call error: ${String(err)}`,
        };
      }
    } else {
      console.log('not streaming');

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
              ...(this.getOrganization() ? { 'A770-Organization': this.getOrganization() } : {}),
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

      if (data.error) {
        return {
          error: formatA770Error(data),
        };
      }
      try {
        logger.debug(`\tA770 chat completions API response: ${JSON.stringify(data)}`);

        const calling_jaon = body;
        const response_json = data;
        const message = data.choices[0].message;
        let output = '';

        if (message.content) {
          output = message.content;
        } else {
          output = message;
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
}
