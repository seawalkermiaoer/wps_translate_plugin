// main.js — Ribbon controller for WPS AI Translation Add-in
// Handles ribbon lifecycle and task pane creation.

var _taskPane = null;

/**
 * Extracts the base directory URL of the add-in.
 * Used to construct the absolute URL for taskpane.html.
 *
 * @returns {string} Base URL without trailing filename
 */
function GetUrlPath() {
  var url = window.location.href;
  return url.substring(0, url.lastIndexOf("/") + 1);
}

/**
 * Called once when the add-in is loaded by WPS.
 * Stores the ribbon UI reference for later use.
 *
 * @param {object} ribbonUI - WPS ribbon UI reference
 */
function OnAddinLoad(ribbonUI) {
  window._ribbonUI = ribbonUI;
  console.log("[WPS AI Translate] Add-in loaded successfully.");
}

/**
 * Called when the user clicks "Translate Full Document" in the ribbon.
 * Creates the task pane if it doesn't exist, or reveals it if hidden.
 */
function OnTranslateClick() {
  try {
    var taskPaneUrl = GetUrlPath() + "taskpane.html";

    if (!_taskPane) {
      _taskPane = Application.CreateTaskPane(taskPaneUrl);
    }

    _taskPane.Visible = true;
    _taskPane.Width = 380;
    _taskPane.DockPosition = "right";
  } catch (e) {
    console.error("[WPS AI Translate] Failed to open task pane:", e.message || e);
  }
}

/**
 * Returns the icon image path for the ribbon button.
 * Currently returns empty string (no custom icon).
 *
 * @param {object} control - Ribbon control reference
 * @returns {string}
 */
function GetImage(control) {
  return "";
}

/**
 * Returns the localized label for ribbon controls.
 *
 * @param {object} control - Ribbon control reference
 * @returns {string} Localized label
 */
function GetRibbonLabel(control) {
  var lang = "en";
  try {
    // 2052 is the language code for Simplified Chinese in WPS/Office
    if (wps.Application.Language === 2052 || (typeof Application !== "undefined" && Application.Language === 2052)) {
      lang = "zh";
    }
  } catch (e) {}

  var dict = {
    "AITranslateTab": { en: "AI Translation", zh: "AI 智能翻译" },
    "translateGroup": { en: "Translation", zh: "翻译" },
    "btnTranslateDoc": { en: "Open Translate Plugin", zh: "打开翻译插件" }
  };

  if (dict[control.Id] && dict[control.Id][lang]) {
    return dict[control.Id][lang];
  }
  return "";
}
