import geminiProvider from './providers/gemini';
import openaiCompatibleProvider from './providers/openaiCompatible';
import type {
  AIAnalysisInput,
  AIProviderAdapter,
  AIProviderType,
  AIRequest,
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

export const analyzeImages = async (
  request: AIRequest,
  input: AIAnalysisInput
) => (await loadAdapter(request.config.type)).analyze(request, input);

export const listProviderModels = async (request: AIRequest) =>
  (await loadAdapter(request.config.type)).listModels(request);

export * from './types';
export * from './presets';
