/**
 * Google Apps Script for Beyond Horizon Contact Form (Works for Standalone & Bound scripts)
 * 
 * INSTRUCTIONS TO FIX & DEPLOY:
 * 1. Go to your Apps Script tab: https://script.google.com/home/projects/1poezAj9jQ5zLf1GGjkwGaPe6N4qGRtYIVCw6rDVhcdBgqzULkvkUrmMa/edit
 * 2. Replace all code in Code.gs with this script.
 * 3. (Optional) If you have the Google Sheet URL, paste its ID into SPREADSHEET_ID below (or leave as auto-search).
 * 4. Click the Save icon (Ctrl+S).
 * 5. Click "Deploy" > "Manage deployments".
 * 6. Click the Pencil (Edit) icon next to your Active deployment.
 * 7. In the "Version" dropdown, select "New version".
 * 8. Make sure "Who has access" is set to "Anyone".
 * 9. Click "Deploy".
 */

// If your script is standalone, paste your Sheet ID from the URL (between /d/ and /edit)
// Example: https://docs.google.com/spreadsheets/d/1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms/edit -> ID is "1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms"
var SPREADSHEET_ID = ""; // Leave blank to auto-detect "Beyond Horizon Leads"

function getTargetSheet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  
  if (!ss && SPREADSHEET_ID) {
    try {
      ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    } catch (e) {}
  }
  
  if (!ss) {
    var files = DriveApp.getFilesByName("Beyond Horizon Leads");
    if (files.hasNext()) {
      ss = SpreadsheetApp.open(files.next());
    } else {
      ss = SpreadsheetApp.create("Beyond Horizon Leads");
      var newSheet = ss.getActiveSheet();
      newSheet.appendRow(["Timestamp", "Name", "Email", "Phone", "Business", "Budget", "Message"]);
    }
  }
  
  return ss.getActiveSheet();
}

function doPost(e) {
  try {
    var sheet = getTargetSheet();
    var rawData = e.postData ? e.postData.contents : "";
    var data = {};
    
    // Parse FormData or JSON
    if (e.parameter && Object.keys(e.parameter).length > 0) {
      data = e.parameter;
    } else if (rawData) {
      try {
        data = JSON.parse(rawData);
      } catch (err) {
        data = {};
      }
    }
    
    var timestamp = new Date();
    var name = data.name || data.fullname || "";
    var email = data.email || "";
    var phone = data.phone || data.phonenumber || data.mobile || "";
    var business = data.business || data.brand || "";
    var budget = data.budget || "";
    var message = data.message || data.goals || "";
    
    // Append row
    sheet.appendRow([
      timestamp,
      name,
      email,
      phone,
      business,
      budget,
      message
    ]);
    
    return ContentService
      .createTextOutput(JSON.stringify({ status: "success", message: "Form submitted successfully" }))
      .setMimeType(ContentService.MimeType.JSON);
      
  } catch (error) {
    return ContentService
      .createTextOutput(JSON.stringify({ status: "error", error: error.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

function doGet(e) {
  return ContentService
    .createTextOutput(JSON.stringify({ status: "active", message: "Beyond Horizon Contact Form Web App is running." }))
    .setMimeType(ContentService.MimeType.JSON);
}
