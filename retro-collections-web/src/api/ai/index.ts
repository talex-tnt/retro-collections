import geminiProvider from './providers/gemini';
import openaiCompatibleProvider from './providers/openaiCompatible';
import {
  AIProviderError,
  type AIAnalysisInput,
  type AIProviderAdapter,
  type AIProviderType,
  type AIRequest,
} from './types';

// The Anthropic SDK is only downloaded when an Anthropic provider is used.
const loadAdapter = async (
  type: AIProviderType
): Promise<AIProviderAdapter> => {
  if (type === 'gemini') return geminiProvider;
  if (type === 'anthropic') {
    return (await import('./providers/anthropic')).default;
  }
  return openaiCompatibleProvider;
};

const MODEL_UNAVAILABLE =
  /(does not exist|not found|no longer available|decommissioned|deprecated|retired|not supported|do not have access)/i;

// Providers retire models regularly; point the user at the setting to change.
const withModelHint = (error: unknown): never => {
  if (
    error instanceof AIProviderError &&
    /model/i.test(error.message) &&
    MODEL_UNAVAILABLE.test(error.message)
  ) {
    throw new AIProviderError(
      `${error.message} Choose another model in Settings → AI Assistant ("Test & load models").`,
      error.status
    );
  }
  throw error;
};

export const analyzeImages = async (
  request: AIRequest,
  input: AIAnalysisInput
) =>
  (await loadAdapter(request.config.type))
    .analyze(request, input)
    .catch(withModelHint);

export const listProviderModels = async (request: AIRequest) =>
  (await loadAdapter(request.config.type)).listModels(request);

export * from './types';
export * from './presets';
