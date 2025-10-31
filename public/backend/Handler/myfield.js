import { db } from "../Common/firebase-config.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js";

const backBtn = document.getElementById("btnBackToFields");
const titleEl = document.getElementById("myFieldTitle");
const detailsEl = document.getElementById("myFieldDetails");

backBtn.addEventListener("click", () => {
  window.location.href = "Fields.html";
});

const fieldId = localStorage.getItem("selectedFieldId");
const fieldData = JSON.parse(localStorage.getItem("selectedFieldData") || "{}");

if (!fieldId) {
  titleEl.textContent = "No field selected";
  detailsEl.innerHTML = `<p class="text-red-600">⚠️ Please go back to "My Fields" and select one.</p>`;
} else {
  titleEl.textContent = fieldData.field_name || "Unnamed Field";
  detailsEl.innerHTML = `
    <div><strong>Location:</strong> ${fieldData.location || "N/A"}</div>
    <div><strong>Area:</strong> ${fieldData.area || "N/A"} ha</div>
    <div><strong>Status:</strong> ${fieldData.status || "Pending"}</div>
    <div><strong>Owner:</strong> ${fieldData.owner_name || "N/A"}</div>
    <div><strong>Date Registered:</strong> ${fieldData.date_registered || "N/A"}</div>
    <div class="mt-3 text-sm text-gray-500">Fetching latest data...</div>
  `;

  if (fieldData.userId) {
    const docRef = doc(db, "field_applications", fieldData.userId, "fields", fieldId);
    getDoc(docRef).then((snap) => {
      if (snap.exists()) {
        const data = snap.data();
        detailsEl.innerHTML = `
          <div><strong>Field Name:</strong> ${data.field_name || "N/A"}</div>
          <div><strong>Barangay:</strong> ${data.barangay || "N/A"}</div>
          <div><strong>Area:</strong> ${data.area || "N/A"} ha</div>
          <div><strong>Crop Type:</strong> ${data.crop_type || "N/A"}</div>
          <div><strong>Status:</strong> ${data.status || "Pending"}</div>
          <div><strong>Date Registered:</strong> ${data.created_at || "N/A"}</div>
        `;
      } else {
        detailsEl.innerHTML = `<p class="text-red-600">Field not found in database.</p>`;
      }
    });
  }
}
