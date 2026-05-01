# Backend PRD — WPS AI Smart Translation Server

## 1. Product Overview

### 1.1 Product Name
WPS AI Translation Server (V1.0 MVP)

### 1.2 Product Description
A Node.js/Express middleware service that acts as the bridge between the WPS AI Translation Add-in and Large Language Model (LLM) APIs. The server receives serialized document chunks from the client, orchestrates translation via LLM calls, validates that formatting tags are preserved, and implements retry with exponential backoff. If tags cannot be preserved after retries, it falls back to degraded mode (plain text without tags).

### 1.3 Target Users
- End users of the WPS AI Translation Add-in (indirect)
- System administrators deploying the translation backend
- Developers integrating or extending the translation pipeline

### 1.4 Scope
- **In Scope (V1.0):**
  - RESTful API for document chunk translation
  - LLM integration via OpenAI-compatible API protocol
  - Tag preservation validation
  - Exponential backoff retry (up to 3 attempts)
  - Degraded fallback mode (plain text on tag loss)
  - Context passing for terminology consistency
  - Health check endpoint
- **Out of Scope (V1.0):**
  - User authentication / authorization
  - Rate limiting by API key
  - Persistent logging or analytics database
  - Multi-language support (other than Chinese to English)
  - WebSocket or streaming responses
  - Admin dashboard

---

## 2. User Stories

### 2.1 Primary User Story
> As a WPS translation add-in, I want to send chunks of tagged Chinese text to a backend service and receive accurately translated English text with all formatting tags preserved, so that the client can reconstruct the document with formatting intact.

### 2.2 Detailed User Stories

| ID | User Story | Priority |
|---|---|---|
| US-BE-01 | As a client, I want to send a batch of paragraphs and receive translations in one request so that network overhead is minimized. | P0 |
| US-BE-02 | As a client, I want the backend to validate that all tags are preserved so that format loss is detected immediately. | P0 |
| US-BE-03 | As a client, I want the backend to retry automatically if tags are lost so that transient LLM errors are recovered. | P0 |
| US-BE-04 | As a client, I want to receive plain text as a fallback if tags cannot be preserved after retries so that the document still gets translated. | P0 |
| US-BE-05 | As a client, I want to pass previous translation context so that terminology stays consistent across chunks. | P1 |
| US-BE-06 | As an operator, I want a health check endpoint so that I can monitor service availability. | P1 |
| US-BE-07 | As an operator, I want to configure the LLM model, API key, and base URL via environment variables so that deployment is flexible. | P0 |

---

## 3. Functional Requirements

### 3.1 API Endpoints (FR-API)

| ID | Requirement | Priority |
|---|---|---|
| FR-API-01 | The server shall expose `POST /api/v1/translate/document-chunk` for translation requests. | P0 |
| FR-API-02 | The server shall expose `GET /api/health` for health monitoring. | P1 |
| FR-API-03 | The server shall parse JSON request bodies up to 10MB. | P0 |
| FR-API-04 | The server shall enable CORS for all origins. | P0 |
| FR-API-05 | The server shall return structured JSON responses with `status`, `chunkIndex`, and `results`. | P0 |
| FR-API-06 | The server shall return HTTP 400 for invalid request bodies (missing/empty payload). | P0 |
| FR-API-07 | The server shall return HTTP 500 for internal errors with an error message. | P0 |

### 3.2 Translation Processing (FR-TRANSLATE)

| ID | Requirement | Priority |
|---|---|---|
| FR-TRANSLATE-01 | The server shall process each paragraph in the payload sequentially. | P0 |
| FR-TRANSLATE-02 | The server shall construct a system prompt that instructs the LLM to preserve XML-like tags (`<r1>`, `<r2>`, etc.). | P0 |
| FR-TRANSLATE-03 | The server shall include user context from previous translations in the prompt when provided. | P1 |
| FR-TRANSLATE-04 | The server shall call the LLM with `temperature: 0.3` and `max_tokens: 4096`. | P0 |
| FR-TRANSLATE-05 | The server shall extract the translated text from the LLM response and trim whitespace. | P0 |

### 3.3 Tag Validation (FR-VALIDATE)

| ID | Requirement | Priority |
|---|---|---|
| FR-VALIDATE-01 | After each translation, the server shall check that all opening tags (`<rN>`) from the source text exist in the translated text. | P0 |
| FR-VALIDATE-02 | After each translation, the server shall check that all closing tags (`</rN>`) from the source text exist in the translated text. | P0 |
| FR-VALIDATE-03 | If the source text has no tags, validation shall pass automatically. | P0 |

### 3.4 Retry & Degraded Mode (FR-RETRY)

