# Frontend Technical Spec — WPS AI Smart Translation Add-in

## 1. Architecture Overview

The frontend is a WPS Web Add-in built with vanilla HTML, CSS, and JavaScript. It follows a modular architecture with clear separation of concerns:

- **Ribbon Layer** (`main.js`, `ribbon.xml`): Handles WPS ribbon integration and task pane lifecycle
- **UI Layer** (`taskpane.html`, `taskpane.css`): Renders the task pane interface
- **Core Logic Layer** (`taskpane.js`): Orchestrates the translation workflow, WPS API interactions
- **Utilities Layer** (`util.js`): Tag parsing, color conversion, and UI helpers

```
┌─────────────────────────────────────────────────────────────┐
│                     WPS Office Client                        │
│  ┌─────────────┐    ┌─────────────────────────────────────┐ │
│  │   Ribbon    │    │           Task Pane (380px)          │ │
│  │  (main.js)  │───▶│  ┌───────────────────────────────┐  │ │
│  └─────────────┘    │  │  UI Controls (taskpane.html)   │  │ │
│                     │  │  - Server URL input             │  │ │
│                     │  │  - Start / Cancel / Undo buttons│  │ │
│                     │  │  - Progress bar                 │  │ │
│                     │  └───────────────────────────────┘  │ │
│                     │  ┌───────────────────────────────┐  │ │
│                     │  │  Core Engine (taskpane.js)     │  │ │
│                     │  │  - Document scanner            │  │ │
│                     │  │  - Format serializer           │  │ │
│                     │  │  - API communicator            │  │ │
│                     │  │  - Format deserializer         │  │ │
│                     │  └───────────────────────────────┘  │ │
│                     │  ┌───────────────────────────────┐  │ │
│                     │  │  Utilities (util.js)           │  │ │
│                     │  │  - Tag parser                  │  │ │
│                     │  │  - Color converters            │  │ │
│                     │  │  - UI helpers                  │  │ │
│                     │  └───────────────────────────────┘  │ │
│                     └─────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼ HTTP POST
                     ┌─────────────────┐
                     │  Backend Server │
                     │  (Node.js)      │
                     └─────────────────┘
```

---

## 2. File Structure

```
client/
├── index.html          # Add-in entry point (host page)
├── main.js             # Ribbon event handlers, task pane management
├── ribbon.xml          # WPS ribbon custom UI definition
├── taskpane.html       # Task pane UI markup
├── taskpane.css        # Task pane styles
├── taskpane.js         # Core translation logic
├── util.js             # Utility functions
└── package.json        # Add-in manifest (type: wps)
```

---

## 3. Module Specifications

### 3.1 `ribbon.xml` — Ribbon Definition

**Purpose**: Declares the custom ribbon tab and button in WPS.

**Key Elements**:
- `customUI` root with `onLoad="OnAddinLoad"` callback
- Tab `AITranslateTab` with label "AI Translation"
- Group `translateGroup` with label "Translation"
- Button `btnTranslateDoc` with:
  - Label: "Translate Full Document"
  - Size: large
  - Action: `OnTranslateClick`
  - Supertip explaining the feature

**Integration Points**:
- `OnAddinLoad` → defined in `main.js`
- `OnTranslateClick` → defined in `main.js`

---

### 3.2 `main.js` — Ribbon Controller

**Purpose**: Entry point for WPS ribbon interactions. Manages the task pane lifecycle.

**Global State**:
- `_taskPane`: Reference to the created task pane object

**Functions**:

| Function | Description |
|---|---|
| `GetUrlPath()` | Extracts the base directory URL of the add-in for constructing `taskpane.html` path |
| `OnAddinLoad(ribbonUI)` | Stores the ribbon UI reference on `window._ribbonUI`; called once when add-in loads |
| `OnTranslateClick()` | Creates (if not exists) or reveals the task pane; docks it to the right at 380px width |
| `GetImage(control)` | Returns icon image path for ribbon button (currently empty) |

**Error Handling**:
- Wraps task pane creation in try-catch; logs errors to console

---

### 3.3 `taskpane.html` — UI Markup

