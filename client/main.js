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
