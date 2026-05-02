import express, { Request, Response } from 'express';
import {
  translateSingleParagraph,
  validateTagsInTranslation,
  getMissingTags,
  stripTags,
} from '../services/llm';

const router = express.Router();

// ─── Configuration ────────────────────────────────────────────────────────────
const MAX_RETRIES = parseInt(process.env.MAX_RETRIES || "3", 10);

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Sleeps for the given number of milliseconds.
 * @param {number} ms
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

interface ParagraphPayload {
  paragraphId: string;
  text: string;
  styleDictionary?: any;
}

interface TranslationResult {
  paragraphId: string;
  translatedText: string;
  tagValidation: boolean;
}

/**
 * Translates a single paragraph with exponential-backoff retry and degraded-mode fallback.
 *
 * Retry strategy:
 *   - Attempt 1: normal prompt
 *   - Attempt 2+: strict prompt with missing-tag list, wait 2^(attempt-1) seconds first
 *   - After MAX_RETRIES failures: strip tags, return plain text (tagValidation = false)
 *
 * @param {{ paragraphId: string, text: string, styleDictionary: object }} para
 * @param {string} context - Previous translation context
 * @returns {Promise<{ paragraphId: string, translatedText: string, tagValidation: boolean }>}
 */
async function translateWithRetry(para: ParagraphPayload, context: string): Promise<TranslationResult> {
  const { paragraphId, text } = para;
  let lastTranslation = "";

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    // Exponential backoff before retry attempts
    if (attempt > 1) {
      const delayMs = Math.pow(2, attempt - 1) * 1000; // 2s, 4s, 8s...
      console.log(
        `[Retry] Paragraph ${paragraphId}, attempt ${attempt}/${MAX_RETRIES}, waiting ${delayMs}ms`
      );
      await sleep(delayMs);
    }

    try {
      const isStrict = attempt > 1;
      const missingTags =
        isStrict && lastTranslation
          ? getMissingTags(text, lastTranslation)
          : [];

      const translated = await translateSingleParagraph(
        text,
        context,
        isStrict,
        missingTags
      );
      lastTranslation = translated;

      const isValid = validateTagsInTranslation(text, translated);

      if (isValid) {
        if (attempt > 1) {
          console.log(
            `[Translate] Paragraph ${paragraphId} succeeded on attempt ${attempt}`
          );
        }
        return { paragraphId, translatedText: translated, tagValidation: true };
      }

      // Tag validation failed — log and retry
      const stillMissing = getMissingTags(text, translated);
      console.warn(
        `[Tag Validation] FAILED for ${paragraphId} (attempt ${attempt}/${MAX_RETRIES}): missing tags [${stillMissing.join(", ")}]`
      );
    } catch (err: any) {
      console.error(
        `[Translate Error] ${paragraphId} attempt ${attempt}: ${err.message}`
      );
    }
  }

  // ── Degraded Mode ──────────────────────────────────────────────────────────
  console.warn(
    `[Degraded Mode] ${paragraphId}: returning translation without guaranteed tag preservation`
  );

  const plainText = lastTranslation
    ? stripTags(lastTranslation)
    : stripTags(text); // Last resort: strip original

  return { paragraphId, translatedText: plainText, tagValidation: false };
}

// ─── Route ────────────────────────────────────────────────────────────────────

/**
 * POST /api/v1/translate/document-chunk
 *
 * Translates a batch of tagged Chinese paragraphs to English.
 *
 * Request body:
 *   documentId   string    — session identifier
 *   chunkIndex   number    — zero-based chunk number
 *   context      string?   — previous chunk's last translated text
 *   payload      Array     — paragraphs: [{ paragraphId, text, styleDictionary }]
 *
 * Response 200:
 *   { status: "success", chunkIndex, results: [{ paragraphId, translatedText, tagValidation }] }
 *
 * Response 400:
 *   { status: "error", message: "Missing or empty payload array." }
 *
 * Response 500:
 *   { status: "error", message: "..." }
 */
router.post("/document-chunk", async (req: Request, res: Response) => {
  try {
    const { documentId, chunkIndex, context, payload } = req.body;

    // ── Validate ─────────────────────────────────────────────────────────────
    if (!payload || !Array.isArray(payload) || payload.length === 0) {
      console.warn(
        `[Translate] Missing or empty payload from doc ${documentId}`
      );
      return res.status(400).json({
        status: "error",
        message: "Missing or empty payload array.",
      });
    }

    console.log(
      `[Translate] Doc: ${documentId}, Chunk: ${chunkIndex}, Paragraphs: ${payload.length}`
    );

    // ── Process each paragraph ────────────────────────────────────────────────
    const results = [];
    const ctx = context || "";

    for (const para of payload) {
      const result = await translateWithRetry(para, ctx);
      results.push(result);
    }

    return res.json({ status: "success", chunkIndex, results });
  } catch (err: any) {
    console.error("[Translate Route Error]", err.message);
    return res.status(500).json({ status: "error", message: err.message });
  }
});

export default router;
