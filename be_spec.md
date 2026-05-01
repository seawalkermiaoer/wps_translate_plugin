# Backend Technical Spec — WPS AI Smart Translation Server

## 1. Architecture Overview

The backend is a lightweight Node.js/Express service that mediates between the WPS add-in client and a Large Language Model (LLM) API. It follows a layered architecture:

- **Transport Layer** (`server.js`): Express app, middleware, routing, error handling
- **Route Layer** (`routes/translate.js`): HTTP request handlers, validation, response formatting
- **Service Layer** (`services/llm.js`): LLM client, prompt engineering, tag validation
- **Utility Layer** (`utils/chunker.js`): Token estimation, chunk size calculation (reference logic)

```
┌─────────────────────────────────────────────────────────────┐
│                      WPS Add-in Client                       │
│                      (taskpane.js)                           │
└──────────────────────────┬──────────────────────────────────┘
                           │ HTTP POST /api/v1/translate/document-chunk
                           ▼
┌─────────────────────────────────────────────────────────────┐
│              WPS AI Translation Server (Node.js)             │
│  ┌───────────────────────────────────────────────────────┐  │
│  │  Transport Layer (server.js)                           │  │
│  │  - Express app, CORS, JSON parser (10MB limit)        │  │
│  │  - Error handling middleware                          │  │
│  │  - Health check: GET /api/health                      │  │
│  └─────────────────────┬─────────────────────────────────┘  │
│                        │                                     │
│  ┌─────────────────────▼─────────────────────────────────┐  │
│  │  Route Layer (routes/translate.js)                     │  │
│  │  - POST /document-chunk                               │  │
│  │  - Request validation                                 │  │
│  │  - Per-paragraph retry orchestration                  │  │
│  │  - Degraded mode fallback                             │  │
│  └─────────────────────┬─────────────────────────────────┘  │
│                        │                                     │
│  ┌─────────────────────▼─────────────────────────────────┐  │
│  │  Service Layer (services/llm.js)                       │  │
│  │  - OpenAI-compatible client                           │  │
│  │  - System / user prompt construction                  │  │
│  │  - Single-paragraph translation                       │  │
│  │  - Tag validation & missing tag detection             │  │
│  └─────────────────────┬─────────────────────────────────┘  │
│                        │                                     │
│  ┌─────────────────────▼─────────────────────────────────┐  │
│  │  Utility Layer (utils/chunker.js)                      │  │
│  │  - Optimal chunk size calculation                     │  │
│  │  - Token estimation heuristics                        │  │
│  │  - Paragraph splitting logic                          │  │
│  └───────────────────────────────────────────────────────┘  │
└──────────────────────────┬──────────────────────────────────┘
                           │ OpenAI-compatible API
                           ▼
┌─────────────────────────────────────────────────────────────┐
│              LLM Provider (e.g., Qwen / DashScope)           │
│              chat.completions.create()                       │
└─────────────────────────────────────────────────────────────┘
```

---

## 2. File Structure

```
server/
├── server.js               # Express app entry point
├── package.json            # Dependencies and scripts
├── .env                    # Runtime environment variables (not in git)
├── .env.example            # Example environment configuration
├── routes/
│   └── translate.js        # /api/v1/translate route handlers
├── services/
│   └── llm.js              # LLM client, prompts, validation
└── utils/
    └── chunker.js          # Chunking and token estimation utilities
```

---

## 3. Module Specifications

### 3.1 `server.js` — Application Entry Point

**Purpose**: Initializes and starts the Express HTTP server.

**Dependencies**: `express`, `cors`, `dotenv`, `./routes/translate`

**Configuration (from environment)**:
- `PORT`: Server listen port (default: 3000)
- `LLM_MODEL`: Model name logged at startup (default: "qwen-plus")
- `LLM_BASE_URL`: Base URL logged at startup (default: "not set")

**Middleware Stack**:
1. `cors()` — Enable cross-origin requests from any origin
2. `express.json({ limit: "10mb" })` — Parse JSON bodies up to 10MB

**Routes**:
- `GET /api/health` → Returns `{ status: "ok", model, timestamp }`
- `POST /api/v1/translate/*` → Delegated to `translateRouter`