**Purpose**: Defines the task pane DOM structure.

**Sections**:
1. **Header**: Icon + title "AI Smart Translation"
2. **Language Direction**: "Chinese → English" indicator with arrow icon
3. **Config Section**: Label + input for backend server URL (default: `http://localhost:3000`)
4. **Start Button**: Primary CTA "Translate Full Document"
5. **Progress Section** (hidden by default):
   - Paragraph counter + percentage
   - Animated progress bar
   - Status detail text
6. **Action Buttons** (hidden by default):
   - Cancel button (during translation)
   - Undo All button (after translation)
7. **Result Summary** (hidden by default): Success icon + title + detail
8. **Error Section** (hidden by default): Warning icon + error text

**Script Loading Order**:
1. `util.js`
2. `taskpane.js`

---

### 3.4 `taskpane.css` — Stylesheet

**Purpose**: Visual styling for the task pane.

**Design System**:
- Base font: 13px system font stack
- Container: flex column, 20px/16px padding, `#f9fafb` background
- Primary button: `#1a73e8` background, white text, full width, 8px radius
- Secondary button: `#f3f4f6` background, `#374151` text
- Danger button: `#fee2e2` background, `#dc2626` text
- Progress bar track: 6px height, `#e5e7eb` background
- Progress bar fill: `#1a73e8` to `#4a90e2` gradient, 0.3s width transition
- Result card: `#ecfdf5` background, `#a7f3d0` border
- Error card: `#fef2f2` background, `#fecaca` border
- `.hidden`: `display: none !important`

---

### 3.5 `taskpane.js` — Core Translation Engine

**Purpose**: The heart of the add-in. Orchestrates document scanning, format serialization, API communication, and format deserialization.

#### 3.5.1 Global State

| Variable | Type | Description |
|---|---|---|
| `_isCancelled` | boolean | User-cancelled flag |
| `_isTranslating` | boolean | Translation-in-progress flag |
| `_undoRecord` | object | WPS undo record (reserved for future use) |
| `_documentId` | string | Unique ID for the current translation session |
| `MAX_CHUNK_CHARS` | number | Max characters per chunk (1500) |

#### 3.5.2 WPS API Helpers

| Function | Description |
|---|---|
| `getApp()` | Resolves the WPS `Application` object from multiple possible locations (`Application`, `wps.Application`, `window.Application`, `window.parent.Application`) |
| `getActiveDocument()` | Gets the active document; throws descriptive errors if app or document is missing |

#### 3.5.3 UI Event Handlers

| Function | Description |
|---|---|
| `onStartTranslation()` | Validates server URL, resets state, shows progress UI, calls `translateDocument()`, handles completion/error |
| `onCancelTranslation()` | Sets `_isCancelled = true`, updates UI to "Cancelling..." |
| `onUndoTranslation()` | Calls `doc.Undo(999)` to revert all changes, resets UI |
| `showCompletionResult(count)` | Hides progress, shows success summary with paragraph count |

#### 3.5.4 Format Serialization Engine

**`shouldSkipParagraph(paragraph)`**
- Returns `true` if paragraph should be skipped:
  - Empty or whitespace-only (including `"\r"`)
  - Inside a table (`paragraph.Range.Tables.Count > 0`)
  - Non-main story type (`StoryType !== 1`)
- Returns `false` for normal body paragraphs
- On any error, returns `true` (safe fallback)

**`serializeParagraph(paragraph)`**
- Extracts the paragraph text (strips trailing `\r`)
- Iterates through `paragraph.Range.Characters` one by one
- Groups consecutive characters with identical formatting into "runs"
- For each run with non-default formatting, wraps it with a unique tag (`<r1>`, `<r2>`, ...)
- Returns `{ text, styleDictionary, hasFormatting }`
- **Fallback**: On any error, returns plain text without formatting

**`extractCharFormat(charRange)`**
- Extracts format from a single character's `Font` property:
  - `bold`: if `Font.Bold` is truthy and not `9999999`
  - `italic`: if `Font.Italic` is truthy and not `9999999`
  - `underline`: if `Font.Underline` is non-zero and not `9999999`
  - `color`: converted from WPS BGR integer to hex via `wpsColorToHex()`
  - `strikethrough`: if `Font.StrikeThrough` is truthy and not `9999999`
