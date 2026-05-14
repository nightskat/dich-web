import { CoreProvider } from '@docshift/core';

export function makeFetchProvider(providerName: string, apiKey: string): CoreProvider {
  const config = getProviderConfig(providerName, apiKey);

  return {
    async complete(prompt: string): Promise<string> {
      return callLLM(config, prompt);
    },

    async translateWithBrief(segments, targetLang, readingNotes, _onProgress?, opts?) {
      if (!segments || segments.length === 0) return [];

      const chunks: string[][] = [];
      for (let i = 0; i < segments.length; i += 20) {
        chunks.push(segments.slice(i, i + 20));
      }

      const translatedChunks = await Promise.all(
        chunks.map(async (chunk) => {
          const prompt = createPrompt(chunk, targetLang, readingNotes, opts);
          try {
            const responseText = await callLLM(config, prompt);
            return parseResponse(responseText, chunk);
          } catch (err) {
            console.error('LLM call failed', err);
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

  const res = await fetch(config.url, {
    method: 'POST',
    headers: config.headers,
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`LLM provider returned ${res.status}: ${errorText}`);
  }

  const data: any = await res.json();
  if (isAnthropic) {
    return data.content[0].text;
  }
  return data.choices[0].message.content;
}

function createPrompt(chunk: string[], targetLang: string, readingNotes: string, opts?: { glossary?: string; rules?: string }) {
  let p = `Translate the following segments into ${targetLang}.
Maintain the original meaning and tone.
Return the translations in the exact same format: [index] translation
One translation per line. Do not include any other text in your response.

`;
  if (readingNotes?.trim()) p += `CONTEXT (from document analysis):\n${readingNotes.trim()}\n\n`;
  if (opts?.glossary) p += `Glossary:\n${opts.glossary}\n\n`;
  if (opts?.rules) p += `Rules:\n${opts.rules}\n\n`;

  p += `Segments to translate:\n`;
  chunk.forEach((s, i) => {
    p += `[${i + 1}] ${s}\n`;
  });
  return p;
}

function parseResponse(responseText: string, originalChunk: string[]): string[] {
  const results = [...originalChunk];
  const lines = responseText.split('\n');
  const regex = /^\[(\d+)\]\s*(.*)$/;

  lines.forEach((line) => {
    const match = line.trim().match(regex);
    if (match) {
      const index = parseInt(match[1], 10) - 1;
      if (index >= 0 && index < originalChunk.length) {
        results[index] = match[2].trim();
      }
    }
  });

  return results;
}
