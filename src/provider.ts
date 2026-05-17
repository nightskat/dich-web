import type { CoreProvider } from '@docshift/core';

export type ProviderName = 'openrouter' | 'groq' | 'cerebras' | 'google';

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface ChatProvider {
  chat(messages: ChatMessage[], model: string, apiKey: string, signal: AbortSignal): Promise<string>;
}

interface WorkersAiInput {
  messages: ChatMessage[];
  temperature: number;
}

interface WorkersAiRunner {
  run(model: string, input: WorkersAiInput): Promise<unknown>;
}

const endpoints: Record<Exclude<ProviderName, 'google'>, string> = {
  openrouter: 'https://openrouter.ai/api/v1/chat/completions',
  groq: 'https://api.groq.com/openai/v1/chat/completions',
  cerebras: 'https://api.cerebras.ai/v1/chat/completions',
};

class OpenAiCompatibleProvider implements ChatProvider {
  constructor(private readonly url: string) {}

  async chat(messages: ChatMessage[], model: string, apiKey: string, signal: AbortSignal): Promise<string> {
    const res = await fetch(this.url, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${apiKey}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ model, messages, temperature: 0.2 }),
      signal,
    });

    if (!res.ok) {
      throw new Error(`provider request failed: ${res.status}`);
    }

    const data = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = data.choices?.[0]?.message?.content;
    if (!content) {
      throw new Error('provider returned empty content');
    }
    return content;
  }
}

class GoogleProvider implements ChatProvider {
  async chat(messages: ChatMessage[], model: string, apiKey: string, signal: AbortSignal): Promise<string> {
    const prompt = messages.map((message) => `${message.role}: ${message.content}`).join('\n\n');
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.2 },
      }),
      signal,
    });

    if (!res.ok) {
      throw new Error(`provider request failed: ${res.status}`);
    }

    const data = (await res.json()) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    };
    const text = data.candidates?.[0]?.content?.parts?.map((part) => part.text ?? '').join('');
    if (!text) {
      throw new Error('provider returned empty content');
    }
    return text;
  }
}

export type ModelPicker = (prompt: string) => string;

class CloudflareWorkersAiProvider {
  constructor(private readonly ai: Ai) {}

  async complete(prompt: string, model: string): Promise<string> {
    console.log('workers-ai inference start', { model, promptLen: prompt.length });
    try {
      const result = await (this.ai as WorkersAiRunner).run(model, {
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.2,
      });
      return parseWorkersAiResponse(result);
    } finally {
      console.log('workers-ai inference end', { model });
    }
  }
}

function parseWorkersAiResponse(result: unknown): string {
  if (!result || typeof result !== 'object' || !('response' in result)) {
    throw new Error('Workers AI returned no response field');
  }

  const response = (result as { response?: unknown }).response;
  if (typeof response !== 'string' || response.length === 0) {
    throw new Error('Workers AI returned empty response');
  }

  return response;
}

export function isProviderName(value: string): value is ProviderName {
  return value === 'openrouter' || value === 'groq' || value === 'cerebras' || value === 'google';
}

export function createCoreProvider(name: ProviderName, model: string, apiKey: string, signal: AbortSignal): CoreProvider {
  const provider = name === 'google' ? new GoogleProvider() : new OpenAiCompatibleProvider(endpoints[name]);

  return {
    complete(prompt: string) {
      return provider.chat([{ role: 'user', content: prompt }], model, apiKey, signal);
    },
  };
}

export function cfWaiProvider(ai: Ai, modelOrPicker: string | ModelPicker): CoreProvider {
  const provider = new CloudflareWorkersAiProvider(ai);
  const resolve: ModelPicker =
    typeof modelOrPicker === 'function' ? modelOrPicker : () => modelOrPicker;

  return {
    complete(prompt: string) {
      return provider.complete(prompt, resolve(prompt));
    },
  };
}