**Error Handler**:
```javascript
(err, req, res, next) => {
  console.error("[Server Error]", err.message);
  res.status(500).json({ status: "error", message: err.message });
}
```

**Startup Logging**:
- Server URL: `http://localhost:${PORT}`
- LLM Model and Base URL (for verification)

---

### 3.2 `routes/translate.js` — Translation Route

**Purpose**: Handles the `/api/v1/translate/document-chunk` endpoint and implements per-paragraph retry with exponential backoff.

**Dependencies**: `express`, `../services/llm`

**Configuration**:
- `MAX_RETRIES`: From `process.env.MAX_RETRIES` or default `3`

#### Route Handler: `POST /document-chunk`

**Request Validation**:
```javascript
if (!payload || !Array.isArray(payload) || payload.length === 0) {
  return 400 { status: "error", message: "Missing or empty payload array." }
}
```

**Processing Flow**:
1. Extract `documentId`, `chunkIndex`, `context`, `payload` from request body
2. Log: `[Translate] Doc: ${documentId}, Chunk: ${chunkIndex}, Paragraphs: ${payload.length}`
3. For each paragraph in `payload`:
   - Call `translateWithRetry(para, context || "")`
   - Append result to `results` array
4. Respond with `{ status: "success", chunkIndex, results }`

**Error Handling**:
- Try-catch around the entire route handler
- On error: log and return 500 with `{ status: "error", message }`

#### `translateWithRetry(para, context)`

**Algorithm**:
```
Input: para = { paragraphId, text, styleDictionary }, context
Output: { paragraphId, translatedText, tagValidation }

1. lastTranslation = "", lastError = null
2. For attempt = 1 to MAX_RETRIES:
   a. If attempt > 1:
      - delay = 2^(attempt-1) * 1000 ms
      - await sleep(delay)
   b. isStrict = (attempt > 1)
   c. missingTags = (attempt > 1 && lastTranslation) ? getMissingTags(text, lastTranslation) : []
   d. translated = await translateSingleParagraph(text, context, isStrict, missingTags)
   e. lastTranslation = translated
   f. isValid = validateTagsInTranslation(text, translated)
   g. If isValid:
      - Log success
      - Return { paragraphId, translatedText: translated, tagValidation: true }
   h. Else:
      - Log warning with missing tags
      - Continue to next attempt
3. All retries exhausted → Degraded Mode:
   a. If lastTranslation exists:
      - plain = stripTags(lastTranslation)
      - Return { paragraphId, translatedText: plain, tagValidation: false }
   b. Else:
      - plain = stripTags(original text)
      - Return { paragraphId, translatedText: plain, tagValidation: false }
```

**Tag Stripping**:
- Regex: `/<\/?r\d+>/g` — removes all `<rN>` and `</rN>` tags

---

### 3.3 `services/llm.js` — LLM Service

**Purpose**: Interfaces with the LLM API, constructs prompts, and validates tag preservation.

**Dependencies**: `openai`

**Client Initialization**:
```javascript
const client = new OpenAI({
  apiKey: process.env.LLM_API_KEY || "",
  baseURL: process.env.LLM_BASE_URL || "https://dashscope.aliyuncs.com/compatible-mode/v1",
});
const MODEL = process.env.LLM_MODEL || "qwen-plus";
```

#### Prompt Design

**System Prompt (`SYSTEM_PROMPT`)**:
```
You are an expert bilingual translator (Chinese to English).
Your task is to translate the user's text while STRICTLY preserving the XML-like formatting tags.

RULES:
1. The input contains tags like <r1>word</r1>, which represent formatting (e.g., bold, hyperlinks).
2. Translate the text naturally into English, adapting the sentence structure as needed.
3. You MUST wrap the exact translated English equivalent word/phrase with the corresponding tags.
4. DO NOT change the tag names (e.g., keep <r1> as <r1>).
5. DO NOT drop or invent any tags. Every tag in the input MUST appear in the output exactly once.
6. If the input has no tags, just translate the plain text naturally.
7. Do NOT add any explanations, notes, or extra content. Output ONLY the translated text.

Example Input: 我们建议使用<r1>云计算</r1>来降低成本。
Example Output: We recommend using <r1>cloud computing</r1> to reduce costs.

Example Input: 本协议由<r1>甲方</r1>与<r2>乙方</r2>共同签署。
Example Output: This agreement is jointly signed by <r1>Party A</r1> and <r2>Party B</r2>.
```

