// taskpane.js — Core Translation Engine for WPS AI Translation Add-in
// Orchestrates: document scanning → format serialization → API call → format deserialization
// Compatible with IE11+ / WPS embedded browser (no ES6+ syntax that requires transpilation)

// ─── Global State ─────────────────────────────────────────────────────────────
var _isCancelled = false;
var _isTranslating = false;
var _documentId = "";
var MAX_CHUNK_CHARS = 1500;

// ─── WPS API Helpers ──────────────────────────────────────────────────────────

/**
 * Resolves the WPS Application object from multiple possible access paths.
 * WPS may expose it differently depending on the hosting context.
 *
 * @returns {object} WPS Application object
 * @throws {Error} If Application is not found
 */
function getApp() {
  var app =
    (typeof Application !== "undefined" && Application) ||
    (typeof wps !== "undefined" && wps.Application) ||
    (window.Application) ||
    (window.parent && window.parent.Application);

  if (!app) {
    throw new Error(
      "WPS Application object not found. Please reopen the add-in."
    );
  }
  return app;
}

/**
 * Gets the currently active WPS document.
 *
 * @returns {object} WPS Document object
 * @throws {Error} If no active document is found
 */
function getActiveDocument() {
  var app = getApp();
  if (!app.ActiveDocument) {
    throw new Error("No active document. Please open a document first.");
  }
  return app.ActiveDocument;
}

// ─── UI Event Handlers ────────────────────────────────────────────────────────

/**
 * Helper to start translation based on mode
 */
function _startTranslation(mode, targetPage) {
  if (_isTranslating) return;

  var serverUrl = document.getElementById("serverUrlInput").value.trim();
  if (!serverUrl) {
    showError(getI18nString("backendUrl") + " is required.");
    return;
  }

  var projectId = document.getElementById("projectIdInput").value.trim();
  if (!projectId) {
    showError(getI18nString("errProjectIdMissing"));
    return;
  }

  // Reset state
  _isCancelled = false;
  _isTranslating = true;
  _documentId = generateDocumentId();

  // Update UI
  hideError();
  hideElement("resultSection");
  hideElement("startButtonsContainer");
  showElement("progressSection");
  showElement("actionButtons");
  showElement("btnCancel");
  hideElement("btnUndo");
  updateProgress(0, 0, "Scanning document structure...");

  translateDocument(serverUrl, projectId, mode, targetPage)
    .then(function (count) {
      _isTranslating = false;
      showCompletionResult(count);
    })
    .catch(function (err) {
      _isTranslating = false;
      console.error("[Translation Error]", err.message || err);

      if (_isCancelled) {
        // User cancelled — show partial state
        hideElement("btnCancel");
        showElement("btnUndo");
        showElement("startButtonsContainer");
        var detailEl = document.getElementById("statusDetail");
        if (detailEl) detailEl.textContent = "Translation cancelled.";
      } else {
        showError(err.message || "An unexpected error occurred.");
        showElement("startButtonsContainer");
        hideElement("btnCancel");
        showElement("btnUndo");
      }
    });
}

/**
 * Handler for the "Translate Full Document" button.
 */
function onStartFullTranslation() {
  _startTranslation("full_document", null);
}

/**
 * Handler for the "Translate Page" button.
 */
function onStartPageTranslation() {
  var pageNumber = parseInt(document.getElementById("pageNumberInput").value, 10);
  if (isNaN(pageNumber) || pageNumber < 1) {
    showError("Invalid page number.");
    return;
  }
  _startTranslation("single_page", pageNumber);
}

/**
 * Handler for the "Cancel" button.
 * Sets the cancellation flag — the running loop checks this between chunks.
 */
function onCancelTranslation() {
  _isCancelled = true;
  var detailEl = document.getElementById("statusDetail");
  if (detailEl) detailEl.textContent = "Cancelling after current chunk...";
  var cancelBtn = document.getElementById("btnCancel");
  if (cancelBtn) cancelBtn.disabled = true;
}