- Returns format object if any property is set; otherwise returns `null`

#### 3.5.5 Format Deserialization Engine

**`deserializeParagraph(paragraph, translatedText, styleDictionary)`**
- Parses `translatedText` using `parseTaggedText()` to get `plainText` and tag positions
- Replaces the paragraph's text (excluding trailing paragraph mark) with `plainText`
- For each tag, calculates absolute document positions and applies formatting via `applyFormatToRange()`

**`applyFormatToRange(range, style)`**
- Applies formatting to a WPS Range:
  - `bold`: `range.Font.Bold = -1`
  - `italic`: `range.Font.Italic = -1`
  - `underline`: `range.Font.Underline = 1`
  - `color`: `range.Font.Color = hexToWpsColor(style.color)`
  - `strikethrough`: `range.Font.StrikeThrough = -1`
  - `hyperlink`: Creates hyperlink via `doc.Hyperlinks.Add()`

#### 3.5.6 Translation Orchestrator

**`translateDocument(serverUrl)`** — Main orchestration flow:

```
1. Get active document and paragraph count
2. Scan all paragraphs:
   a. Skip non-translatable paragraphs
   b. Serialize each translatable paragraph
   c. Store { index, paragraph, serialized }
3. If no translatable paragraphs → throw error
4. Build chunks using buildChunks() (max 1500 chars per chunk)
5. For each chunk:
   a. Build request payload with paragraphId, text, styleDictionary
   b. Add context from previous chunk's last translation
   c. Send POST to /api/v1/translate/document-chunk
   d. On network error → log, show error, continue to next chunk
   e. On backend error → log, show error, continue to next chunk
   f. For each result → deserializeParagraph(), update progress
   g. Update previousContext for next chunk
6. Return translated paragraph count
```

**`buildChunks(paragraphs, maxChars)`**
- Greedy paragraph grouping: adds paragraphs to current chunk until `maxChars` would be exceeded
- Never splits a paragraph across chunks
- Returns array of chunk arrays

**`sendTranslationRequest(serverUrl, requestBody)`**
- Constructs URL: `serverUrl + "/api/v1/translate/document-chunk"`
- Sends `fetch()` POST with JSON body
- Throws on non-OK HTTP response
- Returns parsed JSON response

---

### 3.6 `util.js` — Utilities

**Purpose**: Pure utility functions with no side effects.

| Function | Description |
|---|---|
| `parseTaggedText(taggedText)` | Parses `<rN>...</rN>` tags using regex. Returns `{ plainText, tags[] }` where each tag has `{ id, text, start, end }` positions in plainText |
| `extractTagIds(taggedText)` | Returns array of unique tag IDs (`r1`, `r2`, ...) found in text |
| `validateTags(sourceText, translatedText)` | Returns `{ valid, missingTags }` comparing tag IDs between source and translation |
| `wpsColorToHex(colorValue)` | Converts WPS BGR integer to `#RRGGBB` hex string |
| `hexToWpsColor(hex)` | Converts `#RRGGBB` hex string to WPS BGR integer |
| `generateDocumentId()` | Generates unique doc ID: `doc_` + timestamp base36 + random suffix |
| `showElement(id)` / `hideElement(id)` | Toggle `.hidden` class on DOM element |
| `updateProgress(current, total, statusText)` | Updates progress bar width, percentage text, paragraph counter, and status detail |
| `showError(message)` / `hideError()` | Display/hide error section with message |

---

## 4. Data Flow

### 4.1 Translation Request Flow

```
WPS Document
    │
    ▼
[Document Scan] ──► Filter skip paragraphs
    │
    ▼
[Serialization] ──► taggedText + styleDictionary
    │
    ▼
[Chunk Builder] ──► chunks[] (max 1500 chars)
    │
    ▼
[API Request] ──► POST /api/v1/translate/document-chunk
    │                {
    │                  documentId, chunkIndex, context,
    │                  payload: [{ paragraphId, text, styleDictionary }]
    │                }
    ▼
[Response Handler] ◄── 200 OK
    │                {
    │                  status, chunkIndex,
    │                  results: [{ paragraphId, translatedText, tagValidation }]
    │                }
    ▼
[Deserialization] ──► Write plainText + re-apply formatting
    │
    ▼
WPS Document (updated)
```

