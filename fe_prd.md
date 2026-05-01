# Frontend PRD — WPS AI Smart Translation Add-in

## 1. Product Overview

### 1.1 Product Name
WPS AI Smart Translation Add-in (V1.0 MVP)

### 1.2 Product Description
A WPS Web Add-in that provides one-click full-document Chinese-to-English translation. The core value proposition is leveraging Large Language Models (LLM) to deliver human-editor-level translation quality while precisely preserving inline rich-text formatting — including bold, italic, color, underline, strikethrough, and hyperlinks — without breaking the original document layout.

### 1.3 Target Users
- Business professionals who need to translate Chinese documents to English
- Legal and contract reviewers requiring format-preserved translations
- Content creators and editors working with bilingual documents
- Anyone using WPS Office who needs high-quality AI translation

### 1.4 Scope
- **In Scope (V1.0):**
  - Pure text paragraphs in the main document body
  - Format preservation for bold, italic, color, underline, strikethrough
  - Progress tracking and cancellation
  - Undo functionality
  - Chunked translation for long documents
- **Out of Scope (V1.0):**
  - Tables, headers, footers, floating objects
  - Formulas, embedded images, charts
  - Translation directions other than Chinese to English
  - Offline mode

---

## 2. User Stories

### 2.1 Primary User Story
> As a WPS user, I want to translate my entire Chinese document to English with one click, so that the translated document retains all original formatting (bold, colors, etc.) and I can review or undo the changes if needed.

### 2.2 Detailed User Stories

| ID | User Story | Priority |
|---|---|---|
| US-01 | As a user, I want to initiate translation from the WPS ribbon menu so that the process is easily accessible. | P0 |
| US-02 | As a user, I want to see a task pane with translation controls so that I can configure and monitor the process. | P0 |
| US-03 | As a user, I want to configure the backend server URL so that I can connect to my own translation service. | P0 |
| US-04 | As a user, I want to see real-time progress (percentage and paragraph count) so that I know how much is done. | P0 |
| US-05 | As a user, I want to cancel an ongoing translation so that I can stop it if I made a mistake. | P0 |
| US-06 | As a user, I want to undo all translation changes so that I can revert to the original document. | P0 |
| US-07 | As a user, I want formatted text (bold, italic, color) to remain formatted after translation so that I don't need to reformat manually. | P0 |
| US-08 | As a user, I want to see clear error messages if something goes wrong so that I know what happened and how to fix it. | P1 |
| US-09 | As a user, I want long documents to be processed in chunks automatically so that the system doesn't freeze or timeout. | P1 |
| US-10 | As a user, I want paragraphs inside tables and headers to be skipped gracefully so that the document structure isn't corrupted. | P1 |

---

## 3. Functional Requirements

### 3.1 Ribbon Integration (FR-RIBBON)

| ID | Requirement | Priority |
|---|---|---|
| FR-RIBBON-01 | The add-in shall register a new tab labeled "AI Translation" in the WPS ribbon. | P0 |
| FR-RIBBON-02 | The tab shall contain a group labeled "Translation" with a large button "Translate Full Document". | P0 |
| FR-RIBBON-03 | Clicking the button shall open or reveal the task pane on the right side of the document. | P0 |
| FR-RIBBON-04 | The button shall display a tooltip explaining the function. | P1 |

### 3.2 Task Pane UI (FR-UI)

| ID | Requirement | Priority |
|---|---|---|
| FR-UI-01 | The task pane shall display a header with the product name and icon. | P0 |
| FR-UI-02 | The task pane shall show the translation direction (Chinese → English). | P0 |
| FR-UI-03 | The task pane shall provide an input field for the backend server URL (default: `http://localhost:3000`). | P0 |
| FR-UI-04 | The task pane shall have a primary "Translate Full Document" button to start translation. | P0 |
| FR-UI-05 | During translation, a progress bar with percentage and paragraph counter shall be visible. | P0 |
| FR-UI-06 | A status detail text shall display the current operation (e.g., "Translating chunk 2/5..."). | P1 |
| FR-UI-07 | A "Cancel" button shall be available during translation. | P0 |
| FR-UI-08 | An "Undo All" button shall be available after translation completes or fails. | P0 |
| FR-UI-09 | A success summary shall display the number of translated paragraphs upon completion. | P1 |
| FR-UI-10 | An error section shall display error messages in a visually distinct style. | P1 |

### 3.3 Translation Workflow (FR-WORKFLOW)

| ID | Requirement | Priority |
|---|---|---|
| FR-WORKFLOW-01 | On start, the system shall scan the document and count total paragraphs. | P0 |
| FR-WORKFLOW-02 | The system shall skip paragraphs that are: empty/whitespace-only, inside tables, in headers/footers, or have non-main story type. | P0 |
| FR-WORKFLOW-03 | The system shall serialize each translatable paragraph's formatting into tagged strings and a style dictionary. | P0 |
| FR-WORKFLOW-04 | The system shall group paragraphs into chunks based on a maximum character limit (default 1500 chars). | P0 |
| FR-WORKFLOW-05 | The system shall send each chunk to the backend via HTTP POST sequentially. | P0 |
| FR-WORKFLOW-06 | The system shall pass the previous chunk's translation as context for terminology consistency. | P1 |
| FR-WORKFLOW-07 | Upon receiving translated results, the system shall write the English text back to each paragraph and re-apply the original formatting. | P0 |
| FR-WORKFLOW-08 | The system shall update the progress bar after each paragraph is written. | P0 |
| FR-WORKFLOW-09 | If a chunk fails, the system shall log the error, display it to the user, and continue with the next chunk. | P1 |
| FR-WORKFLOW-10 | If tag validation fails for a paragraph (backend degraded mode), the system shall write plain text without formatting. | P1 |

