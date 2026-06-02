// Translation helper for guest content i18n fields using OpenAI API.
// Sends source JSON to GPT-4o-mini and validates that the returned structure
// exactly matches the expected I18nFields shape before returning.

export interface FaqItem {
  question: string;
  answer: string;
}

export interface I18nFields {
  before_arrival_info: string;
  pickup_info: string;
  important_before_pickup: string;
  before_return_info: string;
  return_info: string;
  included_items: string;
  rules_and_tips: string;
  help_intro: string;
  help_quick_fixes: string;
  help_videos: string;
  faq_items: FaqItem[];
}

const EXPECTED_STRING_KEYS: (keyof Omit<I18nFields, 'faq_items'>)[] = [
  'before_arrival_info',
  'pickup_info',
  'important_before_pickup',
  'before_return_info',
  'return_info',
  'included_items',
  'rules_and_tips',
  'help_intro',
  'help_quick_fixes',
  'help_videos',
];

const LANG_NAMES: Record<string, string> = {
  EN: 'English',
  DE: 'German',
  SK: 'Slovak',
  PL: 'Polish',
  CS: 'Czech',
};

function buildPrompt(sourceLang: string, targetLang: string, content: I18nFields): string {
  const sourceLanguage = LANG_NAMES[sourceLang] ?? sourceLang;
  const targetLanguage = LANG_NAMES[targetLang] ?? targetLang;

  return `You are a professional translator for a camper van rental company's guest portal.
Translate the following JSON from ${sourceLanguage} to ${targetLanguage}.

Translation rules:
1. Return ONLY valid JSON with the exact same keys as the input — no markdown, no explanation.
2. Translate all human-readable text strings.
3. Lines that are just URLs (starting with http:// or https://) must remain UNCHANGED.
4. Lines ending with ":" are section headings — translate the heading text but keep the trailing ":".
5. For faq_items, translate both "question" and "answer" values for every item.
6. If a string field is empty (""), keep it as "".
7. If faq_items is an empty array ([]), keep it as [].
8. Remove any "TODO_TRANSLATE:" prefix that appears at the start of a string before translating.
9. Preserve newlines exactly — do not add or remove line breaks.

Input JSON:
${JSON.stringify(content, null, 2)}

Respond with only the translated JSON object.`;
}

function validateStructure(raw: unknown): raw is I18nFields {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return false;
  const obj = raw as Record<string, unknown>;

  for (const key of EXPECTED_STRING_KEYS) {
    if (typeof obj[key] !== 'string') return false;
  }

  if (!Array.isArray(obj.faq_items)) return false;
  for (const item of obj.faq_items as unknown[]) {
    if (
      !item ||
      typeof item !== 'object' ||
      typeof (item as Record<string, unknown>).question !== 'string' ||
      typeof (item as Record<string, unknown>).answer !== 'string'
    ) {
      return false;
    }
  }

  return true;
}

export async function translateGuestContent(
  content: I18nFields,
  sourceLang: string,
  targetLang: string,
): Promise<I18nFields> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('OPENAI_API_KEY is not configured');

  const prompt = buildPrompt(sourceLang, targetLang, content);

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.1,
      response_format: { type: 'json_object' },
    }),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`OpenAI API error ${response.status}: ${text.slice(0, 200)}`);
  }

  const data = await response.json() as {
    choices?: Array<{ message?: { content?: string } }>;
  };

  const raw = data?.choices?.[0]?.message?.content;
  if (!raw) throw new Error('Empty response from OpenAI');

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error('OpenAI returned invalid JSON');
  }

  if (!validateStructure(parsed)) {
    throw new Error('Translation result has unexpected structure — keys or types do not match');
  }

  return parsed;
}