| ID | Requirement | Priority |
|---|---|---|
| FR-RETRY-01 | If tag validation fails, the server shall retry the translation with a stricter prompt that names the missing tags. | P0 |
| FR-RETRY-02 | The server shall wait with exponential backoff between retries: 2s, 4s, etc. | P0 |
| FR-RETRY-03 | The server shall attempt a maximum of 3 retries (configurable via `MAX_RETRIES`). | P0 |
| FR-RETRY-04 | If all retries are exhausted and tags are still missing, the server shall strip all tags and return plain text. | P0 |
| FR-RETRY-05 | If the LLM API throws an error (timeout, network, etc.), the server shall retry with the same backoff strategy. | P0 |
| FR-RETRY-06 | If all retries fail and no translation was produced, the server shall return the original text with tags stripped. | P0 |
| FR-RETRY-07 | The response shall indicate whether degraded mode was used via the `tagValidation` boolean field. | P0 |

### 3.5 Context Management (FR-CONTEXT)

| ID | Requirement | Priority |
|---|---|---|
| FR-CONTEXT-01 | The server shall accept a `context` string in the request body. | P1 |
| FR-CONTEXT-02 | The server shall prepend the context to the user prompt with instructions that it is for reference only. | P1 |

---

## 4. Non-Functional Requirements

### 4.1 Performance

| ID | Requirement | Target |
|---|---|---|
| NFR-PERF-01 | Health check endpoint shall respond within 50ms. | < 50ms |
| NFR-PERF-02 | Translation endpoint shall acknowledge requests immediately (before LLM call). | < 100ms |
| NFR-PERF-03 | The server shall not block the event loop during LLM calls (async/await). | Must |
| NFR-PERF-04 | Each chunk should complete within 30 seconds (depends on LLM latency). | < 30s |

### 4.2 Reliability

| ID | Requirement |
|---|---|
| NFR-REL-01 | The server shall handle LLM API timeouts gracefully via retry logic. |
| NFR-REL-02 | A failure in one paragraph shall not prevent other paragraphs in the same chunk from being processed. |
| NFR-REL-03 | The server shall not crash on malformed JSON requests; it shall return 400 Bad Request. |
| NFR-REL-04 | The server shall log all errors and warnings to the console for debugging. |

### 4.3 Scalability

| ID | Requirement |
|---|---|
| NFR-SCALE-01 | The server is stateless; any request can be handled by any instance. |
| NFR-SCALE-02 | Document state (chunk index, context) is managed by the client, not the server. |

### 4.4 Security

| ID | Requirement |
|---|---|
| NFR-SEC-01 | The LLM API key shall be stored only in environment variables, never in source code. |
| NFR-SEC-02 | The server shall not log the full request payload at info level (may log at debug level). |
| NFR-SEC-03 | CORS is enabled for all origins; in production, this may need restriction. |

### 4.5 Observability

| ID | Requirement |
|---|---|
| NFR-OBS-01 | The server shall log startup information: port, model name, base URL (without API key). |
| NFR-OBS-02 | Each translation request shall log: documentId, chunkIndex, paragraph count. |
| NFR-OBS-03 | Each retry attempt shall log: paragraphId, attempt number, delay duration. |
| NFR-OBS-04 | Tag validation failures shall log: paragraphId, attempt, missing tag list. |
| NFR-OBS-05 | Degraded mode activations shall be logged as warnings. |

---

## 5. Configuration Requirements

| Config Key | Description | Default | Required |
|---|---|---|---|
| `LLM_API_KEY` | API key for the LLM service | — | Yes |
| `LLM_BASE_URL` | Base URL for OpenAI-compatible API | `https://dashscope.aliyuncs.com/compatible-mode/v1` | Yes |
| `LLM_MODEL` | Model identifier | `qwen-plus` | No |
| `PORT` | HTTP server port | `3000` | No |
| `MAX_RETRIES` | Maximum retry attempts per paragraph | `3` | No |
| `MAX_CHUNK_CHARS` | Character limit for client chunking (informational) | `1500` | No |

---

## 6. Error Handling Requirements

| Error Scenario | HTTP Status | Response Body | Log Level |
|---|---|---|---|
| Missing/empty payload | 400 | `{ status: "error", message: "Missing or empty payload array." }` | warn |
| LLM API timeout | 500 | `{ status: "error", message: "Translation failed" }` | error |
| LLM returns empty | 500 | Same as above | error |
| Tag loss after all retries | 200 | `{ status: "success", results: [{ ..., tagValidation: false }] }` | warn |
| Unexpected exception | 500 | `{ status: "error", message: err.message }` | error |

---

## 7. Glossary

| Term | Definition |
|---|---|
| OpenAI-compatible API | An API that follows the OpenAI chat completions protocol (used by Qwen, Claude, etc.) |
| Tag / Format Tag | XML-like placeholder (e.g., `<r1>text</r1>`) representing formatting in the source text |
| Chunk | A batch of paragraphs sent in a single HTTP request |
| Degraded Mode | Fallback where tags are stripped and only plain text translation is returned |
| Exponential Backoff | Retry delay strategy: wait 2^n seconds between attempts |
| System Prompt | Instructions given to the LLM defining its role and rules |
| Context | Previous translation text appended to maintain terminology consistency |
