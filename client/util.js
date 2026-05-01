// util.js — Pure utility functions for WPS AI Translation Add-in
// No side effects. No WPS API calls. Testable in isolation.

/**
 * Parses a tagged string like "Using <r1>cloud computing</r1> to reduce costs."
 * Returns the plain text and an array of tag positions within the plain text.
 *
 * @param {string} taggedText
 * @returns {{ plainText: string, tags: Array<{id:string, text:string, start:number, end:number}> }}
 *
 * @example
 * parseTaggedText("使用<r1>云计算</r1>技术")
 * // => { plainText: "使用云计算技术", tags: [{ id:"r1", text:"云计算", start:2, end:5 }] }
 */
function parseTaggedText(taggedText) {
  var plainText = "";
  var tags = [];
  var remaining = taggedText;

  while (remaining.length > 0) {
    // Find the next opening tag
    var openMatch = remaining.match(/<(r\d+)>/);
    if (!openMatch) {
      // No more tags — append the rest as plain text
      plainText += remaining;
      break;
    }

    var tagId = openMatch[1];
    var openTagIndex = remaining.indexOf(openMatch[0]);

    // Append text before the tag
    plainText += remaining.substring(0, openTagIndex);

    // Find closing tag
    var closeTag = "</" + tagId + ">";
    var closeIndex = remaining.indexOf(closeTag, openTagIndex);

    if (closeIndex === -1) {
      // Malformed — no closing tag; append everything after opening tag as plain text
      plainText += remaining.substring(openTagIndex + openMatch[0].length);
      break;
    }

    // Extract tagged content
    var tagContent = remaining.substring(
      openTagIndex + openMatch[0].length,
      closeIndex
    );
    var tagStart = plainText.length;
    plainText += tagContent;
    var tagEnd = plainText.length;

    tags.push({ id: tagId, text: tagContent, start: tagStart, end: tagEnd });

    // Advance past the closing tag
    remaining = remaining.substring(closeIndex + closeTag.length);
  }

  return { plainText: plainText, tags: tags };
}

/**
 * Returns a deduplicated array of tag IDs found in the tagged text.
 *
 * @param {string} taggedText
 * @returns {string[]} e.g. ["r1", "r2"]
 */
function extractTagIds(taggedText) {
  var matches = taggedText.match(/<(r\d+)>/g) || [];
  var ids = matches.map(function (m) {
    return m.replace(/[<>]/g, "");
  });
  // Deduplicate
  var seen = {};
  return ids.filter(function (id) {
    if (seen[id]) return false;
    seen[id] = true;
    return true;
  });
}

/**
 * Validates that all tag IDs in sourceText are present in translatedText.
 *
 * @param {string} sourceText
 * @param {string} translatedText
 * @returns {{ valid: boolean, missingTags: string[] }}
 */
function validateTags(sourceText, translatedText) {
  var sourceIds = extractTagIds(sourceText);
  var missingTags = sourceIds.filter(function (id) {
    return (
      translatedText.indexOf("<" + id + ">") === -1 ||
      translatedText.indexOf("</" + id + ">") === -1
    );
  });
  return { valid: missingTags.length === 0, missingTags: missingTags };
}

/**
 * Converts a WPS color integer (BGR) to a CSS hex string (#RRGGBB).
 *
 * WPS stores colors as 0x00BBGGRR (little-endian BGR).
 * 9999999 (0x98967F) is WPS's sentinel for "no color / auto".
 *
 * @param {number} colorValue
 * @returns {string|null} "#RRGGBB" or null if no color
 */
function wpsColorToHex(colorValue) {
  if (!colorValue || colorValue === 9999999 || colorValue < 0) return null;
  // WPS BGR → RGB
  var b = (colorValue >> 16) & 0xff;
  var g = (colorValue >> 8) & 0xff;
  var r = colorValue & 0xff;
  return (
    "#" +
    ("0" + r.toString(16)).slice(-2) +
    ("0" + g.toString(16)).slice(-2) +
    ("0" + b.toString(16)).slice(-2)
  );
}

/**
 * Converts a CSS hex color string (#RRGGBB) to a WPS BGR integer.
 *
 * @param {string} hex - e.g. "#FF0000" or "FF0000"
 * @returns {number} WPS BGR integer
 */
function hexToWpsColor(hex) {
  var clean = hex.replace("#", "");
  var r = parseInt(clean.substring(0, 2), 16);
  var g = parseInt(clean.substring(2, 4), 16);
  var b = parseInt(clean.substring(4, 6), 16);
  // WPS expects BGR (little-endian)
  return (b << 16) | (g << 8) | r;
}

/**
 * Generates a unique document session ID.
 * Format: doc_<timestamp_base36><random_suffix>
 *
 * @returns {string} e.g. "doc_lp3k7a2fxq"
 */
function generateDocumentId() {
  return "doc_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

// ─── DOM Helpers ──────────────────────────────────────────────────────────────

/**
 * Shows a DOM element by removing the 'hidden' class.
 * @param {string} id
 */
function showElement(id) {
  var el = document.getElementById(id);
  if (el) el.classList.remove("hidden");
}

/**
 * Hides a DOM element by adding the 'hidden' class.
 * @param {string} id
 */
function hideElement(id) {
  var el = document.getElementById(id);
  if (el) el.classList.add("hidden");
}

/**
 * Updates the progress bar, percentage text, paragraph counter, and status detail.
 *
 * @param {number} current - Paragraphs processed so far
 * @param {number} total - Total paragraphs to process
 * @param {string} [statusText] - Optional status detail text
 */
function updateProgress(current, total, statusText) {
  var pct = total > 0 ? Math.round((current / total) * 100) : 0;

  var bar = document.getElementById("progressBar");
  if (bar) bar.style.width = pct + "%";

  var pctEl = document.getElementById("progressPct");
  if (pctEl) pctEl.textContent = pct + "%";

  var counterEl = document.getElementById("progressCounter");
  if (counterEl) counterEl.textContent = current + " / " + total + " paragraphs";

  var detailEl = document.getElementById("statusDetail");
  if (detailEl && statusText !== undefined) detailEl.textContent = statusText;
}

/**
 * Shows the error section with the given message.
 * @param {string} message
 */
function showError(message) {
  var msgEl = document.getElementById("errorMsg");
  if (msgEl) msgEl.textContent = message;
  showElement("errorSection");
}

/**
 * Hides the error section.
 */
function hideError() {
  hideElement("errorSection");
}