**Strict Retry Prompt (`STRICT_SYSTEM_PROMPT`)**:
- Extends `SYSTEM_PROMPT`
- Adds a CRITICAL WARNING about lost tags
- Injects the specific missing tag list via `{missingTags}` placeholder

#### Functions

**`translateParagraphs(paragraphs, context, strict, missingTags)`**:
- Iterates paragraphs sequentially
- Calls `translateSingleParagraph()` for each
- Builds results array with `paragraphId`, `translatedText`, `tagValidation`
- Updates `context` after each paragraph with the latest translation
- Returns results array

**`translateSingleParagraph(text, context, strict, missingTags)`**:
```
1. Build userMessage:
   - If context provided:
     "[Context from previous translation, for reference only - do NOT translate this part]\n${context}\n\n[Text to translate]\n${text}"
   - Else: just text
2. Choose systemPrompt:
   - If strict && missingTags.length > 0: use STRICT_SYSTEM_PROMPT with tags injected
   - Else: use SYSTEM_PROMPT
3. Call client.chat.completions.create({
     model: MODEL,
     messages: [
       { role: "system", content: systemPrompt },
       { role: "user", content: userMessage }
     ],
     temperature: 0.3,
     max_tokens: 4096
   })
4. Extract content from response.choices[0].message.content
5. If no content → throw "LLM returned empty response"
6. Return content.trim()
```

**`validateTagsInTranslation(sourceText, translatedText)`**:
1. Extract all unique `<rN>` tag IDs from `sourceText`
2. If no tags → return `true`
3. For each tag:
   - Check that `<tag>` and `</tag>` both exist in `translatedText`
   - If any missing → return `false`
4. Return `true`

**`getMissingTags(sourceText, translatedText)`**:
- Same extraction logic as `validateTagsInTranslation`
- Returns array of tag IDs that are missing from `translatedText`

---

### 3.4 `utils/chunker.js` — Chunking Utilities

**Purpose**: Provides chunk size calculation and token estimation algorithms. Primarily used as reference logic (the client currently does its own chunking).

#### `calculateOptimalChunkSize(contextTokens, config)`

Implements the formula:

```
C_opt = min( (T_max - T_sys - T_ctx) / R_exp, C_limit )
```

**Default Constants**:
| Symbol | Value | Description |
|---|---|---|
| `maxTokens` | 8192 | T_max: model's max token window |
| `systemPromptTokens` | 500 | T_sys: estimated system prompt tokens |
| `expansionRatio` | 1.8 | R_exp: Chinese char to token ratio |
| `absoluteCharLimit` | 1500 | C_limit: hard cap for safety |

**Algorithm**:
```
availableTokens = maxTokens - systemPromptTokens - contextTokens
if availableTokens <= 0:
  return min(500, absoluteCharLimit)
optimalChars = floor(availableTokens / expansionRatio)
return min(optimalChars, absoluteCharLimit)
```

#### `estimateTokens(text)`

**Heuristic**:
- Count Chinese characters (`\u4e00-\u9fff`, `\u3400-\u4dbf`)
- Count English words (split by whitespace, filter empty)
- Formula: `ceil(chineseChars * 1.8 + englishWords * 1.3)`

#### `splitIntoChunks(paragraphs, maxCharsPerChunk)`

**Algorithm**:
```
maxChars = maxCharsPerChunk || calculateOptimalChunkSize()
chunks = [], currentChunk = [], currentLength = 0

For each para in paragraphs:
  paraLength = para.text?.length || 0
  If paraLength > maxChars:
    If currentChunk not empty: push to chunks, reset
    Push [para] as its own chunk
    Continue
  If currentChunk.length > 0 AND currentLength + paraLength > maxChars:
    Push currentChunk to chunks
    Reset currentChunk and currentLength
  currentChunk.push(para)
  currentLength += paraLength

If currentChunk not empty: push to chunks
Return chunks
```

---

## 4. API Specification

### 4.1 Health Check

```http
GET /api/health
```

**Response 200 OK**:
```json
{
  "status": "ok",
  "model": "qwen-plus",
  "timestamp": "2026-05-01T12:00:00.000Z"
}
```

### 4.2 Translate Document Chunk