/**
 * Handler for the "Undo All" button.
 * Uses WPS built-in undo to revert all changes made during translation.
 */
function onUndoTranslation() {
  try {
    var doc = getActiveDocument();
    doc.Undo(999); // Revert up to 999 undo steps (covers full translation)
  } catch (e) {
    console.warn("[Undo] WPS undo failed:", e.message || e);
  }

  // Reset UI to idle
  hideElement("progressSection");
  hideElement("actionButtons");
  hideElement("resultSection");
  hideElement("btnCancel");
  hideElement("btnUndo");
  hideError();
  showElement("startButtonsContainer");
  updateProgress(0, 0, "");
}

/**
 * Hides the progress section and shows the success summary card.
 *
 * @param {number} count - Number of paragraphs successfully translated
 */
function showCompletionResult(count) {
  hideElement("progressSection");
  hideElement("btnCancel");
  showElement("btnUndo");
  showElement("resultSection");

  var detailEl = document.getElementById("resultDetail");
  if (detailEl) {
    detailEl.textContent = count + " paragraph" + (count !== 1 ? "s" : "") + " translated successfully.";
  }
}

// ─── Format Serialization Engine ──────────────────────────────────────────────

/**
 * Determines whether a paragraph should be skipped during translation.
 * Skipped: empty, whitespace-only, inside a table, non-main story type, or page mismatch.
 *
 * @param {object} paragraph - WPS Paragraph object
 * @param {string} mode - "full_document" or "single_page"
 * @param {number|null} targetPage - Page number if single_page mode
 * @returns {boolean} true = skip this paragraph
 */
function shouldSkipParagraph(paragraph, mode, targetPage) {
  try {
    var text = paragraph.Range.Text;
    // Skip empty / whitespace-only paragraphs (WPS appends "\r" to each paragraph)
    if (!text || text.replace(/[\r\n\s]/g, "").length === 0) {
      return true;
    }
    // Skip paragraphs inside tables
    if (paragraph.Range.Tables && paragraph.Range.Tables.Count > 0) {
      return true;
    }
    // Skip non-main story paragraphs (headers, footers, footnotes, etc.)
    // StoryType 1 = wdMainTextStory
    if (paragraph.Range.StoryType !== undefined && paragraph.Range.StoryType !== 1) {
      return true;
    }
    // Check page number for single_page mode
    if (mode === "single_page" && targetPage != null) {
      // wdActiveEndPageNumber = 3
      var pageNum = paragraph.Range.Information(3);
      if (pageNum !== targetPage) {
        return true;
      }
    }
    return false;
  } catch (e) {
    // On any WPS API error, safely skip
    return true;
  }
}

/**
 * Extracts the format properties of a single character range.
 * Returns null if all properties are at their defaults (no special formatting).
 *
 * @param {object} charRange - WPS Range for a single character
 * @returns {{ bold?: boolean, italic?: boolean, underline?: boolean, color?: string, strikethrough?: boolean }|null}
 */
function extractCharFormat(charRange) {
  var fmt = {};
  var hasFormat = false;

  try {
    var font = charRange.Font;
    var SENTINEL = 9999999; // WPS "auto/mixed" sentinel value

    if (font.Bold && font.Bold !== SENTINEL) {
      fmt.bold = true;
      hasFormat = true;
    }
    if (font.Italic && font.Italic !== SENTINEL) {
      fmt.italic = true;
      hasFormat = true;
    }
    if (font.Underline && font.Underline !== 0 && font.Underline !== SENTINEL) {
      fmt.underline = true;
      hasFormat = true;
    }
    if (font.Color && font.Color !== 0 && font.Color !== SENTINEL) {
      var hex = wpsColorToHex(font.Color);
      if (hex) {
        fmt.color = hex;
        hasFormat = true;
      }
    }
    if (font.StrikeThrough && font.StrikeThrough !== SENTINEL) {
      fmt.strikethrough = true;
      hasFormat = true;
    }
  } catch (e) {
    // Ignore individual character format read errors
  }

  return hasFormat ? fmt : null;
}

