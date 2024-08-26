import { fetchWithCache } from '../cache';
import logger from '../logger';
import type { ApiProvider, CallApiContextParams, CallApiOptionsParams, EnvOverrides, ProviderResponse, TokenUsage } from '../types';
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

const A6000_CHAT_MODELS = chatModelsConfig.getModels();

// const META_LLAMA_CHAT_MODELS = [
//   ...['3-1-8B-Instruct'].map((model) => ({
//     id: model,
//     cost: {
//       input: 5 / 1000000,
//       output: 15 / 1000000,
//     },
//   })),
// ];

interface A6000AiSharedOptions {
  apiKey?: string;
  apiKeyEnvar?: string;
  apiHost?: string;
  apiBaseUrl?: string;
  organization?: string;
  cost?: number;
  headers?: { [key: string]: string };
}

type A6000CompletionOptions = A6000AiSharedOptions & {
  temperature?: number;
  max_tokens?: number;
  top_p?: number;
  frequency_penalty?: number;
  presence_penalty?: number;
  best_of?: number;
  //   functions?: A6000Function[];
  function_call?: 'none' | 'auto' | { name: string };
  //   tools?: A6000Tool[];
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
  //     A6000.FunctionDefinition['name'],
  //     (arg: string) => Promise<string>
  //   >;
};

function formatA6000Error(data: {
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
  config: A6000AiSharedOptions,
  promptTokens?: number,
  completionTokens?: number,
): number | undefined {
  if (!promptTokens || !completionTokens) {
    return undefined;
  }

  const model = [...A6000_CHAT_MODELS].find((m) => m.id === modelName);
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

export class A6000GenericProvider implements ApiProvider {
  modelName: string;

  config: A6000AiSharedOptions;
  env?: EnvOverrides;

  constructor(
    modelName: string,
    options: { config?: A6000AiSharedOptions; id?: string; env?: EnvOverrides } = {},
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
      : `A6000:${this.modelName}`;
  }

  toString(): string {
    return `[A6000 Provider ${this.modelName}]`;
  }

  getOrganization(): string | undefined {
    return (
      this.config.organization ||
      //   || this.env?.META_LLAMA_ORGANIZATION
      process.env.META_LLAMA_ORGANIZATION
    );
  }

  getApiUrlDefault(): string {
    return 'http://192.168.17.95:1234/v1';
  }

  getApiUrl(): string {
    const apiHost = this.config.apiHost || this.env?.A6000_API_HOST || process.env.A6000_API_HOST;
    if (apiHost) {
      return `https://${apiHost}/v1`;
    }
    return (
      this.config.apiBaseUrl ||
      this.env?.A6000_API_BASE_URL ||
      this.env?.A6000_BASE_URL ||
      process.env.A6000_API_BASE_URL ||
      process.env.A6000_BASE_URL ||
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
      //   this.env?.META_LLAMA_API_KEY ||
      process.env.A6000_API_KEY
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

export class A6000ChatCompletionProvider extends A6000GenericProvider {
  static META_LLAMA_CHAT_MODELS = A6000_CHAT_MODELS;

  static META_LLAMA_CHAT_MODEL_NAMES = A6000_CHAT_MODELS.map((model) => model.id);

  config: A6000CompletionOptions;

  constructor(
    modelName: string,
    options: { config?: A6000CompletionOptions; id?: string; env?: EnvOverrides } = {},
  ) {
    if (!A6000ChatCompletionProvider.META_LLAMA_CHAT_MODEL_NAMES.includes(modelName)) {
      logger.debug(`Using unknown A6000 chat model: ${modelName}`);
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
    //     'A6000 API key is not set. Set the A6000_API_KEY environment variable or add `apiKey` to the provider config.',
    //   );
    // }

    const messages = parseChatPrompt(prompt, [{ role: 'user', content: prompt }]);

    const body = {
      model: this.modelName,
      messages: messages,
      seed: this.config.seed || 0,
      max_tokens: this.config.max_tokens ?? parseInt(process.env.A6000_MAX_TOKENS || '1024'),
      temperature: this.config.temperature ?? parseFloat(process.env.A6000_TEMPERATURE || '0'),
      stream: this.config.stream ?? false,
      top_p: this.config.top_p ?? parseFloat(process.env.A770_TOP_P || '1'),
      presence_penalty:
        this.config.presence_penalty ?? parseFloat(process.env.META_LLAMA_PRESENCE_PENALTY || '0'),
      frequency_penalty:
        this.config.frequency_penalty ??
        parseFloat(process.env.META_LLAMA_FREQUENCY_PENALTY || '0'),
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
    logger.debug(`Calling A6000 API: ${JSON.stringify(body)}`);

    let data,
      cached = false;

    let totalAnswer = '';
    let totalResponse = '';
    let firstTokenTime = 0; // 첫 토큰 수신 시간
    let firstTokenReceived = false;
    let streamStartTime: number | undefined;

    if (this.config.stream) {
      console.log('streaming');
      streamStartTime = Date.now(); // 스트림 시작 시간 기록
      try {
        const responseStream = await fetch(`${this.getApiUrl()}/chat/completions`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${this.getApiKey()}`,
            ...(this.getOrganization() ? { 'A6000-Organization': this.getOrganization() } : {}),
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
            firstTokenReceived = true; // 첫 토큰 수신 확인
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
              json.timestamp = Date.now();
              const answer = json.choices[0]?.delta?.content;

              if (answer) {
                totalAnswer += answer;
              }
              totalResponse += JSON.stringify(json);
            }
          }
        }
      } catch (err) {
        return {
          error: `API call error: ${String(err)}`,
        };
      }
    } else {
      console.log('not streaming');
      try {
        ({ data, cached } = (await fetchWithCache(
          `${this.getApiUrl()}/chat/completions`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${this.getApiKey()}`,
              ...(this.getOrganization() ? { 'A6000-Organization': this.getOrganization() } : {}),
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
    }

    logger.debug(`\tA6000 chat completions API response: ${JSON.stringify(data)}`);

    if (this.config.stream) {
      let timeToFirstToken;
      if (streamStartTime) {
        timeToFirstToken = (firstTokenTime - streamStartTime) / 1000; // 초 단위로 변환
      }

      try {
        const calling_jaon = body;
        const response_json = totalResponse;
        const output = totalAnswer;
        return {
          output,
          cached,
          calling_jaon,
          response_json,
          timeToFirstToken,
        };
      } catch (err) {
        return {
          error: `API error: ${String(err)}: ${JSON.stringify(data)}`,
        };
      }
    } else {
      if (data.error) {
        return {
          error: formatA6000Error(data),
        };
      }
      try {
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