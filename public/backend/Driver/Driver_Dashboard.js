// ✅ FINAL VERSION for Driver_Dashboard.js
// Path: public/backend/Driver/Driver_Dashboard.js

import { auth, db } from "../Common/firebase-config.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-auth.js";
import {
  doc,
  getDoc,
  collection,
  query,
  where,
  getDocs,
  updateDoc,
  orderBy, // 🟢 Added this line
} from "https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js";

import { onSnapshot } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js";
/*
  FUNCTION:
  - Fetch the current user's Firestore document (/users/{uid})
  - Fill all name placeholders on Driver_Dashboard.html:
      #userName (header)
      #dropdownUserName (profile dropdown)
      #sidebarUserName (sidebar)
      #workerName (new field in dashboard)
      #dropdownUserType (role display)
  - Redirect to login if no user
  - Then load notifications and show unread count
*/

onAuthStateChanged(auth, async (user) => {
  // 🟢 1️⃣ Add instant blur overlay before anything else loads
  const preBlur = document.createElement("div");
  preBlur.id = "preBlurOverlay";
  preBlur.className = "fixed inset-0 bg-black/40 backdrop-blur-sm z-[9998] flex items-center justify-center";
  preBlur.innerHTML = `
    <div class="bg-white text-center rounded-2xl shadow-2xl p-6 max-w-sm w-[85%] animate-fadeIn">
      <div class="text-[var(--cane-700)] text-lg font-semibold">Verifying Access...</div>
    </div>
  `;
  document.body.appendChild(preBlur);

  if (!user) {
    window.location.href = "../../frontend/Common/farmers_login.html";
    return;
  }

  try {
    const userRef = doc(db, "users", user.uid);
    const userSnap = await getDoc(userRef);

    if (!userSnap.exists()) {
      console.warn("⚠️ Firestore document not found for:", user.uid);
      window.location.href = "../../frontend/Common/farmers_login.html";
      return;
    }

    const data = userSnap.data();
    const role = (data.role || "").toLowerCase();

    // 🚫 Restrict access if not a driver
    if (role !== "driver") {
      preBlur.remove(); // remove loading blur before showing restriction
      const overlay = document.createElement("div");
      overlay.className =
        "fixed inset-0 flex items-center justify-center bg-black/40 backdrop-blur-sm z-[9999]";
      overlay.innerHTML = `
        <div class="bg-white rounded-2xl shadow-2xl p-6 text-center max-w-md w-[90%] animate-fadeIn">
          <div class="text-5xl mb-3">🚫</div>
          <h2 class="text-lg font-bold text-[var(--cane-800)] mb-2">Access Restricted</h2>
          <p class="text-gray-600 mb-4 text-sm">
            You cannot access the Driver Dashboard because your role is <b>${role}</b>.<br>
            Only verified <b>Driver</b> accounts can access this page.
          </p>
          <button class="mt-2 px-5 py-2 rounded-lg bg-[var(--cane-700)] text-white font-medium shadow-md hover:bg-[var(--cane-800)]">
            Back to Lobby
          </button>
        </div>
      `;
      document.body.appendChild(overlay);
      overlay.querySelector("button").onclick = () => {
        window.location.href = "../../frontend/Common/lobby.html";
      };
      return;
    }

    // ✅ Role is driver — continue as normal
    preBlur.remove(); // remove blur when authorized
    const fullName = (data.fullname || data.name || data.email || "Driver").trim();
    const firstName = fullName.split(" ")[0];
    const headerNameEl = document.getElementById("userName");
    const dropdownNameEl = document.getElementById("dropdownUserName");
    const sidebarNameEl = document.getElementById("sidebarUserName");
    const workerNameEl = document.getElementById("workerName");
    const dropdownTypeEl = document.getElementById("dropdownUserType");

    if (headerNameEl) headerNameEl.textContent = firstName;
    if (dropdownNameEl) dropdownNameEl.textContent = fullName;
    if (sidebarNameEl) sidebarNameEl.textContent = fullName;
    if (workerNameEl) workerNameEl.textContent = fullName;
    if (dropdownTypeEl) dropdownTypeEl.textContent = data.role;

    localStorage.setItem("userFullName", fullName);
    localStorage.setItem("userRole", role);
    localStorage.setItem("userId", user.uid);

    console.info("✅ Driver_Dashboard: loaded user name for", user.uid);

    // 🔔 Load notifications after user data loads
    loadDriverNotifications(user.uid);
  } catch (error) {
    console.error("❌ Error verifying role:", error);
  }
});

// ============================================================
// 🔔 NOTIFICATIONS SYSTEM
// ============================================================