/**
 * Serializes a WPS paragraph into a tagged text string and a style dictionary.
 *
 * Algorithm:
 *   1. Iterate characters one by one
 *   2. Group consecutive chars with identical formatting into "runs"
 *   3. Wrap formatted runs with unique <rN> tags
 *   4. Return { text, styleDictionary, hasFormatting }
 *
 * @param {object} paragraph - WPS Paragraph object
 * @returns {{ text: string, styleDictionary: object, hasFormatting: boolean }}
 */
function serializeParagraph(paragraph) {
  try {
    var rawText = paragraph.Range.Text || "";
    // Strip trailing paragraph mark "\r"
    rawText = rawText.replace(/\r$/, "");

    if (!rawText) {
      return { text: "", styleDictionary: {}, hasFormatting: false };
    }

    var chars = paragraph.Range.Characters;
    var charCount = chars.Count;

    // Group consecutive same-format characters into runs
    var runs = [];
    var currentText = "";
    var currentFormat = null;
    var currentFormatKey = "null";

    for (var i = 1; i <= charCount; i++) {
      var charRange = chars.Item(i);
      var ch = charRange.Text;

      // Skip paragraph and line-break control characters
      if (ch === "\r" || ch === "\n" || ch === "\x0B") continue;

      var fmt = extractCharFormat(charRange);
      var fmtKey = fmt ? JSON.stringify(fmt) : "null";

      if (fmtKey === currentFormatKey) {
        currentText += ch;
      } else {
        if (currentText.length > 0) {
          runs.push({ text: currentText, format: currentFormat });
        }
        currentText = ch;
        currentFormat = fmt;
        currentFormatKey = fmtKey;
      }
    }
    // Push the last run
    if (currentText.length > 0) {
      runs.push({ text: currentText, format: currentFormat });
    }

    // Build tagged text and style dictionary
    var taggedText = "";
    var styleDictionary = {};
    var tagCounter = 0;

    for (var r = 0; r < runs.length; r++) {
      var run = runs[r];
      if (run.format !== null) {
        tagCounter++;
        var tagId = "r" + tagCounter;
        taggedText += "<" + tagId + ">" + run.text + "</" + tagId + ">";
        styleDictionary[tagId] = run.format;
      } else {
        taggedText += run.text;
      }
    }

    return {
      text: taggedText,
      styleDictionary: styleDictionary,
      hasFormatting: tagCounter > 0,
    };
  } catch (e) {
    // Fallback: return plain text without formatting
    console.warn("[Serialize] Fallback to plain text for paragraph:", e.message || e);
    var fallbackText = "";
    try {
      fallbackText = (paragraph.Range.Text || "").replace(/\r$/, "");
    } catch (e2) { /* ignore */ }
    return { text: fallbackText, styleDictionary: {}, hasFormatting: false };
  }
}

// ─── Format Deserialization Engine ────────────────────────────────────────────

/**
 * Applies a style object to a WPS Range.
 *
 * Note: WPS uses -1 for true (not JavaScript's true).
 * Colors are stored as BGR integers, not RGB hex strings.
 *
 * @param {object} range - WPS Range object
 * @param {{ bold?:boolean, italic?:boolean, underline?:boolean, color?:string, strikethrough?:boolean }} style
 * @param {object} doc - WPS Document object (needed for hyperlink creation)
 */
function applyFormatToRange(range, style, doc) {
  try {
    if (style.bold) range.Font.Bold = -1;
    if (style.italic) range.Font.Italic = -1;
    if (style.underline) range.Font.Underline = 1;
    if (style.color) range.Font.Color = hexToWpsColor(style.color);
    if (style.strikethrough) range.Font.StrikeThrough = -1;
    if (style.hyperlink && doc) {
      doc.Hyperlinks.Add(range, style.hyperlink);
    }
  } catch (e) {
    console.warn("[ApplyFormat] Failed to apply style:", e.message || e);
  }
}

