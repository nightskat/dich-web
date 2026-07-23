import { CoreProvider } from '@docshift/core';

class ProviderError extends Error {
  meta?: Record<string, unknown>;
}

export function makeFetchProvider(providerName: string, apiKey: string): CoreProvider {
  const config = getProviderConfig(providerName, apiKey);

  return {
    async complete(prompt: string): Promise<string> {
      return callLLM(config, prompt);
    },

    async translateWithBrief(segments, targetLang, readingNotes, _onProgress?, opts?) {
      if (!segments || segments.length === 0) return [];

      // ⚡ Bolt: Cache LLM prompt prefix to reduce GC pressure and CPU overhead
      // Pre-compute the static parts of the prompt, including the potentially large readingNotes
      let prefix = `Translate the following segments into ${targetLang}.
Maintain the original meaning and tone.
Return the translations in the exact same format: [index] translation
One translation per line. Do not include any other text in your response.

`;
      const trimmedNotes = readingNotes?.trim();
      if (trimmedNotes) prefix += `CONTEXT (from document analysis):\n${trimmedNotes}\n\n`;
      if (opts?.glossary) prefix += `Glossary:\n${opts.glossary}\n\n`;
      if (opts?.rules) prefix += `Rules:\n${opts.rules}\n\n`;
      prefix += `Segments to translate:\n`;

      const chunks: string[][] = [];
      for (let i = 0; i < segments.length; i += 20) {
        chunks.push(segments.slice(i, i + 20));
      }

      const translatedChunks = await Promise.all(
        chunks.map(async (chunk) => {
          let prompt = prefix;
          chunk.forEach((s, i) => {
            prompt += `[${i + 1}] ${s}\n`;
          });

          try {
            const responseText = await callLLM(config, prompt);
            return parseResponse(responseText, chunk);
          } catch (err) {
            const errorName = err instanceof Error ? err.name : 'UnknownError';
            console.error('LLM call failed', errorName);
            return chunk;
          }
        })
      );

      return translatedChunks.flat();
    },
  };
}

function getProviderConfig(name: string, apiKey: string) {
  if (name === 'openai') {
    return {
      url: 'https://api.openai.com/v1/chat/completions',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      model: 'gpt-4o',
    };
  } else if (name === 'anthropic') {
    return {
      url: 'https://api.anthropic.com/v1/messages',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json',
      },
      model: 'claude-3-5-sonnet-20241022',
    };
  } else {
    // Default to OpenRouter
    return {
      url: 'https://openrouter.ai/api/v1/chat/completions',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://github.com/docshift/dich-web',
        'X-Title': 'dich-web',
      },
      model: 'google/gemini-2.5-flash',
    };
  }
}

async function callLLM(config: any, prompt: string): Promise<string> {
  const isAnthropic = config.url.includes('anthropic.com');
  const body = isAnthropic
    ? {
        model: config.model,
        max_tokens: 4096,
        messages: [{ role: 'user', content: prompt }],
      }
    : {
        model: config.model,
        messages: [{ role: 'user', content: prompt }],
      };

  // 🛡️ Sentinel: Add 60s timeout to prevent indefinite hangs and resource exhaustion DoS risks
  const res = await fetch(config.url, {
    method: 'POST',
    headers: config.headers,
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(60000),
  });

  if (!res.ok) {
    const error = new ProviderError(`LLM provider returned ${res.status}`);
    error.name = 'ProviderError';
    error.meta = { status: res.status };
    throw error;
  }

  const data: any = await res.json();
  if (isAnthropic) {
    return data.content[0].text;
  }
  return data.choices[0].message.content;
}

function parseResponse(responseText: string, originalChunk: string[]): string[] {
  const results = [...originalChunk];

  // ⚡ Bolt: Optimize by avoiding .split('\n') and per-line string allocation.
  // Using a single global regex execution reduces memory allocations and
  // avoids unnecessary .trim() calls on every line.
  const regex = /^\[(\d+)\]\s*(.*)$/gm;
  let match;

  while ((match = regex.exec(responseText)) !== null) {
    const index = parseInt(match[1], 10) - 1;
    if (index >= 0 && index < originalChunk.length) {
      results[index] = match[2].trim();
    }
  }

  return results;
}
