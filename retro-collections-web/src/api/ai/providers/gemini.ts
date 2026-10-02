import {
  RESULT_GEMINI_SCHEMA,
  SYSTEM_PROMPT,
  buildUserPrompt,
  parseAnalysisResult,
} from '../prompt';
import { AIProviderError, type AIProviderAdapter } from '../types';

const BASE_URL = 'https://generativelanguage.googleapis.com/v1beta';

type GeminiErrorBody = { error?: { message?: string } };

type GeminiGenerateResponse = {
  candidates?: Array<{
    content?: { parts?: Array<{ text?: string }> };
    finishReason?: string;
  }>;
  promptFeedback?: { blockReason?: string };
};

type GeminiModelsResponse = {
  models?: Array<{ name: string; supportedGenerationMethods?: string[] }>;
};

const normalizeModel = (model: string) => model.replace(/^models\//, '');

const request = async <T>(
  path: string,
  apiKey: string,
  init: RequestInit = {}
): Promise<T> => {
  const response = await fetch(`${BASE_URL}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': apiKey,
      ...init.headers,
    },
  });

  const body = (await response.json().catch(() => ({}))) as T & GeminiErrorBody;

  if (!response.ok) {
    throw new AIProviderError(
      body.error?.message || `Gemini request failed (${response.status})`,
      response.status
    );
  }

  return body;
};

const geminiProvider: AIProviderAdapter = {
  async analyze({ config, apiKey, signal }, input) {
    const body = {
      systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
      contents: [
        {
          role: 'user',
          parts: [
            ...input.images.map((image) => ({
              inlineData: { mimeType: image.mimeType, data: image.base64 },
            })),
            { text: buildUserPrompt(input) },
          ],
        },
      ],
      generationConfig: {
        responseMimeType: 'application/json',
        responseSchema: RESULT_GEMINI_SCHEMA,
      },
    };

    const data = await request<GeminiGenerateResponse>(
      `/models/${encodeURIComponent(normalizeModel(config.model))}:generateContent`,
      apiKey,
      { method: 'POST', body: JSON.stringify(body), signal }
    );

    if (data.promptFeedback?.blockReason) {
      throw new AIProviderError(
        `Gemini blocked the request (${data.promptFeedback.blockReason}).`
      );
    }

    const text = (data.candidates?.[0]?.content?.parts ?? [])
      .map((part) => part.text ?? '')
      .join('');

    if (!text) {
      throw new AIProviderError(
        `Gemini returned no content (${data.candidates?.[0]?.finishReason ?? 'unknown reason'}).`
      );
    }

    return parseAnalysisResult(text);
  },

  async listModels({ apiKey, signal }) {
    const data = await request<GeminiModelsResponse>(
      '/models?pageSize=1000',
      apiKey,
      { signal }
    );

    return (data.models ?? [])
      .filter((model) =>
        model.supportedGenerationMethods?.includes('generateContent')
      )
      .map((model) => ({ id: normalizeModel(model.name) }))
      .sort((a, b) => a.id.localeCompare(b.id));
  },
};

export default geminiProvider;
