import { SYSTEM_PROMPT, buildUserPrompt, parseAnalysisResult } from '../prompt';
import {
  AIProviderError,
  type AIProviderAdapter,
  type AIProviderConfig,
} from '../types';

type ErrorBody = { error?: { message?: string } | string; message?: string };

type ChatCompletionResponse = {
  choices?: Array<{
    message?: {
      content?: string | Array<{ type?: string; text?: string }> | null;
      refusal?: string | null;
    };
    finish_reason?: string;
  }>;
};

type ModelsResponse = { data?: Array<{ id: string }> };

const getBaseUrl = (config: AIProviderConfig) => {
  const baseUrl = config.baseUrl?.trim().replace(/\/+$/, '');
  if (!baseUrl) {
    throw new AIProviderError('Set a base URL for this provider.');
  }
  return baseUrl;
};

const getErrorMessage = (body: ErrorBody, status: number) => {
  if (typeof body.error === 'string') return body.error;
  return body.error?.message || body.message || `Request failed (${status})`;
};

const request = async <T>(
  url: string,
  apiKey: string,
  init: RequestInit = {}
): Promise<T> => {
  let response: Response;
  try {
    response = await fetch(url, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
        ...init.headers,
      },
    });
  } catch (error) {
    if ((error as Error)?.name === 'AbortError') throw error;
    // fetch only rejects on network or CORS failures.
    throw new AIProviderError(
      `Could not reach ${new URL(url).host}. Check the base URL, your connection, and that the provider allows browser requests.`
    );
  }

  const body = (await response.json().catch(() => ({}))) as T & ErrorBody;

  if (!response.ok) {
    throw new AIProviderError(
      getErrorMessage(body, response.status),
      response.status
    );
  }

  return body;
};

const readContent = (data: ChatCompletionResponse) => {
  const message = data.choices?.[0]?.message;
  if (message?.refusal) {
    throw new AIProviderError(`The model refused: ${message.refusal}`);
  }

  const content = message?.content;
  if (Array.isArray(content)) {
    return content.map((part) => part.text ?? '').join('');
  }
  return content ?? '';
};

const openaiCompatibleProvider: AIProviderAdapter = {
  async analyze({ config, apiKey, signal }, input) {
    if (!config.model.trim()) {
      throw new AIProviderError('Choose a model for this provider.');
    }

    const url = `${getBaseUrl(config)}/chat/completions`;
    const baseBody = {
      model: config.model.trim(),
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        {
          role: 'user',
          content: [
            { type: 'text', text: buildUserPrompt(input) },
            ...input.images.map((image) => ({
              type: 'image_url',
              image_url: {
                url: `data:${image.mimeType};base64,${image.base64}`,
              },
            })),
          ],
        },
      ],
    };

    const send = (body: object) =>
      request<ChatCompletionResponse>(url, apiKey, {
        method: 'POST',
        body: JSON.stringify(body),
        signal,
      });

    let data: ChatCompletionResponse;
    try {
      data = await send({
        ...baseBody,
        response_format: { type: 'json_object' },
      });
    } catch (error) {
      // Not every OpenAI-compatible model supports JSON mode; the prompt
      // already asks for JSON, so retry once without it.
      if (error instanceof AIProviderError && error.status === 400) {
        data = await send(baseBody);
      } else {
        throw error;
      }
    }

    const text = readContent(data);
    if (!text) {
      throw new AIProviderError(
        `The model returned no content (${data.choices?.[0]?.finish_reason ?? 'unknown reason'}).`
      );
    }

    return parseAnalysisResult(text);
  },

  async listModels({ config, apiKey, signal }) {
    const data = await request<ModelsResponse>(
      `${getBaseUrl(config)}/models`,
      apiKey,
      { signal }
    );
    return (data.data ?? []).map((model) => model.id).sort();
  },
};

export default openaiCompatibleProvider;
