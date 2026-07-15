/**
 * Hawaii Rental Tax — lead capture endpoint (Google Apps Script)
 *
 * Setup (5 minutes):
 * 1. Create a Google Sheet named "HRT Leads" with headers in row 1:
 *    timestamp | email | form | page | utm
 * 2. Open Extensions > Apps Script, paste this file, save.
 * 3. Deploy > New deployment > Web app.
 *    - Execute as: Me
 *    - Who has access: Anyone
 * 4. Copy the web app URL into HRT_CONFIG.FORM_ENDPOINT in assets/js/main.js.
 *
 * Leads land in the sheet instantly. No third-party service, no monthly fee.
 */

function doPost(e) {
  try {
    var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheets()[0];
    var p = (e && e.parameter) || {};
    sheet.appendRow([
      new Date(),
      String(p.email || "").slice(0, 200),
      String(p.form || "").slice(0, 50),
      String(p.page || "").slice(0, 200),
      String(p.utm || "").slice(0, 500)
    ]);
    return ContentService.createTextOutput(JSON.stringify({ ok: true }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ ok: false }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}
