import { auth, db } from '../Common/firebase-config.js';
import { showConfirm, showPopupMessage } from '../Common/ui-popup.js';
import { getDocs, collection, doc, updateDoc, deleteDoc, onSnapshot } 
  from "https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js";
import { setDoc, addDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js";

// 🔔 Handle role revert + notification when driver badge is deleted
async function handleDriverBadgeDeletion(deletedUserId) {
  try {
    const adminName = localStorage.getItem("adminName") || "System Admin";

    // 1️⃣ Revert role to farmer
    await updateDoc(doc(db, "users", deletedUserId), { role: "farmer" });

    // 2️⃣ Send notification to user
    await addDoc(collection(db, "notifications"), {
      userId: deletedUserId,
      title: "Driver Badge Deleted",
      message: `Your Driver Badge has been deleted by ${adminName}. Your role has been reverted to Farmer.`,
      status: "unread",
      timestamp: serverTimestamp(),
    });

    console.log(`✅ Role reverted & notification sent to user ${deletedUserId}`);
  } catch (err) {
    console.error("⚠️ Error handling badge deletion:", err);
  }
}

const requestsContainer = document.getElementById("requestsContainer");
const loading = document.getElementById("loading");
const modal = document.getElementById("detailsModal");
const modalBody = document.getElementById("modalBody");
const filterButtons = document.querySelectorAll(".filter-btn");
let allRequests = [];

// FETCH DRIVER BADGE REQUESTS (REAL-TIME)
function fetchBadgeRequestsRealtime() {
  const q = collection(db, "Drivers_Badge");

  // Listen to all live changes — resubmits, new requests, updates
  onSnapshot(q, (snapshot) => {
    allRequests = snapshot.docs.map(docSnap => ({
      id: docSnap.id,
      ...docSnap.data(),
    }));

    displayRequests(allRequests);
    loading.style.display = "none";
  }, (error) => {
    console.error("Error fetching badge requests:", error);
  });
}


async function updateStatus(id, newStatus) {
  try {
    const badgeRef = doc(db, "Drivers_Badge", id);
    await updateDoc(badgeRef, { status: newStatus });

    // 🔹 Get driver info for notification (we already have it in allRequests)
    const req = allRequests.find(r => r.id === id);
    const driverUID = req?.uid || req?.id; // use req.uid if you store it, else req.id

    // 🔹 Update role based on status
    const userRef = doc(db, "users", id);
    if (newStatus === "approved") await updateDoc(userRef, { role: "driver" });
    if (newStatus === "rejected") await updateDoc(userRef, { role: "farmer" });

    // 📨 Create Notification
    const notifId = crypto.randomUUID();
    await setDoc(doc(db, "notifications", notifId), {
      userId: driverUID,
      title: "Driver Badge Application Update",
      message:
        newStatus === "approved"
          ? `Congratulations! Your Driver Badge has been approved by the System Admin. 
            You can now <a href='../../frontend/Driver/Driver_Dashboard.html' 
            style='color: var(--cane-700); text-decoration: underline;'>check your dashboard</a>.`
          : `We’re sorry, but your Driver Badge request was rejected. Please review your information and resubmit your application. 
              Click <a href='../../frontend/Driver/Driver_Badge.html' 
              style='color: var(--cane-700); font-weight: 500; text-decoration: underline;'>here</a> to update your Driver Badge form.`,
      status: "unread",
      timestamp: serverTimestamp(),
    });

    // 🔹 Update UI locally
    allRequests = allRequests.map(r =>
      r.id === id ? { ...r, status: newStatus } : r
    );
    displayRequests(allRequests);
    modal.classList.remove("active");

    showPopupLocal({ title: 'Request Updated', message: `Request ${newStatus} successfully! Notification sent to driver.`, type: 'success', closeText: 'OK' });
  } catch (error) {
    console.error("Error updating status or sending notification:", error);
    showPopupLocal({ title: 'Update Failed', message: 'Something went wrong while updating status or sending notification.', type: 'error', closeText: 'OK' });
  }
}

// 🔴 DELETE REQUEST
// Local popup helper (keeps behavior self-contained in this module)
function showPopupLocal({ title = 'Notice', message = '', type = 'info', closeText = 'Close' } = {}) {
  const existing = document.getElementById('badgePopupAlert');
  if (existing) existing.remove();

  const overlay = document.createElement('div');
  overlay.id = 'badgePopupAlert';
  overlay.className = 'fixed inset-0 flex items-center justify-center z-50 bg-black bg-opacity-40 backdrop-blur-sm';
  const colors = { success: 'bg-green-600', error: 'bg-red-600', warning: 'bg-yellow-500', info: 'bg-blue-600' };

  overlay.innerHTML = `
    <div class="bg-white rounded-2xl shadow-2xl p-6 text-center max-w-md w-full mx-4 animate-fadeIn">
      <div class="text-4xl mb-3">${type === 'success' ? '✅' : type === 'error' ? '❌' : type === 'warning' ? '⚠️' : 'ℹ️'}</div>
      <h3 class="text-lg font-semibold text-gray-800 mb-2">${title}</h3>
      <div class="text-gray-600 mb-4 text-sm">${message}</div>
      <button id="badgePopupCloseBtn" class="px-5 py-2 rounded-lg text-white font-medium ${colors[type]}">${closeText}</button>
    </div>
  `;

  document.body.appendChild(overlay);
  document.getElementById('badgePopupCloseBtn').addEventListener('click', () => overlay.remove());
}

// Custom confirmation modal for deleting badge requests
function confirmDeleteRequest(id, name = '') {
  const existing = document.getElementById('confirmDeleteBadgeModal');
  if (existing) existing.remove();

  const overlay = document.createElement('div');
  overlay.id = 'confirmDeleteBadgeModal';
  overlay.className = 'fixed inset-0 flex items-center justify-center bg-black bg-opacity-40 backdrop-blur-sm z-50';

  overlay.innerHTML = `
    <div class="bg-white rounded-2xl shadow-2xl w-[90%] max-w-lg p-6 text-gray-800 animate-fadeIn">
      <h2 class="text-xl font-bold mb-2 text-gray-900">Delete Driver Badge Request</h2>
      <p class="text-sm text-gray-600 mb-4">You are about to permanently delete the driver badge request ${name ? '<b>' + name + '</b>' : ''}. This action cannot be undone.</p>
      <div class="flex items-start gap-2 mb-4">
        <input type="checkbox" id="badgeConfirmCheck" class="mt-1 accent-[var(--cane-600)]" />
        <label for="badgeConfirmCheck" class="text-gray-600 text-sm leading-snug">I understand this action is permanent and I want to proceed.</label>
      </div>
      <div class="flex justify-end gap-3">
        <button id="badgeCancelBtn" class="px-4 py-2 rounded-lg bg-gray-200 hover:bg-gray-300">Cancel</button>
        <button id="badgeConfirmBtn" class="px-4 py-2 rounded-lg bg-red-600 text-white hover:bg-red-700">Delete Permanently</button>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);

  document.getElementById('badgeCancelBtn').addEventListener('click', () => overlay.remove());

  document.getElementById('badgeConfirmBtn').addEventListener('click', async () => {
    const checked = document.getElementById('badgeConfirmCheck').checked;
    if (!checked) {
      // small inline warning
      const warn = document.createElement('div');
      warn.className = 'text-sm text-red-600 mt-3';
      warn.textContent = 'Please confirm the checkbox to proceed.';
      overlay.querySelector('div').appendChild(warn);
      setTimeout(() => warn.remove(), 2500);
      return;
    }

    // close modal
    overlay.remove();

    // show processing popup
    showPopupLocal({ title: 'Processing Deletion...', message: 'Deleting driver badge request. Please wait...', type: 'info', closeText: 'Close' });

    try {
      await deleteDoc(doc(db, 'Drivers_Badge', id));
      await handleDriverBadgeDeletion(id);
      // update local cache and UI
      allRequests = allRequests.filter(r => r.id !== id);
      displayRequests(allRequests);

      // replace processing popup with success
      const p = document.getElementById('badgePopupAlert'); if (p) p.remove();
      showPopupLocal({ title: 'Deleted', message: 'Driver Badge request deleted successfully.', type: 'success', closeText: 'OK' });
    } catch (err) {
      console.error('Error deleting badge request:', err);
      const p = document.getElementById('badgePopupAlert'); if (p) p.remove();
      showPopupLocal({ title: 'Deletion Failed', message: 'Failed to delete the request. Please try again later.', type: 'error', closeText: 'OK' });
    }
  });
}

// Replace deleteRequest to show our custom modal
async function deleteRequest(id) {
  // find name for UI context
  const req = allRequests.find(r => r.id === id) || {};
  confirmDeleteRequest(id, req.fullname || req.email || '');
}

// 🧱 DISPLAY REQUEST CARDS
function displayRequests(requests) {
  requestsContainer.innerHTML = "";
  if (requests.length === 0) {
    requestsContainer.innerHTML = '<p class="text-center text-gray-500 mt-10">No badge requests found.</p>';
    return;
  }

  requests.forEach(req => {
    const card = document.createElement("div");
    card.className = "card";

    const statusClass =
      req.status === "approved" ? "status-approved" :
      req.status === "rejected" ? "status-rejected" : "status-pending";

    card.innerHTML = `
      <div class="flex flex-col md:flex-row justify-between items-start md:items-center gap-3">
        <div>
          <h2 class="text-xl font-semibold text-[var(--cane-900)]">${req.fullname || 'No name'}</h2>
          <p class="text-sm text-gray-500">${req.email || ''}</p>
          <p class="text-sm text-gray-500">${req.contact_number || ''}</p>
          <p class="text-sm text-gray-500">${req.address || ''}</p>
        </div>
        <div class="flex items-center gap-2">
          <span class="status-badge ${statusClass} capitalize">${req.status || 'pending'}</span>

          <!-- ✅ Keep original See Details button -->
          <button class="see-details-btn px-4 py-2 bg-[var(--cane-500)] hover:bg-[var(--cane-700)] text-white rounded-lg text-sm" data-id="${req.id}">
            See Details
          </button>

          <!-- 🔴 Delete button -->
          <button class="delete-btn px-3 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm" data-id="${req.id}">
            <i class="fa fa-trash"></i>
          </button>
        </div>
      </div>
    `;
    requestsContainer.appendChild(card);
  });

  document.querySelectorAll(".see-details-btn").forEach(btn => {
    btn.addEventListener("click", () => openModal(btn.dataset.id));
  });

  document.querySelectorAll(".delete-btn").forEach(btn => {
    btn.addEventListener("click", () => deleteRequest(btn.dataset.id));
  });
}

// 🪟 MODAL DETAILS
function openModal(id) {
  const req = allRequests.find(r => r.id === id);
  if (!req) return;

  modalBody.innerHTML = `
    <button id="closeModalFixed" class="fixed top-5 right-5 text-gray-500 hover:text-gray-800 text-2xl z-50">&times;</button>
    <h2 class="text-2xl font-bold text-[var(--cane-900)] mb-4">${req.fullname}</h2>

    <div class="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm text-gray-600 mb-6">
      <div><strong>Email:</strong> ${req.email || 'N/A'}</div>
      <div><strong>Contact #:</strong> ${req.contact_number || 'N/A'}</div>
      <div><strong>Address:</strong> ${req.address || 'N/A'}</div>
      <div><strong>Birth Date:</strong> ${req.birth_date || 'N/A'}</div>
      <div><strong>License #:</strong> ${req.license_number || 'N/A'}</div>
      <div><strong>License Expiry:</strong> ${req.license_expiry || 'N/A'}</div>
      <div><strong>Vehicle Type:</strong> ${req.vehicle_types?.join(', ') || 'N/A'}</div>
      <div><strong>Plate #:</strong> ${req.plate_number || 'N/A'}</div>
      <div><strong>Vehicle Model:</strong> ${req.vehicle_model || 'N/A'}</div>
      <div><strong>Vehicle Year:</strong> ${req.vehicle_year || 'N/A'}</div>
      <div><strong>Vehicle Color:</strong> ${req.vehicle_color || 'N/A'}</div>
    </div>

    <h3 class="font-semibold text-[var(--cane-700)] mb-2">Uploaded Images:</h3>
    <div class="image-grid mb-6">
      ${req.photo_data ? `<div><p class='text-xs text-gray-500 mb-1'>Driver Photo</p><img src="${req.photo_data}" alt="Driver Photo" class="clickable-image rounded-md border border-gray-200"></div>` : ''}
      ${req.license_front_data ? `<div><p class='text-xs text-gray-500 mb-1'>License Front</p><img src="${req.license_front_data}" alt="License Front" class="clickable-image rounded-md border border-gray-200"></div>` : ''}
      ${req.license_back_data ? `<div><p class='text-xs text-gray-500 mb-1'>License Back</p><img src="${req.license_back_data}" alt="License Back" class="clickable-image rounded-md border border-gray-200"></div>` : ''}
      ${req.vehicle_or_data ? `<div><p class='text-xs text-gray-500 mb-1'>Vehicle OR</p><img src="${req.vehicle_or_data}" alt="Vehicle OR" class="clickable-image rounded-md border border-gray-200"></div>` : ''}
    </div>

    <div class="flex gap-3 mt-5">
      <button class="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg" id="approveBtn">
        <i class="fa fa-check mr-1"></i> Approve
      </button>
      <button class="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg" id="rejectBtn">
        <i class="fa fa-times mr-1"></i> Reject
      </button>
    </div>
  `;

  // 🔹 Attach Approve/Reject logic (use modern confirm popup)
  document.getElementById("approveBtn").addEventListener("click", async () => {
    const ok = await showConfirm('Are you sure you want to approve this request?');
    if (ok) updateStatus(req.id, 'approved');
  });
  document.getElementById("rejectBtn").addEventListener("click", async () => {
    const ok = await showConfirm('Are you sure you want to reject this request?');
    if (ok) updateStatus(req.id, 'rejected');
  });

  // 🔹 Close modal
  document.getElementById("closeModalFixed").addEventListener("click", () => modal.classList.remove("active"));
  modal.classList.add("active");
}

// 🔹 Close modal when clicking outside
modal.addEventListener("click", e => {
  if (e.target === modal) modal.classList.remove("active");
});

// 🔹 Filter buttons
filterButtons.forEach(btn => {
  btn.addEventListener("click", () => {
    filterButtons.forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    const status = btn.getAttribute("data-status");
    if (status === "all") displayRequests(allRequests);
    else displayRequests(allRequests.filter(r => (r.status || "pending") === status));
  });
});


document.addEventListener("click", (e) => {
  const img = e.target.closest(".clickable-image");
  if (!img) return;

  const overlay = document.createElement("div");
  overlay.className = "full-size-img-modal";
  overlay.innerHTML = `
    <button id="closeFullImage"><i class="fas fa-times"></i></button>
    <img src="${img.src}" alt="Full Image">
  `;
  document.body.appendChild(overlay);

  // Close on click outside or ❌
  overlay.addEventListener("click", (ev) => {
    if (ev.target === overlay || ev.target.id === "closeFullImage" || ev.target.closest("#closeFullImage")) {
      overlay.remove();
    }
  });
});

// 🟢 FETCH ON LOAD (REAL-TIME LISTENER)
fetchBadgeRequestsRealtime();

// Expose functions globally so other modules can refresh or invoke deletes
window.fetchBadgeRequests = fetchBadgeRequestsRealtime;
window.deleteBadgeRequest = deleteRequest;
// expose popup and confirm helper for reuse
window.showPopupLocal = showPopupLocal;
window.confirmDeleteRequest = confirmDeleteRequest;
