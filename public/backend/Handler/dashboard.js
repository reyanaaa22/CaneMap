// =============================
// Handler Dashboard Script
// =============================
import { auth, db } from "../Common/firebase-config.js";
import {
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/12.1.0/firebase-auth.js";
import { doc, getDoc, collection, query, where, getDocs, updateDoc } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js";
import { collectionGroup } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js";

// =============================
// 🟢 Fetch Logged-in User and Display Info
// =============================
async function loadUserProfile(user) {
  try {
    const userRef = doc(db, "users", user.uid);
    const userSnap = await getDoc(userRef);

    if (userSnap.exists()) {
      const userData = userSnap.data();

      const displayName = userData.name || "Unnamed Farmer";
      const displayRole = userData.role || "Handler";

      const topName = document.getElementById("topUserName");
      const dropdownName = document.getElementById("dropdownUserName");
      const sidebarName = document.getElementById("sidebarUserName");
      const sidebarRole = document.getElementById("sidebarUserRole");

      if (topName) topName.textContent = displayName;
      if (dropdownName) dropdownName.textContent = displayName;
      if (sidebarName) sidebarName.textContent = displayName;
      if (sidebarRole) sidebarRole.textContent = displayRole;

      localStorage.setItem("userId", user.uid);
      localStorage.setItem("farmerName", displayName);

      loadReviewedOwnedFields(user.uid);
    }
  } catch (err) {
    console.error("❌ Profile Load Error:", err);
  }
}

// =============================
// 🟢 Render Fields owned by user
// =============================

async function loadJoinRequests(userId) {
  const container = document.getElementById("joinRequestsList");
  if (!container) return;

  container.innerHTML = `<div class="p-3 text-gray-500">Loading join requests...</div>`;

  try {
    // ✅ Get fields owned by handler
    const ownedFields = await getDocs(
      query(collection(db, "fields"), where("userId", "==", userId))
    );

    if (ownedFields.empty) {
      updateJoinRequestCounts(0);
      container.innerHTML = `<div class="p-3 text-gray-600">No owned fields found.</div>`;
      return;
    }

    const ownedFieldIds = ownedFields.docs.map(d => d.id);

    // ✅ Get all join requests matching handler-owned fields
    const joinsSnap = await getDocs(
      query(collection(db, "field_workers"), where("status", "==", "pending"))
    );

    const pendingRequests = joinsSnap.docs
      .map(doc => ({ id: doc.id, ...doc.data() }))
      .filter(req => ownedFieldIds.includes(req.field_id)); // ✅ validate field owner

    updateJoinRequestCounts(pendingRequests.length);

    if (!pendingRequests.length) {
      container.innerHTML = `<div class="p-3 text-gray-600">No pending join requests.</div>`;
      return;
    }

    container.innerHTML = "";

    // ✅ Render UI
    for (const req of pendingRequests) {
      const userSnap = await getDoc(doc(db, "users", req.user_uid));
      const requesterName = userSnap.exists() ? userSnap.data().name : "Unknown";

      const fieldSnap = await getDoc(doc(db, "fields", req.field_id));
      const fieldName = fieldSnap.exists() ? fieldSnap.data().barangay : req.field_id;

      const row = document.createElement("div");
      row.className = "p-3 border rounded bg-white mb-2 shadow-sm";
      row.innerHTML = `
        <p><b>${requesterName}</b> wants to join field <b>${fieldName}</b></p>
        <button class="approveBtn" data-id="${req.id}">Approve</button>
        <button class="declineBtn" data-id="${req.id}">Decline</button>
      `;
      container.appendChild(row);
    }

    // ✅ Button handlers
    document.querySelectorAll(".approveBtn").forEach(btn => {
      btn.addEventListener("click", async () => {
        await updateDoc(doc(db, "field_workers", btn.dataset.id), { status: "approved" });
        btn.textContent = "Approved ✅";
      });
    });

    document.querySelectorAll(".declineBtn").forEach(btn => {
      btn.addEventListener("click", async () => {
        await updateDoc(doc(db, "field_workers", btn.dataset.id), { status: "declined" });
        btn.textContent = "Declined ❌";
      });
    });

  } catch (err) {
    console.error("Join Request Error:", err);
    container.innerHTML = `<div class="p-3 text-red-500">Error loading join requests.</div>`;
  }
}

// ✅ Update Both UI Request Counters
function updateJoinRequestCounts(count) {
  const mRequests = document.getElementById("mRequests");
  const badge = document.getElementById("requestsCount");

  if (mRequests) mRequests.textContent = count;
  if (badge) badge.textContent = `${count} pending`;
}


// =============================
// 🟢 Auth Check
// =============================
onAuthStateChanged(auth, (user) => {
  if (!user) return (window.location.href = "../../login.html");
  loadUserProfile(user);
  loadJoinRequests(user.uid);
});

// =============================
// ✅ Dropdown Toggle
// =============================
document.addEventListener("DOMContentLoaded", () => {
  const dropdownBtn = document.getElementById("profileDropdownBtn");
  const dropdownMenu = document.getElementById("profileDropdown");
  if (!dropdownBtn || !dropdownMenu) return;

  dropdownBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    dropdownMenu.classList.toggle("hidden");
  });

  document.addEventListener("click", (e) => {
    if (!dropdownBtn.contains(e.target)) dropdownMenu.classList.add("hidden");
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") dropdownMenu.classList.add("hidden");
  });
});

async function loadReviewedOwnedFields(userId) {
  try {
    const q = query(
      collection(db, "fields"),
      where("userId", "==", userId)
    );

    const snap = await getDocs(q);

    const mFields = document.getElementById("mFields");
    mFields.textContent = snap.size;

    console.log("✅ Total Owned Fields:", snap.size);
  } catch (err) {
    console.error("❌ Reviewed Fields Error:", err);
  }
}


