import { auth, db } from '../Common/firebase-config.js';
import { getDocs, collection, doc, updateDoc, deleteDoc } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js";
import { setDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js";

const requestsContainer = document.getElementById("requestsContainer");
const loading = document.getElementById("loading");
const modal = document.getElementById("detailsModal");
const modalBody = document.getElementById("modalBody");
const filterButtons = document.querySelectorAll(".filter-btn");
let allRequests = [];

// FETCH DRIVER BADGE REQUESTS
async function fetchBadgeRequests() {
  try {
    const querySnapshot = await getDocs(collection(db, "Drivers_Badge"));
    allRequests = [];
    querySnapshot.forEach(docSnap => {
      allRequests.push({ id: docSnap.id, ...docSnap.data() });
    });
    displayRequests(allRequests);
  } catch (error) {
    console.error("Error fetching badge requests:", error);
  } finally {
    loading.style.display = "none";
  }
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
          : "We’re sorry, but your Driver Badge request was rejected. Please check your documents and try again.",
      status: "unread",
      timestamp: serverTimestamp(),
    });

    // 🔹 Update UI locally
    allRequests = allRequests.map(r =>
      r.id === id ? { ...r, status: newStatus } : r
    );
    displayRequests(allRequests);
    modal.classList.remove("active");

    alert(`✅ Request ${newStatus} successfully! Notification sent to driver.`);
  } catch (error) {
    console.error("Error updating status or sending notification:", error);
    alert("❌ Something went wrong while updating status or sending notification.");
  }
}

// 🔴 DELETE REQUEST
async function deleteRequest(id) {
  if (!confirm("⚠️ Are you sure you want to permanently delete this Driver Badge request?")) return;
  try {
    await deleteDoc(doc(db, "Drivers_Badge", id));
    allRequests = allRequests.filter(r => r.id !== id);
    displayRequests(allRequests);
    alert("🗑️ Driver Badge request deleted successfully.");
  } catch (error) {
    console.error("Error deleting document:", error);
    alert("❌ Failed to delete document.");
  }
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

  // 🔹 Attach Approve/Reject logic
  document.getElementById("approveBtn").addEventListener("click", () => {
    if (confirm("Are you sure you want to approve this request?")) updateStatus(req.id, "approved");
  });
  document.getElementById("rejectBtn").addEventListener("click", () => {
    if (confirm("Are you sure you want to reject this request?")) updateStatus(req.id, "rejected");
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

// 🟢 FETCH ON LOAD
fetchBadgeRequests();


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