### 4.2 Format Preservation Flow

```
WPS Paragraph
    │
    ├──► Characters.Item(1...N)
    │       │
    │       ├──► extractCharFormat() ──► { bold, italic, color, ... }
    │       │
    │       └──► Group consecutive same-format chars into "runs"
    │
    ▼
taggedText: "使用<r1>云计算</r1>技术"
styleDictionary: { "r1": { "bold": true } }
    │
    ├──► HTTP ──► Backend LLM
    │
    ▼
translatedText: "Using <r1>cloud computing</r1> technology"
    │
    ├──► parseTaggedText() ──► plainText + tag positions
    │
    ▼
Write plainText to Range.Text
    │
    └──► Apply formatting at calculated positions
         range.Characters(start, length).Font.Bold = true
```

---

## 5. API Integration

### 5.1 Endpoint

```
POST {serverUrl}/api/v1/translate/document-chunk
Content-Type: application/json
```

### 5.2 Request Body

```typescript
interface TranslationRequest {
  documentId: string;      // Unique session ID
  chunkIndex: number;      // Zero-based chunk index
  context: string;         // Previous chunk's last translated text (for terminology consistency)
  payload: ParagraphPayload[];
}

interface ParagraphPayload {
  paragraphId: string;     // e.g., "p_001"
  text: string;            // Tagged Chinese text
  styleDictionary: {       // Tag ID → format mapping
    [tagId: string]: {
      bold?: boolean;
      italic?: boolean;
      underline?: boolean;
      color?: string;       // Hex color, e.g., "#FF0000"
      strikethrough?: boolean;
    }
  };
}
```

### 5.3 Response Body

```typescript
interface TranslationResponse {
  status: "success" | "error";
  chunkIndex: number;
  results: TranslationResult[];
}

interface TranslationResult {
  paragraphId: string;
  translatedText: string;  // Tagged English text (or plain text if degraded)
  tagValidation: boolean;  // true if all tags preserved, false in degraded mode
}
```

### 5.4 Error Handling

| HTTP Status | Behavior |
|---|---|
| 200 + `status: "success"` | Process results normally |
| 200 + `status: "error"` | Log error, show to user, continue to next chunk |
| 4xx/5xx | Throw from `sendTranslationRequest()`, caught in `translateDocument()`, error displayed, continue to next chunk |
| Network failure | Same as above |

---

## 6. Error Handling Strategy

### 6.1 Error Classification

| Layer | Error Type | Handling |
|---|---|---|
| WPS API | `getApp()` fails | Throw: "WPS Application object not found. Please reopen the add-in." |
| WPS API | No active document | Throw: "No active document. Please open a document first." |
| Serialization | `serializeParagraph()` throws | Catch, log, fallback to plain text for that paragraph |
| Deserialization | `deserializeParagraph()` throws | Catch, log warning, skip formatting for that paragraph |
| Network | `fetch()` fails | Catch, show error message, continue to next chunk |
| Backend | Invalid response | Log, show error, continue to next chunk |
| User | Cancel clicked | Set flag, stop after current chunk finishes |

### 6.2 Graceful Degradation

1. **Per-paragraph fallback**: If serialization or deserialization fails on one paragraph, only that paragraph is affected (plain text).
2. **Per-chunk fallback**: If a chunk request fails, the error is logged and the system continues with the next chunk.
3. **Tag loss fallback**: If the backend returns `tagValidation: false`, the plain text translation is still written to the document.

---

## 7. Key Algorithms

### 7.1 Format Serialization Algorithm