### 3.4 Format Preservation (FR-FORMAT)

| ID | Requirement | Priority |
|---|---|---|
| FR-FORMAT-01 | The system shall detect and preserve **Bold** formatting. | P0 |
| FR-FORMAT-02 | The system shall detect and preserve **Italic** formatting. | P0 |
| FR-FORMAT-03 | The system shall detect and preserve **Underline** formatting. | P0 |
| FR-FORMAT-04 | The system shall detect and preserve **Font Color** formatting. | P0 |
| FR-FORMAT-05 | The system shall detect and preserve **Strikethrough** formatting. | P1 |
| FR-FORMAT-06 | The system shall handle multiple format combinations on the same text run. | P0 |
| FR-FORMAT-07 | The system shall use unique placeholder tags (e.g., `<r1>`, `<r2>`) to mark formatted runs. | P0 |

### 3.5 Cancellation & Undo (FR-CONTROL)

| ID | Requirement | Priority |
|---|---|---|
| FR-CONTROL-01 | The user shall be able to cancel translation at any time via the Cancel button. | P0 |
| FR-CONTROL-02 | Upon cancellation, the system shall stop processing new chunks immediately. | P0 |
| FR-CONTROL-03 | The user shall be able to undo all translation changes via the Undo All button. | P0 |
| FR-CONTROL-04 | Undo shall restore the document to its state before translation started. | P0 |

---

## 4. Non-Functional Requirements

### 4.1 Performance

| ID | Requirement | Target |
|---|---|---|
| NFR-PERF-01 | UI shall respond to user interactions within 100ms. | < 100ms |
| NFR-PERF-02 | Document scanning for a 100-paragraph document shall complete within 2 seconds. | < 2s |
| NFR-PERF-03 | Paragraph serialization shall process at least 50 paragraphs per second. | > 50/s |
| NFR-PERF-04 | The task pane shall not block the WPS main thread during translation. | Must |

### 4.2 Compatibility

| ID | Requirement |
|---|---|
| NFR-COMP-01 | The add-in shall work with WPS Office Windows desktop version supporting Web Add-ins. |
| NFR-COMP-02 | The add-in shall use standard WPS JSAPI for document manipulation. |
| NFR-COMP-03 | The add-in shall gracefully handle WPS API unavailability or version differences. |

### 4.3 Reliability

| ID | Requirement |
|---|---|
| NFR-REL-01 | The add-in shall not crash or corrupt the document if the backend is unreachable. |
| NFR-REL-02 | Serialization errors on a single paragraph shall fall back to plain text for that paragraph only. |
| NFR-REL-03 | Deserialization errors on a single paragraph shall not affect other paragraphs. |
| NFR-REL-04 | The system shall handle documents with 0 translatable paragraphs gracefully. |

### 4.4 Security

| ID | Requirement |
|---|---|
| NFR-SEC-01 | The add-in shall not persist document content locally or to third parties other than the configured backend. |
| NFR-SEC-02 | The backend URL input shall accept any valid HTTP/HTTPS URL. |

---

## 5. UI/UX Requirements

### 5.1 Visual Design
- Clean, modern interface matching WPS Office aesthetic
- Primary color: `#1a73e8` (blue)
- Success color: `#059669` (green)
- Error color: `#dc2626` (red)
- Background: `#f9fafb` (light gray)
- Card/section background: `#ffffff` (white)
- Border radius: 6–8px for buttons and cards
- Font: System font stack (`-apple-system`, `Segoe UI`, `PingFang SC`, etc.)

### 5.2 Interaction Design
- Buttons shall have hover states with subtle color changes
- Primary button shall be full-width and visually prominent
- Progress bar shall use smooth width transitions (0.3s ease)
- Error messages shall appear immediately below the relevant section
- Hidden sections shall use CSS `display: none` with a `.hidden` utility class

### 5.3 Responsive Behavior
- Task pane width is fixed at 380px (docked to the right)
- Content shall adapt within this fixed width without horizontal scroll

---

## 6. Error Handling Requirements

| Error Scenario | User-Facing Behavior | Recovery Action |
|---|---|---|
| No active document | Show error: "No active document. Please open a document first." | User opens a document |
| No translatable paragraphs | Show error: "No translatable paragraphs found in the document." | User checks document content |
| Backend unreachable | Show error: "Network error on chunk X: [message]" | Continue to next chunk; user can retry |
| Backend returns error | Show error: "Backend error on chunk X" | Continue to next chunk |
| Serialization fails | Log to console; fallback to plain text for that paragraph | Continue with other paragraphs |
| Deserialization fails | Log warning; skip formatting for that paragraph | Continue with other paragraphs |
| Translation cancelled | Update UI to cancelled state; show partial results | User can restart |

---

## 7. Glossary

| Term | Definition |
|---|---|
| WPS Web Add-in | A plugin for WPS Office built with HTML/CSS/JS |
| Task Pane | A side panel in WPS that hosts the add-in UI |
| Ribbon | The top toolbar/menu bar in WPS Office |
| Serialization | Converting WPS paragraph formatting into tagged strings |
| Deserialization | Writing translated text back and re-applying formatting |
| Chunk | A batch of paragraphs sent to the backend in one request |
| Style Dictionary | A JSON object mapping tag IDs to format properties |
| Run | A consecutive sequence of characters with identical formatting |
