import { type I18nFields } from './translateGuestContent';

export interface CompanyContext {
  companyName: string;
  address?: string | null;
  email?: string | null;
  contactPhone?: string | null;
  contactWhatsapp?: string | null;
  pickupTime?: string | null;
  dropoffTime?: string | null;
  mapLink?: string | null;
  arrivalInstructions?: string | null;
  parkingInstructions?: string | null;
  depositInstructions?: string | null;
  handoverDuration?: string | null;
}

const LANG_NAMES: Record<string, string> = {
  EN: 'English',
  DE: 'German',
  SK: 'Slovak',
  PL: 'Polish',
  CS: 'Czech',
};

function buildPrompt(context: CompanyContext, language: string, existing: I18nFields | null): string {
  const languageName = LANG_NAMES[language] ?? language;

  const info: string[] = [`Company name: ${context.companyName}`];
  if (context.address) info.push(`Address: ${context.address}`);
  if (context.email) info.push(`Email: ${context.email}`);
  if (context.contactPhone) info.push(`Phone: ${context.contactPhone}`);
  if (context.contactWhatsapp) info.push(`WhatsApp: ${context.contactWhatsapp}`);
  if (context.pickupTime) info.push(`Pickup time: ${context.pickupTime}`);
  if (context.dropoffTime) info.push(`Return time: ${context.dropoffTime}`);
  if (context.mapLink) info.push(`Map/directions link: ${context.mapLink}`);
  if (context.arrivalInstructions) info.push(`Arrival instructions: ${context.arrivalInstructions}`);
  if (context.parkingInstructions) info.push(`Parking: ${context.parkingInstructions}`);
  if (context.depositInstructions) info.push(`Deposit instructions: ${context.depositInstructions}`);
  if (context.handoverDuration) info.push(`Handover duration: ${context.handoverDuration}`);

  const existingBlock = existing
    ? `\nExisting draft to improve and expand upon (preserve all real URLs, phone numbers, and facts — improve clarity and completeness):\n${JSON.stringify(existing, null, 2)}\n`
    : '';

  return `You are a professional content writer for a camper van rental company's guest portal.

Company details:
${info.join('\n')}
${existingBlock}
Write guest-facing content in ${languageName}. Return ONLY a valid JSON object with exactly these keys:

before_arrival_info    — What guests should know/prepare before arriving for pickup
pickup_info            — How to collect the vehicle (location, key handover, check-in steps)
important_before_pickup — Critical reminders before pickup (documents, deposit, timing)
before_return_info     — Step-by-step checklist guests must complete before returning the vehicle
return_info            — How to return the vehicle (parking, keys, next steps)
included_items         — What's included in the rental (bedding, kitchen items, camping gear)
rules_and_tips         — Usage rules and helpful tips for the road
help_intro             — Short 1-2 sentence intro for the Help section (reassuring, contact prompt)
help_quick_fixes       — Troubleshooting guide as a PLAIN STRING. Use "Category:" on its own line as a heading, then numbered steps each on their own line. No nested objects or arrays — everything joined with \n inside one string value.
help_videos            — Placeholder video list as a PLAIN STRING. Use "Category:" on its own line as a heading, then one "[add video URL]" line beneath each. No nested objects or arrays — plain string only.
faq_items              — Array of 4-5 FAQ objects: [{"question": "...", "answer": "..."}, ...]

Rules:
1. Return ONLY valid JSON — no markdown, no explanation, no code fences.
2. Every field except faq_items MUST be a plain JSON string — never an object, never an array. Format lists and steps using line breaks (\n) inside the string.
3. Write warm, practical, mobile-readable copy for camper van rental guests.
4. Lines ending ":" are rendered as section headings — use this format for grouped content.
5. Weave in real company details (address, phone, times, map link) wherever relevant.
6. Keep each field scannable — guests read on mobile. Use short lines.
7. Where required information is missing, use a bracketed placeholder like "[your address here]".
8. Do not fabricate URLs. Only include the map link if one was provided above; otherwise omit.
9. Remove any "TODO_TRANSLATE:" prefix from existing content before improving it.
10. faq_items must always be a JSON array (use [] if no FAQs fit).

Respond with only the JSON object.`;
}

interface ValidationFailure {
  failedKey: string;
  reason: string;
  actualKeys: string[];
  expectedKeys: string[];
}

const EXPECTED_KEYS = [
  'before_arrival_info', 'pickup_info', 'important_before_pickup',
  'before_return_info', 'return_info', 'included_items',
  'rules_and_tips', 'help_intro', 'help_quick_fixes', 'help_videos',
  'faq_items',
];

function validateStructure(raw: unknown): ValidationFailure | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    const got = raw === null ? 'null' : Array.isArray(raw) ? 'array' : typeof raw;
    return { failedKey: '(root)', reason: `expected object, got ${got}`, actualKeys: [], expectedKeys: EXPECTED_KEYS };
  }
  const obj = raw as Record<string, unknown>;
  const actualKeys = Object.keys(obj);

  for (const key of EXPECTED_KEYS.slice(0, -1)) {
    if (typeof obj[key] !== 'string') {
      const got = key in obj ? typeof obj[key] : 'missing';
      return { failedKey: key, reason: `expected string, got ${got}`, actualKeys, expectedKeys: EXPECTED_KEYS };
    }
  }

  if (!Array.isArray(obj.faq_items)) {
    const got = 'faq_items' in obj ? typeof obj.faq_items : 'missing';
    return { failedKey: 'faq_items', reason: `expected array, got ${got}`, actualKeys, expectedKeys: EXPECTED_KEYS };
  }

  for (let i = 0; i < (obj.faq_items as unknown[]).length; i++) {
    const item = (obj.faq_items as unknown[])[i];
    const it = item as Record<string, unknown>;
    if (!item || typeof item !== 'object') {
      return { failedKey: `faq_items[${i}]`, reason: `expected object, got ${typeof item}`, actualKeys, expectedKeys: EXPECTED_KEYS };
    }
    if (typeof it.question !== 'string') {
      return { failedKey: `faq_items[${i}].question`, reason: `expected string, got ${'question' in it ? typeof it.question : 'missing'}`, actualKeys, expectedKeys: EXPECTED_KEYS };
    }
    if (typeof it.answer !== 'string') {
      return { failedKey: `faq_items[${i}].answer`, reason: `expected string, got ${'answer' in it ? typeof it.answer : 'missing'}`, actualKeys, expectedKeys: EXPECTED_KEYS };
    }
  }

  return null;
}

export async function generateGuestContent(
  context: CompanyContext,
  language: string,
  existing: I18nFields | null,
): Promise<I18nFields> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('OPENAI_API_KEY is not configured');

  const prompt = buildPrompt(context, language, existing);

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.3,
      response_format: { type: 'json_object' },
      max_tokens: 2500,
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

  const failure = validateStructure(parsed);
  if (failure) {
    const err = new Error('Generation result has unexpected structure — keys or types do not match') as Error & { diagnostic: ValidationFailure };
    err.diagnostic = failure;
    throw err;
  }

  return parsed;
}
