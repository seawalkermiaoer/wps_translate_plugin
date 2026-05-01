"use strict";

// ─── Constants ────────────────────────────────────────────────────────────────
const DEFAULT_CONFIG = {
  maxTokens: 8192,           // T_max: model's max token window
  systemPromptTokens: 500,   // T_sys: estimated system prompt tokens
  expansionRatio: 1.8,       // R_exp: Chinese char → token expansion ratio
  absoluteCharLimit: 1500,   // C_limit: hard safety cap in characters
};

// ─── Functions ────────────────────────────────────────────────────────────────

/**
 * Calculates the optimal maximum character count per translation chunk.
 *
 * Formula: C_opt = min( (T_max - T_sys - T_ctx) / R_exp, C_limit )
 *
 * @param {number} contextTokens - Tokens consumed by the previous-chunk context (T_ctx)
 * @param {Partial<typeof DEFAULT_CONFIG>} config - Override defaults
 * @returns {number} Optimal characters per chunk
 */
function calculateOptimalChunkSize(contextTokens = 0, config = {}) {
  const {
    maxTokens,
    systemPromptTokens,
    expansionRatio,
    absoluteCharLimit,
  } = { ...DEFAULT_CONFIG, ...config };

  const availableTokens = maxTokens - systemPromptTokens - contextTokens;
  if (availableTokens <= 0) {
    return Math.min(500, absoluteCharLimit);
  }

  const optimalChars = Math.floor(availableTokens / expansionRatio);
  return Math.min(optimalChars, absoluteCharLimit);
}

/**
 * Estimates the token count for a mixed Chinese/English text string.
 * Heuristic: Chinese chars × 1.8 + English words × 1.3
 *
 * @param {string} text
 * @returns {number}
 */
function estimateTokens(text) {
  const chineseChars = (text.match(/[\u4e00-\u9fff\u3400-\u4dbf]/g) || [])
    .length;
  const englishWords = text
    .split(/\s+/)
    .filter((w) => w.length > 0).length;
  return Math.ceil(chineseChars * 1.8 + englishWords * 1.3);
}

/**
 * Splits an array of paragraph objects into chunks, each within maxCharsPerChunk.
 * Paragraphs are never split across chunks.
 * A single paragraph exceeding the limit gets its own chunk.
 *
 * @param {Array<{text: string}>} paragraphs - Paragraphs with at least a `text` property
 * @param {number} [maxCharsPerChunk] - If omitted, uses calculateOptimalChunkSize()
 * @returns {Array<Array<{text: string}>>} Array of chunks (each chunk = array of paragraphs)
 */
function splitIntoChunks(paragraphs, maxCharsPerChunk) {
  const maxChars = maxCharsPerChunk ?? calculateOptimalChunkSize();
  const chunks = [];
  let currentChunk = [];
  let currentLength = 0;

  for (const para of paragraphs) {
    const paraLength = para.text?.length || 0;

    // Paragraph exceeds limit on its own → give it a dedicated chunk
    if (paraLength > maxChars) {
      if (currentChunk.length > 0) {
        chunks.push(currentChunk);
        currentChunk = [];
        currentLength = 0;
      }
      chunks.push([para]);
      continue;
    }

    // Adding this paragraph would overflow the current chunk
    if (currentChunk.length > 0 && currentLength + paraLength > maxChars) {
      chunks.push(currentChunk);
      currentChunk = [];
      currentLength = 0;
    }

    currentChunk.push(para);
    currentLength += paraLength;
  }

  if (currentChunk.length > 0) {
    chunks.push(currentChunk);
  }

  return chunks;
}

module.exports = {
  calculateOptimalChunkSize,
  estimateTokens,
  splitIntoChunks,
};
