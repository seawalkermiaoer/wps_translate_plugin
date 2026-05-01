"use strict";

const OpenAI = require("openai");

// ─── LLM Client ───────────────────────────────────────────────────────────────
const client = new OpenAI({
  apiKey: process.env.LLM_API_KEY || "",
  baseURL:
    process.env.LLM_BASE_URL ||
    "https://dashscope.aliyuncs.com/compatible-mode/v1",
});
const MODEL = process.env.LLM_MODEL || "qwen-plus";

// ─── System Prompts ───────────────────────────────────────────────────────────

/**
 * Base system prompt for tag-preserving Chinese→English translation.
 * Carefully engineered to maximize LLM compliance with XML-like tag rules.
 */
const SYSTEM_PROMPT = `You are an expert bilingual translator (Chinese to English).
Your task is to translate the user's text while STRICTLY preserving the XML-like formatting tags.

RULES:
1. The input may contain tags like <r1>word</r1>, which represent text formatting (e.g., bold, hyperlinks).
2. Translate the text naturally into English, adapting the sentence structure as needed.
3. You MUST wrap the exact translated English equivalent word/phrase with the corresponding tags.
4. DO NOT change the tag names (e.g., keep <r1> as <r1>).
5. DO NOT drop or invent any tags. Every tag in the input MUST appear in the output exactly once.
6. If the input has no tags, just translate the plain text naturally.
7. Do NOT add any explanations, notes, or extra content. Output ONLY the translated text.

Example Input: 我们建议使用<r1>云计算</r1>来降低成本。
Example Output: We recommend using <r1>cloud computing</r1> to reduce costs.

Example Input: 本协议由<r1>甲方</r1>与<r2>乙方</r2>共同签署。
Example Output: This agreement is jointly signed by <r1>Party A</r1> and <r2>Party B</r2>.`;

/**
 * Strict retry prompt — injected when tags were dropped in a previous attempt.
 * @param {string[]} missingTags - Array of tag IDs that are missing, e.g. ["r1", "r3"]
 * @returns {string}
 */
function buildStrictSystemPrompt(missingTags) {
  return (
    SYSTEM_PROMPT +
    `

⚠️ CRITICAL WARNING — TAG PRESERVATION FAILURE DETECTED ⚠️
In your previous attempt, the following tags were MISSING from the output: [${missingTags.join(", ")}]
This is a critical error. You MUST include ALL tags from the input in your output.
Count the tags in the input. Count the tags in your output. They MUST match exactly.
Do NOT omit any tag under any circumstances.`
  );
}

// ─── Core Functions ───────────────────────────────────────────────────────────

/**
 * Translates a single paragraph of tagged Chinese text to English.
 *
 * @param {string} text - Tagged Chinese text, e.g. "使用<r1>云计算</r1>技术"
 * @param {string} context - Previous chunk's translation, for terminology consistency
 * @param {boolean} strict - Whether to use the strict (retry) prompt
 * @param {string[]} missingTags - Tags that were missing in the last attempt (for strict mode)
 * @returns {Promise<string>} Translated text (tagged English)
 */
async function translateSingleParagraph(
  text,
  context,
  strict = false,
  missingTags = []
) {
  // Build user message with optional context prefix
  let userMessage = text;
  if (context && context.trim()) {
    userMessage =
      `[Context from previous translation, for reference only - do NOT translate this part]\n` +
      `${context}\n\n` +
      `[Text to translate]\n` +
      `${text}`;
  }

  // Choose system prompt
  const systemPrompt =
    strict && missingTags.length > 0
      ? buildStrictSystemPrompt(missingTags)
      : SYSTEM_PROMPT;

  const response = await client.chat.completions.create({
    model: MODEL,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userMessage },
    ],
    temperature: 0.3,
    max_tokens: 4096,
  });

  const content = response.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error("LLM returned empty response");
  }

  return content.trim();
}

/**
 * Validates that all formatting tags from the source text are present in the translation.
 *
 * @param {string} sourceText - Original tagged Chinese text
 * @param {string} translatedText - Translated tagged English text
 * @returns {boolean} true if all tags are preserved
 */
function validateTagsInTranslation(sourceText, translatedText) {
  const tagIds = extractTagIds(sourceText);
  if (tagIds.length === 0) return true; // No tags to validate

  for (const id of tagIds) {
    const openTag = `<${id}>`;
    const closeTag = `</${id}>`;
    if (
      !translatedText.includes(openTag) ||
      !translatedText.includes(closeTag)
    ) {
      return false;
    }
  }
  return true;
}

/**
 * Returns the list of tag IDs that are present in sourceText but missing from translatedText.
 *
 * @param {string} sourceText
 * @param {string} translatedText
 * @returns {string[]} e.g. ["r1", "r3"]
 */
function getMissingTags(sourceText, translatedText) {
  const tagIds = extractTagIds(sourceText);
  return tagIds.filter((id) => {
    const openTag = `<${id}>`;
    const closeTag = `</${id}>`;
    return (
      !translatedText.includes(openTag) || !translatedText.includes(closeTag)
    );
  });
}

/**
 * Extracts all unique tag IDs from a tagged text string.
 * Matches patterns like <r1>, <r2>, etc.
 *
 * @param {string} text
 * @returns {string[]} e.g. ["r1", "r2"]
 */
function extractTagIds(text) {
  const matches = text.match(/<(r\d+)>/g) || [];
  const ids = matches.map((m) => m.replace(/[<>]/g, ""));
  return [...new Set(ids)]; // unique
}

/**
 * Strips all <rN> and </rN> tags from a string, returning plain text.
 *
 * @param {string} text
 * @returns {string}
 */
function stripTags(text) {
  return text.replace(/<\/?r\d+>/g, "");
}

module.exports = {
  translateSingleParagraph,
  validateTagsInTranslation,
  getMissingTags,
  extractTagIds,
  stripTags,
};