/**
 * Deserializes a translated tagged string back into the WPS paragraph.
 *
 * Algorithm:
 *   1. Parse translatedText → plainText + tag positions
 *   2. Write plainText to the paragraph range (excluding paragraph mark)
 *   3. Re-apply each tag's formatting at the calculated absolute positions
 *
 * @param {object} paragraph - WPS Paragraph object
 * @param {string} translatedText - Tagged English text from backend
 * @param {object} styleDictionary - Tag ID → format mapping
 * @param {object} doc - WPS Document object
 */
function deserializeParagraph(paragraph, translatedText, styleDictionary, doc) {
  try {
    var parsed = parseTaggedText(translatedText);
    var plainText = parsed.plainText;
    var tags = parsed.tags;

    var range = paragraph.Range;
    var startPos = range.Start;
    var endPos = range.End;

    // Write plain text (exclude the trailing paragraph mark, hence endPos - 1)
    var textRange = doc.Range(startPos, endPos - 1);
    textRange.Text = plainText;

    // Re-apply formatting for each tag
    for (var t = 0; t < tags.length; t++) {
      var tag = tags[t];
      var style = styleDictionary[tag.id];
      if (!style) continue;

      var tagStart = startPos + tag.start;
      var tagEnd = startPos + tag.end;

      try {
        var tagRange = doc.Range(tagStart, tagEnd);
        applyFormatToRange(tagRange, style, doc);
      } catch (e) {
        console.warn("[Deserialize] Failed to apply format for tag " + tag.id + ":", e.message || e);
      }
    }
  } catch (e) {
    console.warn("[Deserialize] Failed for paragraph, skipping formatting:", e.message || e);
  }
}

// ─── Translation Orchestrator ─────────────────────────────────────────────────

/**
 * Groups paragraphs into chunks, each staying within maxChars total characters.
 *
 * @param {Array} paragraphs - Array of { index, paragraph, serialized }
 * @param {number} maxChars
 * @returns {Array<Array>} Array of chunks
 */
function buildChunks(paragraphs, maxChars) {
  var chunks = [];
  var currentChunk = [];
  var currentChars = 0;

  for (var i = 0; i < paragraphs.length; i++) {
    var para = paragraphs[i];
    var textLength = para.serialized.text.length;

    if (currentChunk.length > 0 && currentChars + textLength > maxChars) {
      chunks.push(currentChunk);
      currentChunk = [];
      currentChars = 0;
    }
    currentChunk.push(para);
    currentChars += textLength;
  }
  if (currentChunk.length > 0) {
    chunks.push(currentChunk);
  }
  return chunks;
}

/**
 * Sends a translation request to the backend.
 *
 * @param {string} serverUrl
 * @param {object} requestBody
 * @returns {Promise<object>} Parsed JSON response
 */
function sendTranslationRequest(serverUrl, requestBody) {
  var url = serverUrl.replace(/\/$/, "") + "/api/v1/translate/document-chunk";
  return fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(requestBody),
  }).then(function (response) {
    if (!response.ok) {
      throw new Error("HTTP " + response.status + " " + response.statusText);
    }
    return response.json();
  });
}

/**
 * Main translation orchestration function.
 *
 * Flow:
 *   1. Scan all paragraphs, skip non-translatable ones
 *   2. Serialize each paragraph's formatting into tagged strings
 *   3. Build chunks (max 1500 chars each)
 *   4. Send each chunk to the backend sequentially
 *   5. Deserialize results back into the document
 *   6. Update progress after each paragraph
 *
 * @param {string} serverUrl - Backend server URL
 * @param {string} projectId - Project ID for backend mapping
 * @param {string} mode - "full_document" or "single_page"
 * @param {number|null} targetPage - Page number if single_page mode
 * @returns {Promise<number>} Count of successfully translated paragraphs
 */
