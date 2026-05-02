# Post-Translation UX Updates Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Refine the post-translation interaction to allow continuous translation of new pages and change the aggressive "Undo All" to "Undo Last Step".

**Architecture:** We will update the DOM visibility toggles in `showCompletionResult` to ensure the translation action buttons reappear after translation finishes. We will also update the i18n dictionary and the undo logic in `client/util.js` and `client/taskpane.js`.

**Tech Stack:** Vanilla JavaScript (ES5 compatible), HTML, CSS.

---

### Task 1: Update Undo Logic and Visibility States

**Files:**
- Modify: `client/taskpane.js`

**Step 1: Update undo logic**
In `client/taskpane.js`, find `onUndoTranslation` and change `doc.Undo(999);` to `doc.Undo(1);`.

**Step 2: Update UI state on undo**
In `onUndoTranslation`, the UI is reset to idle. Ensure `showElement("startButtonsContainer")` is called (it already is).

**Step 3: Show translation buttons on completion**
In `client/taskpane.js`, find `showCompletionResult(count)`. Add `showElement("startButtonsContainer");` to the list of elements shown.

**Step 4: Commit**
```bash
git add client/taskpane.js
git commit -m "feat(ux): re-show start buttons on completion and change undo limit to 1"
```

### Task 2: Update i18n Dictionary

**Files:**
- Modify: `client/util.js`

**Step 1: Update text**
In `client/util.js`, update `i18nDict`:
- `en.btnUndo`: `"Undo All"` -> `"Undo Last Step"`
- `zh.btnUndo`: `"撤销全部"` -> `"撤销上一步"`

**Step 2: Commit**
```bash
git add client/util.js
git commit -m "feat(i18n): update undo button text"
```
