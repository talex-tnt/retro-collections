import type { AIProviderPresetId, AIProviderType } from './types';

export interface AIProviderPreset {
  id: AIProviderPresetId;
  type: AIProviderType;
  label: string;
  /** Suggested vision-capable model; the user can pick another from the list. */
  defaultModel: string;
  baseUrl?: string;
  requiresKey: boolean;
  pricing: 'free tier' | 'paid' | 'local';
  keyUrl?: string;
  notes?: string;
}

export const AI_PROVIDER_PRESETS: AIProviderPreset[] = [
  {
    id: 'gemini',
    type: 'gemini',
    label: 'Google Gemini',
    defaultModel: 'gemini-3.8-flash',
    requiresKey: true,
    pricing: 'free tier',
    keyUrl: 'https://aistudio.google.com/apikey',
  },
  {
    id: 'groq',
    type: 'openai-compatible',
    label: 'Groq',
    defaultModel: 'meta-llama/llama-4-scout-17b-16e-instruct',
    baseUrl: 'https://api.groq.com/openai/v1',
    requiresKey: true,
    pricing: 'free tier',
    keyUrl: 'https://console.groq.com/keys',
  },
  {
    id: 'openrouter',
    type: 'openai-compatible',
    label: 'OpenRouter',
    defaultModel: '',
    baseUrl: 'https://openrouter.ai/api/v1',
    requiresKey: true,
    pricing: 'free tier',
    keyUrl: 'https://openrouter.ai/keys',
    notes: 'Pick a vision model; models ending in ":free" cost nothing.',
  },
  {
    id: 'mistral',
    type: 'openai-compatible',
    label: 'Mistral',
    defaultModel: 'mistral-small-latest',
    baseUrl: 'https://api.mistral.ai/v1',
    requiresKey: true,
    pricing: 'free tier',
    keyUrl: 'https://console.mistral.ai/api-keys',
  },
  {
    id: 'github',
    type: 'openai-compatible',
    label: 'GitHub Models',
    defaultModel: 'openai/gpt-4o-mini',
    baseUrl: 'https://models.github.ai/inference',
    requiresKey: true,
    pricing: 'free tier',
    keyUrl: 'https://github.com/settings/personal-access-tokens',
    notes: 'Use a personal access token with the "models" permission.',
  },
  {
    id: 'openai',
    type: 'openai-compatible',
    label: 'OpenAI',
    defaultModel: 'gpt-4o-mini',
    baseUrl: 'https://api.openai.com/v1',
    requiresKey: true,
    pricing: 'paid',
    keyUrl: 'https://platform.openai.com/api-keys',
  },
  {
    id: 'anthropic',
    type: 'anthropic',
    label: 'Anthropic Claude',
    defaultModel: 'claude-opus-5-5',
    requiresKey: true,
    pricing: 'paid',
    keyUrl: 'https://platform.claude.com/settings/keys',
  },
  {
    id: 'ollama',
    type: 'openai-compatible',
    label: 'Ollama (local)',
    defaultModel: 'qwen2.5vl',
    baseUrl: 'http://localhost:11434/v1',
    requiresKey: false,
    pricing: 'local',
    notes:
      'Start Ollama with OLLAMA_ORIGINS set to this site so the browser can reach it.',
  },
  {
    id: 'custom',
    type: 'openai-compatible',
    label: 'Custom (OpenAI-compatible)',
    defaultModel: '',
    baseUrl: '',
    requiresKey: false,
    pricing: 'paid',
  },
];

export const getPreset = (id: AIProviderPresetId) =>
  AI_PROVIDER_PRESETS.find((preset) => preset.id === id) ??
  AI_PROVIDER_PRESETS[AI_PROVIDER_PRESETS.length - 1];