function translateDocument(serverUrl, projectId, mode, targetPage) {
  return new Promise(function (resolve, reject) {
    var doc, totalParagraphs, paraCount;

    try {
      doc = getActiveDocument();
      paraCount = doc.Paragraphs.Count;
    } catch (e) {
      return reject(e);
    }

    updateProgress(0, paraCount, "Scanning document structure...");

    // ── Phase 1: Scan & Serialize ─────────────────────────────────────────────
    var translatables = []; // [{ index, paragraph, serialized }]

    for (var i = 1; i <= paraCount; i++) {
      var para;
      try {
        para = doc.Paragraphs.Item(i);
      } catch (e) {
        continue;
      }

      if (shouldSkipParagraph(para, mode, targetPage)) continue;

      var serialized = serializeParagraph(para);
      if (!serialized.text) continue;

      translatables.push({ index: i, paragraph: para, serialized: serialized });
    }

    totalParagraphs = translatables.length;

    if (totalParagraphs === 0) {
      return reject(new Error("No translatable paragraphs found in the document."));
    }

    // ── Phase 2: Build Chunks ─────────────────────────────────────────────────
    var chunks = buildChunks(translatables, MAX_CHUNK_CHARS);
    var totalChunks = chunks.length;
    var translatedCount = 0;
    var previousContext = "";

    updateProgress(0, totalParagraphs, "Preparing " + totalChunks + " chunk" + (totalChunks !== 1 ? "s" : "") + "...");

    // ── Phase 3: Process Chunks Sequentially ──────────────────────────────────
    function processChunk(chunkIndex) {
      if (_isCancelled) {
        return reject(new Error("Translation cancelled by user."));
      }
      if (chunkIndex >= totalChunks) {
        return resolve(translatedCount);
      }

      var chunk = chunks[chunkIndex];
      var statusText = "Translating chunk " + (chunkIndex + 1) + "/" + totalChunks + "...";
      updateProgress(translatedCount, totalParagraphs, statusText);

      // Build request payload
      var payload = chunk.map(function (item) {
        return {
          paragraphId: "p_" + String(item.index).padStart(3, "0"),
          text: item.serialized.text,
          styleDictionary: item.serialized.styleDictionary,
        };
      });

      var requestBody = {
        documentId: _documentId,
        projectId: projectId,
        mode: mode,
        pageNumber: targetPage,
        targetLang: "en",
        chunkIndex: chunkIndex,
        context: previousContext,
        payload: payload,
      };

      sendTranslationRequest(serverUrl, requestBody)
        .then(function (response) {
          if (!response || !response.results) {
            throw new Error("Invalid response from backend for chunk " + chunkIndex);
          }

          // Write results back to the document
          var lastTranslation = "";
          for (var r = 0; r < response.results.length; r++) {
            var result = response.results[r];
            var item = chunk[r];
            if (!item) continue;

            try {
              deserializeParagraph(
                item.paragraph,
                result.translatedText,
                item.serialized.styleDictionary,
                doc
              );
            } catch (e) {
              console.warn("[Write] Failed to write paragraph " + result.paragraphId + ":", e.message || e);
            }

            translatedCount++;
            lastTranslation = result.translatedText;
            updateProgress(translatedCount, totalParagraphs, statusText);
          }

          // Pass last translated text as context for the next chunk
          if (lastTranslation) {
            // Use plain text as context (strip tags)
            previousContext = lastTranslation.replace(/<\/?r\d+>/g, "");
          }

          processChunk(chunkIndex + 1);
        })
        .catch(function (err) {
          var msg = "Network error on chunk " + (chunkIndex + 1) + ": " + (err.message || err);
          console.error("[Chunk Error]", msg);
          showError(msg);
          // Continue to next chunk despite the error
          processChunk(chunkIndex + 1);
        });
    }

    processChunk(0);
  });
}