function updateNotifBadge(badge, count) {
  if (count > 0) {
    badge.textContent = count;
    badge.classList.remove("hidden");
  } else {
    badge.classList.add("hidden");
  }
}
async function loadDriverNotifications(userId) {
  const notifList = document.getElementById("allNotificationsList");
  const badge = document.getElementById("notifBadgeCount");
  let unreadCount = 0;

  try {
    // 🔍 Try userId field first
    let q = query(
    collection(db, "notifications"),
    where("userId", "==", userId),
    orderBy("timestamp", "desc") // 🟢 Sorts newest first
    );

onSnapshot(q, (snapshot) => {
  notifList.innerHTML = "";
  let unreadCount = 0;

  if (snapshot.empty) {
    notifList.innerHTML = `<p class="text-gray-500 text-sm text-center">No notifications yet.</p>`;
    updateNotifBadge(badge, 0);
    return;
  }

  snapshot.forEach((docSnap) => {
    const notif = docSnap.data();
    const read = notif.status === "read";
    if (!read) unreadCount++;

    const card = document.createElement("div");
    card.className = `notification-card ${
      read ? "read bg-white" : "unread bg-gray-100"
    } p-3 rounded-lg border border-gray-200 hover:bg-gray-50 transition cursor-pointer`;

    card.innerHTML = `
      <div class="flex items-start gap-3">
          <i class="fas ${
          read ? "fa-envelope-open-text text-gray-400" : "fa-envelope text-[var(--cane-600)]"
          } mt-1 text-base"></i>
          <div class="flex-1">
          <h4 class="text-sm ${
              read ? "text-gray-800 font-medium" : "text-[var(--cane-950)] font-semibold"
          }">${notif.title || "Notification"}</h4>
          <p class="text-xs text-[var(--cane-800)]">${notif.message || "No message"}</p>
          <p class="text-[10px] text-gray-400 mt-1">${
              notif.timestamp
              ? new Date(notif.timestamp.seconds * 1000).toLocaleString()
              : ""
          }</p>
          </div>
      </div>
    `;
    notifList.appendChild(card);

    // Mark as read on click
    card.addEventListener("click", async () => {
      if (!read) {
        await updateDoc(doc(db, "notifications", docSnap.id), { status: "read" });
      }

      // 🟢 If notification message contains a "click here" keyword → go to Driver_Badge page
      if (notif.message && notif.message.toLowerCase().includes("click here")) {
        window.location.href = "../../frontend/Driver/Driver_Badge.html";
      }
    });

  });

  updateNotifBadge(badge, unreadCount);
});


    // 🔴 Update badge count
    if (unreadCount > 0) {
      badge.textContent = unreadCount;
      badge.classList.remove("hidden");
    } else {
      badge.classList.add("hidden");
    }

  } catch (error) {
    console.error("⚠️ Error loading notifications:", error);
    notifList.innerHTML = `<p class="text-gray-500 text-sm text-center">Failed to load notifications.</p>`;
  }
}

// ============================================================
// ⚙️ MODAL + BADGE EVENTS
// ============================================================

document.addEventListener("DOMContentLoaded", () => {
  const bell = document.getElementById("notifBellContainer");
  const modal = document.getElementById("notifModal");
  const closeBtn = document.getElementById("closeNotifModal");
  const markAllBtn = document.getElementById("markAllReadBtn");

  if (!bell || !modal) return;

  // 🔘 Open modal
  bell.addEventListener("click", () => {
    modal.classList.remove("hidden");
    modal.classList.add("flex");
  });

  // ❌ Close modal
  closeBtn?.addEventListener("click", () => {
    modal.classList.add("hidden");
    modal.classList.remove("flex");
  });

  // ✅ Mark all as read
  // 🟢 Load notifications if user ID already stored
  const userId = localStorage.getItem("userId");

    // ✅ Mark all as read
    markAllBtn?.addEventListener("click", async () => {
    if (!userId) return;

    let q = query(collection(db, "notifications"), where("userId", "==", userId));
    let snap = await getDocs(q);
    if (snap.empty) {
        q = query(collection(db, "notifications"), where("receiverId", "==", userId));
        snap = await getDocs(q);
    }

    const unread = snap.docs.filter((d) => d.data().status !== "read");
    if (unread.length === 0) return;

    // ✅ Corrected field to "status"
    await Promise.all(
        unread.map((d) => updateDoc(doc(db, "notifications", d.id), { status: "read" }))
    );

    console.log("✅ All notifications marked as read.");
    loadDriverNotifications(userId); // Refresh the list
    });

});