```http
POST /api/v1/translate/document-chunk
Content-Type: application/json
```

#### Request Body

```typescript
interface TranslateChunkRequest {
  /** Unique identifier for the translation session */
  documentId: string;

  /** Zero-based index of the current chunk */
  chunkIndex: number;

  /** Previous chunk's last translated text, for terminology consistency */
  context?: string;

  /** Array of paragraphs to translate in this chunk */
  payload: Array<{
    /** Paragraph identifier, e.g., "p_001" */
    paragraphId: string;

    /** Tagged Chinese text to translate */
    text: string;

    /** Mapping from tag IDs to format properties */
    styleDictionary: Record<string, {
      bold?: boolean;
      italic?: boolean;
      underline?: boolean;
      color?: string;        // Hex color, e.g., "#FF0000"
      strikethrough?: boolean;
    }>;
  }>;
}
```

**Example Request**:
```json
{
  "documentId": "doc_8837482",
  "chunkIndex": 3,
  "context": "This agreement covers the terms of service.",
  "payload": [
    {
      "paragraphId": "p_001",
      "text": "本协议由<r1>甲方</r1>与<r2>乙方</r2>共同签署。",
      "styleDictionary": {
        "r1": { "bold": true, "color": "#FF0000" },
        "r2": { "bold": true, "color": "#0000FF", "underline": true }
      }
    },
    {
      "paragraphId": "p_002",
      "text": "双方同意遵守上述条款。",
      "styleDictionary": {}
    }
  ]
}
```

#### Success Response (200 OK)

```typescript
interface TranslateChunkResponse {
  status: "success";
  chunkIndex: number;
  results: Array<{
    paragraphId: string;
    translatedText: string;
    tagValidation: boolean;
  }>;
}
```

**Example Response**:
```json
{
  "status": "success",
  "chunkIndex": 3,
  "results": [
    {
      "paragraphId": "p_001",
      "translatedText": "This agreement is jointly signed by <r1>Party A</r1> and <r2>Party B</r2>.",
      "tagValidation": true
    },
    {
      "paragraphId": "p_002",
      "translatedText": "Both parties agree to abide by the above terms.",
      "tagValidation": true
    }
  ]
}
```

#### Degraded Mode Response (200 OK)

When tags cannot be preserved after all retries:
```json
{
  "status": "success",
  "chunkIndex": 3,
  "results": [
    {
      "paragraphId": "p_001",
      "translatedText": "This agreement is jointly signed by Party A and Party B.",
      "tagValidation": false
    }
  ]
}
```

#### Error Responses

**400 Bad Request — Invalid payload**:
```json
{
  "status": "error",
  "message": "Missing or empty payload array."
}
```

**500 Internal Server Error**:
```json
{
  "status": "error",
  "message": "Translation failed"
}
```

---

## 5. Data Models

### 5.1 Internal Types

```typescript
// routes/translate.js
interface ParagraphPayload {
  paragraphId: string;
  text: string;
  styleDictionary: StyleDictionary;
}

interface TranslationResult {
  paragraphId: string;
  translatedText: string;
  tagValidation: boolean;
}

// services/llm.js
interface LLMResponse {
  choices: Array<{
    message: {
      content: string;
    };
  }>;
}

// utils/chunker.js
interface ChunkerConfig {
  maxTokens?: number;           // default: 8192
  systemPromptTokens?: number;  // default: 500
  expansionRatio?: number;      // default: 1.8
  absoluteCharLimit?: number;   // default: 1500
}
```

### 5.2 Style Dictionary Schema

```typescript
interface StyleDictionary {
  [tagId: string]: {
    bold?: boolean;
    italic?: boolean;
    underline?: boolean;
    color?: string;        // #RRGGBB format
    strikethrough?: boolean;
    hyperlink?: string;    // URL (reserved for future use)
  };
}
```

---

## 6. Error Handling Strategy

### 6.1 Error Classification

| Category | Examples | Handler |
|---|---|---|
| Client Input | Missing payload, malformed JSON | Return 400 with descriptive message |
| LLM API | Timeout, network error, rate limit | Exponential backoff retry |
| LLM Response | Empty response, unexpected format | Retry; if exhausted, degraded mode |
| Tag Validation | Missing `<rN>` or `</rN>` in output | Retry with strict prompt; if exhausted, strip tags |
| Server Internal | Unhandled exception | Return 500, log stack trace |

