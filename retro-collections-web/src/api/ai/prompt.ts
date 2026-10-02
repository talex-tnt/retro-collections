import type { AIAnalysisInput, AIAnalysisResult } from './types';
import { AIProviderError } from './types';

const MAX_KNOWN_TAGS = 300;
const MAX_NEW_TAGS = 2;

const FIELD_DESCRIPTIONS = {
  title: `A concise, professional title for the product (max 40 characters), without punctuation or characters that are invalid in folder names such as slashes. If the product is a special version, you can add that to the title.`,
  description: `A very short description of the physical product, in English unless instructed otherwise. Highlight what makes this copy unique compared to other copies of the same product: imperfections, serial number/code, special versions, and other notable characteristics visible in the pictures. If the product is media software, describe only the physical media (disc, cartridge, box, manual), not the software itself. Describe only what is visible in the images, and avoid copying text printed on the product unless it is short like a serial number or edition name.`,
  tags: `Relevant lowercase product tags. Keep the valid input tags, drop the ones that do not match the product, and add at most ${MAX_NEW_TAGS} new highly relevant tags.`,
};

export const SYSTEM_PROMPT = `You catalogue physical collectibles (mostly retro video games, consoles and accessories) from photos taken by their owner. Respond only with the requested JSON object.

Tag rules:
- Tags are concise and lowercase.
- Prefer tags from the user's existing tag list over new spellings of the same concept.
- Do not add the product's name, brand or genre as a tag, and do not add generic or redundant tags (e.g. "videogame" when "game" is present, or "playstation 4" when "ps4" is present).
- Keep language tags such as ita, eng, fr, de, es, pt exactly as given and never add the same language in a different format (e.g. "english" or "en" for "eng").
- Only add tags in categories already present in the input (e.g. if ps4 is present and the item is for ps5, ps5 may be added).
- If it is a special edition, a tag such as "special edition", "limited edition" or "collector's edition" may be added.
- If the product is tied to a platform publisher, make sure a tag for it is present (e.g. "sony", "microsoft", "nintendo").
- Add at most ${MAX_NEW_TAGS} tags that are not in the input tags.`;

/** Standard JSON Schema, used by OpenAI-compatible and Anthropic providers. */
export const RESULT_JSON_SCHEMA = {
  type: 'object',
  properties: {
    title: { type: 'string', description: FIELD_DESCRIPTIONS.title },
    description: {
      type: 'string',
      description: FIELD_DESCRIPTIONS.description,
    },
    tags: {
      type: 'array',
      items: { type: 'string' },
      description: FIELD_DESCRIPTIONS.tags,
    },
  },
  required: ['title', 'description', 'tags'],
  additionalProperties: false,
};

/** Gemini uses the OpenAPI schema subset (uppercase types, no additionalProperties). */
export const RESULT_GEMINI_SCHEMA = {
  type: 'OBJECT',
  properties: {
    title: { type: 'STRING', description: FIELD_DESCRIPTIONS.title },
    description: {
      type: 'STRING',
      description: FIELD_DESCRIPTIONS.description,
    },
    tags: {
      type: 'ARRAY',
      items: { type: 'STRING' },
      description: FIELD_DESCRIPTIONS.tags,
    },
  },
  required: ['title', 'description', 'tags'],
};

export const buildUserPrompt = (input: AIAnalysisInput) => {
  const knownTags = input.knownTags.slice(0, MAX_KNOWN_TAGS);
  const lines = [
    `Analyze the ${input.images.length} attached photo(s) of the same product.`,
    `Input tags: [${input.inputTags.join(', ')}]`,
    `User's existing tags: [${knownTags.join(', ')}]`,
    '',
    'Return a JSON object with these fields:',
    `- "title": ${FIELD_DESCRIPTIONS.title}`,
    `- "description": ${FIELD_DESCRIPTIONS.description}`,
    `- "tags": ${FIELD_DESCRIPTIONS.tags}`,
  ];

  const extra = input.extraInstructions?.trim();
  if (extra) {
    lines.push('', `Additional instructions from the user: ${extra}`);
  }

  return lines.join('\n');
};

const extractJsonObject = (text: string): unknown => {
  const trimmed = text.trim();

  try {
    return JSON.parse(trimmed);
  } catch {
    // Some models wrap JSON in prose or code fences; take the outermost object.
    const start = trimmed.indexOf('{');
    const end = trimmed.lastIndexOf('}');
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(trimmed.slice(start, end + 1));
      } catch {
        // fall through
      }
    }
  }

  throw new AIProviderError('The AI response was not valid JSON.');
};

export const sanitizeTitle = (title: string) =>
  title
    .replace(/[\n\r\t]/g, ' ')
    .replace(/[\\/:*?"<>|]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

export const parseAnalysisResult = (text: string): AIAnalysisResult => {
  const raw = extractJsonObject(text) as Partial<
    Record<keyof AIAnalysisResult, unknown>
  >;

  const tags = Array.isArray(raw.tags)
    ? raw.tags
        .filter((tag): tag is string => typeof tag === 'string')
        .map((tag) => tag.trim().toLowerCase())
        .filter(Boolean)
    : [];

  return {
    title: typeof raw.title === 'string' ? sanitizeTitle(raw.title) : '',
    description:
      typeof raw.description === 'string' ? raw.description.trim() : '',
    tags: Array.from(new Set(tags)),
  };
};