```
Input: WPS Paragraph object
Output: { taggedText, styleDictionary, hasFormatting }

1. Get paragraph text, strip trailing "\r"
2. Get Characters collection
3. Initialize: runs = [], currentText = "", currentFormat = null, currentFormatKey = ""
4. For i = 1 to Characters.Count:
   a. Get char = Characters.Item(i).Text
   b. If char is "\r" or "\n", skip
   c. format = extractCharFormat(Characters.Item(i))
   d. formatKey = JSON.stringify(format)
   e. If formatKey == currentFormatKey:
      - currentText += char
   f. Else:
      - If currentText.length > 0: push { text: currentText, format: currentFormat } to runs
      - currentText = char, currentFormat = format, currentFormatKey = formatKey
5. Push last run
6. Build taggedText:
   - tagCounter = 0
   - For each run in runs:
     - If run.format != null:
       - tagCounter++, tagId = "r" + tagCounter
       - taggedText += "<" + tagId + ">" + run.text + "</" + tagId + ">"
       - styleDictionary[tagId] = run.format
     - Else:
       - taggedText += run.text
7. Return { taggedText, styleDictionary, hasFormatting: tagCounter > 0 }
```

### 7.2 Format Deserialization Algorithm

```
Input: paragraph, translatedText, styleDictionary
1. parsed = parseTaggedText(translatedText)
2. plainText = parsed.plainText
3. tags = parsed.tags  // [{ id, text, start, end }]
4. range = paragraph.Range
5. startPos = range.Start
6. endPos = range.End
7. textRange = doc.Range(startPos, endPos - 1)  // exclude paragraph mark
8. textRange.Text = plainText
9. For each tag in tags:
   a. style = styleDictionary[tag.id]
   b. If !style, continue
   c. tagStart = startPos + tag.start
   d. tagEnd = startPos + tag.end
   e. tagRange = doc.Range(tagStart, tagEnd)
   f. applyFormatToRange(tagRange, style)
```

### 7.3 Chunk Building Algorithm

```
Input: paragraphs[], maxChars
Output: chunks[][]

1. chunks = [], currentChunk = [], currentChars = 0
2. For each para in paragraphs:
   a. textLength = para.serialized.text.length
   b. If currentChunk.length > 0 AND currentChars + textLength > maxChars:
      - push currentChunk to chunks
      - currentChunk = [], currentChars = 0
   c. currentChunk.push(para)
   d. currentChars += textLength
3. If currentChunk.length > 0: push to chunks
4. Return chunks
```

---

## 8. State Machine

The translation process follows this state flow:

```
[Idle]
  │
  │ onStartTranslation()
  ▼
[Scanning] ──► "Scanning document structure..."
  │
  │ Collect translatable paragraphs
  ▼
[Translating] ──► "Translating chunk X/Y..."
  │
  ├──► onCancelTranslation() ──► [Cancelled]
  │
  │ All chunks processed
  ▼
[Complete] ──► Show result summary, enable Undo
  │
  │ onUndoTranslation()
  ▼
[Idle] ──► Document restored
```

---

## 9. Browser/WPS Compatibility

| Target | Version | Notes |
|---|---|---|
| WPS Office | Windows Desktop, Web Add-in support | Uses `Application` JSAPI |
| WPS JSAPI | Standard API set | `Document.Paragraphs`, `Range.Characters`, `Range.Font`, `Hyperlinks.Add` |
| Browser Engine | IE11+ / Edge (WPS embedded) | Vanilla JS, no ES6+ features that require transpilation |

**Compatibility Notes**:
- WPS uses `Font.Bold = -1` for true (not `true`)
- WPS color values are BGR integers, not RGB
- Paragraph text includes trailing `\r` which must be stripped
- The `Application` object may be accessed via multiple paths (handled in `getApp()`)

---

## 10. Performance Considerations

1. **Character-by-character iteration**: `serializeParagraph()` iterates every character. For very long paragraphs (1000+ chars), this is O(n) and acceptable for WPS JSAPI performance.
2. **Synchronous chunk processing**: Chunks are processed sequentially (not parallel) to maintain document position stability and provide accurate progress updates.
3. **Memory**: The entire translatable paragraph list is held in memory during translation. For a 10,000-paragraph document, this is approximately a few MB of tagged text.
4. **DOM updates**: Each paragraph write triggers a WPS DOM update. Batch size is controlled by chunking to balance throughput and responsiveness.
