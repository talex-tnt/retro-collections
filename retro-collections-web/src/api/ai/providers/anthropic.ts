import Anthropic from '@anthropic-ai/sdk';

import {
  RESULT_JSON_SCHEMA,
  SYSTEM_PROMPT,
  buildUserPrompt,
  parseAnalysisResult,
} from '../prompt';
import { AIProviderError, type AIProviderAdapter } from '../types';

type ImageMediaType = 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp';

// Models that accept the server-side refusal fallback ("default" form).
const FALLBACK_MODELS = new Set([
  'claude-fable-5-1',
  'claude-opus-5-5',
  'claude-opus-5',
  'claude-sonnet-5-5',
]);

const createClient = (apiKey: string) =>
  // The key belongs to the signed-in user and is only sent to Anthropic.
  new Anthropic({ apiKey, dangerouslyAllowBrowser: true, maxRetries: 1 });

const toProviderError = (error: unknown): never => {
  if (error instanceof Anthropic.AuthenticationError) {
    throw new AIProviderError('Invalid Anthropic API key.', error.status);
  }
  if (error instanceof Anthropic.RateLimitError) {
    throw new AIProviderError(
      'Anthropic rate limit reached. Try again shortly.',
      error.status
    );
  }
  if (error instanceof Anthropic.APIError) {
    throw new AIProviderError(error.message, error.status);
  }
  throw error;
};

const anthropicProvider: AIProviderAdapter = {
  async analyze({ config, apiKey, signal }, input) {
    const client = createClient(apiKey);
    const model = config.model.trim();
    const useFallbacks = FALLBACK_MODELS.has(model);

    try {
      const response = await client.beta.messages.create(
        {
          model,
          max_tokens: 16000,
          system: SYSTEM_PROMPT,
          messages: [
            {
              role: 'user',
              content: [
                ...input.images.map((image) => ({
                  type: 'image' as const,
                  source: {
                    type: 'base64' as const,
                    media_type: image.mimeType as ImageMediaType,
                    data: image.base64,
                  },
                })),
                { type: 'text' as const, text: buildUserPrompt(input) },
              ],
            },
          ],
          output_config: {
            format: { type: 'json_schema', schema: RESULT_JSON_SCHEMA },
          },
          ...(useFallbacks
            ? {
                betas: ['server-side-fallback-2026-07-01'],
                fallbacks: 'default' as const,
              }
            : {}),
        },
        { signal }
      );

      if (response.stop_reason === 'refusal') {
        throw new AIProviderError(
          response.stop_details?.explanation ||
            'Claude declined to analyze these photos.'
        );
      }
      if (response.stop_reason === 'max_tokens') {
        throw new AIProviderError('The response was cut off. Try again.');
      }

      const text = response.content
        .map((block) => (block.type === 'text' ? block.text : ''))
        .join('');

      return parseAnalysisResult(text);
    } catch (error) {
      return toProviderError(error);
    }
  },

  async listModels({ apiKey, signal }) {
    const client = createClient(apiKey);
    try {
      const models = [];
      for await (const model of client.models.list({}, { signal })) {
        models.push({
          id: model.id,
          acceptsImages: model.capabilities?.image_input?.supported,
        });
      }
      return models;
    } catch (error) {
      return toProviderError(error);
    }
  },
};

export default anthropicProvider;
