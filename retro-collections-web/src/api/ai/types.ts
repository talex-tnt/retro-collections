export type AIProviderType = 'gemini' | 'openai-compatible' | 'anthropic';

export type AIProviderPresetId =
  | 'gemini'
  | 'openai'
  | 'groq'
  | 'openrouter'
  | 'mistral'
  | 'ollama'
  | 'anthropic'
  | 'custom';

/** A provider configured by the user. Never contains the API key. */
export interface AIProviderConfig {
  id: string;
  preset: AIProviderPresetId;
  type: AIProviderType;
  label: string;
  model: string;
  baseUrl?: string;
}

export interface AIImageInput {
  mimeType: string;
  base64: string;
}

export interface AIAnalysisInput {
  images: AIImageInput[];
  /** Tags currently selected on the item form. */
  inputTags: string[];
  /** Tags the user already uses, to encourage reuse over new spellings. */
  knownTags: string[];
  extraInstructions?: string;
}

export interface AIAnalysisResult {
  title: string;
  description: string;
  tags: string[];
}

export interface AIModelInfo {
  id: string;
  /** Whether the model accepts images; undefined when the provider doesn't say. */
  acceptsImages?: boolean;
}

export interface AIRequest {
  config: AIProviderConfig;
  apiKey: string;
  signal?: AbortSignal;
}

export interface AIProviderAdapter {
  analyze(
    request: AIRequest,
    input: AIAnalysisInput
  ): Promise<AIAnalysisResult>;
  listModels(request: AIRequest): Promise<AIModelInfo[]>;
}

export class AIProviderError extends Error {
  status?: number;

  constructor(message: string, status?: number) {
    super(message);
    this.name = 'AIProviderError';
    this.status = status;
  }
}