### 6.2 Retry State Machine

```
[Attempt 1]
  │
  ├──► Success + tags valid ──► [Return result]
  │
  ├──► Success + tags invalid ──► [Attempt 2]
  │     - wait 2000ms
  │     - strict prompt with missing tags
  │
  └──► Error ──► [Attempt 2]
        - wait 2000ms
        - retry with same prompt

[Attempt 2]
  │
  ├──► Success + tags valid ──► [Return result]
  │
  ├──► Success + tags invalid ──► [Attempt 3]
  │     - wait 4000ms
  │     - strict prompt with missing tags
  │
  └──► Error ──► [Attempt 3]
        - wait 4000ms
        - retry with same prompt

[Attempt 3]
  │
  ├──► Success + tags valid ──► [Return result]
  │
  └──► Any failure ──► [Degraded Mode]
        - Strip all <rN> tags
        - Return plain text
        - tagValidation = false
```

---

## 7. Prompt Engineering

### 7.1 Design Principles

1. **Clarity**: The LLM must understand exactly what `<rN>` tags represent
2. **Concreteness**: Examples must be specific and representative of real inputs
3. **Emphasis**: Critical rules (tag preservation) must be strongly emphasized
4. **Brevity**: Extra content increases token usage and may dilute instructions
5. **Constraint**: Output must be translation only — no explanations, no markdown code blocks

### 7.2 Prompt Structure

```
[Role Definition]
[Task Description]
[Rules List - numbered, explicit]
[Examples - input/output pairs]
```

### 7.3 Strict Retry Augmentation

When entering retry mode, the prompt is augmented with:
- A CRITICAL WARNING header
- Explicit mention of which tags were lost
- Reinforcement of the counting rule

This leverages the LLM's sensitivity to explicit error feedback.

---

## 8. Deployment Guide

### 8.1 Prerequisites

- Node.js 18+ installed
- Access to an OpenAI-compatible LLM API (e.g., Alibaba Cloud DashScope)

### 8.2 Environment Setup

```bash
cd server/
cp .env.example .env
# Edit .env with your actual API key and configuration
```

### 8.3 Installation

```bash
cd server/
npm install
```

### 8.4 Running

```bash
# Development (with auto-reload)
npm run dev

# Production
npm start
```

### 8.5 Verification

```bash
curl http://localhost:3000/api/health
```

Expected response:
```json
{"status":"ok","model":"qwen-plus","timestamp":"..."}
```

---

## 9. Logging Reference

| Log Pattern | Meaning | Action |
|---|---|---|
| `[WPS Translate Server] Running on http://localhost:3000` | Server started successfully | None |
| `[Translate] Doc: ${id}, Chunk: ${idx}, Paragraphs: ${n}` | Translation request received | Monitor volume |
| `[Retry] Paragraph ${id}, attempt ${n}/${max}, waiting ${delay}ms` | Retry triggered | Check LLM stability |
| `[Tag Validation] FAILED for ${id} (attempt ${n}): missing tags [${tags}]` | LLM dropped tags | Monitor model performance |
| `[Degraded Mode] ${id}: returning translation without guaranteed tag preservation` | All retries exhausted | Review paragraph complexity |
| `[Translate Error] ${id} attempt ${n}: ${message}` | LLM API error | Check network/API status |
| `[Server Error] ${message}` | Unhandled exception | Review stack trace |

---

## 10. Future Extensibility

| Feature | Description | Estimated Complexity |
|---|---|---|
| Authentication | API key or JWT-based client auth | Low |
| Rate Limiting | Token bucket or sliding window per client | Medium |
| Streaming | SSE or WebSocket for real-time progress | Medium |
| Multi-language | Support EN→CN, JP→EN, etc. | Low (prompt change) |
| Persistent Logs | Store requests/responses in database | Medium |
| Metrics | Prometheus/Grafana integration | Medium |
| Table Translation | Handle table cell content | High (client + server) |
| Batch Parallelism | Translate paragraphs in parallel within a chunk | Low |
| Model Fallback | Switch to backup model on primary failure | Medium |
| Caching | Cache identical paragraphs to reduce LLM calls | Medium |
