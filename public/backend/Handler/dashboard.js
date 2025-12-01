
import { auth, db } from "../Common/firebase-config.js";
import {
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/12.1.0/firebase-auth.js";
import { doc, getDoc, collection, query, where, getDocs, updateDoc, deleteDoc, serverTimestamp, orderBy, limit, onSnapshot, collectionGroup } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js";
import { initializeFieldsSection } from "./fields-map.js";
import { initializeRentDriverSection } from "./rent-driver.js";
import { initializeHandlerWorkersSection } from "./worker.js";
import { notifyTaskDeletion } from "../Common/notifications.js";
import { calculateDAP } from "./growth-tracker.js";
import './analytics.js';

const NAME_PLACEHOLDERS = new Set([
  "",
  "loading",
  "loading...",
  "unnamed",
  "unnamed farmer",
  "farmer name",
  "handler name",
  "user name",
  "null",
  "undefined"
]);

const ROLE_PLACEHOLDERS = new Set(["", "pending", "null", "undefined", "unknown"]);

const cleanString = (value) => (typeof value === "string" ? value.trim() : "");

const resolveValue = (candidates, placeholders) => {
  for (const candidate of candidates) {
    const cleaned = cleanString(candidate);
    if (cleaned && !placeholders.has(cleaned.toLowerCase())) {
      return cleaned;
    }
  }
  return "";
};

// =============================
// 🔔 Notifications Helpers
// =============================

function formatRelativeTime(ts) {
  const date = ts && ts.toDate ? ts.toDate() : ts ? new Date(ts) : new Date();
  const diff = Math.floor((Date.now() - date.getTime()) / 1000);

  if (diff < 60) return "Just now";
  if (diff < 3600) return `${Math.floor(diff / 60)} min ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} hr ago`;
  if (diff < 604800) return `${Math.floor(diff / 86400)} day${Math.floor(diff / 86400) > 1 ? "s" : ""} ago`;
  return date.toLocaleDateString();
}

let notificationsUnsub = null;

async function initNotifications(userId) {
  const bellBtn = document.getElementById("notificationBellBtn");
  const dropdown = document.getElementById("notificationDropdown");
  const badge = document.getElementById("notificationBadge");
  const list = document.getElementById("notificationList");
  const refreshBtn = document.getElementById("notificationRefreshBtn");

  if (!bellBtn || !dropdown || !badge || !list) return;

  const removeBackdrop = () => {
    const backdrop = document.getElementById('notificationBackdrop');
    if (backdrop) backdrop.remove();
  };

  const closeDropdown = (event) => {
    if (!dropdown.contains(event.target) && !bellBtn.contains(event.target)) {
      dropdown.classList.add("hidden");
      removeBackdrop();
    }
  };

  bellBtn.addEventListener("click", (event) => {
    event.stopPropagation();
    const isOpen = !dropdown.classList.contains("hidden");
    dropdown.classList.toggle("hidden");
    
    if (!dropdown.classList.contains("hidden")) {
      bellBtn.classList.add("text-white");
      // Center dropdown on mobile view
      if (window.innerWidth < 640) {
        // Create backdrop overlay for mobile
        let backdrop = document.getElementById('notificationBackdrop');
        if (!backdrop) {
          backdrop = document.createElement('div');
          backdrop.id = 'notificationBackdrop';
          backdrop.style.cssText = 'position: fixed; inset: 0; background: rgba(0,0,0,0.3); z-index: 49;';
          backdrop.addEventListener('click', () => {
            dropdown.classList.add('hidden');
            removeBackdrop();
          });
          document.body.appendChild(backdrop);
        }
        
        // Center the dropdown on mobile
        dropdown.style.position = 'fixed';
        dropdown.style.left = '50%';
        dropdown.style.top = '50%';
        dropdown.style.right = 'auto';
        dropdown.style.transform = 'translate(-50%, -50%)';
        dropdown.style.width = 'calc(100vw - 2rem)';
        dropdown.style.maxWidth = '20rem';
        dropdown.style.marginTop = '0';
      } else {
        // Desktop: reset to original positioning
        dropdown.style.position = 'absolute';
        dropdown.style.left = 'auto';
        dropdown.style.right = '0';
        dropdown.style.top = '100%';
        dropdown.style.transform = 'none';
        dropdown.style.width = '20rem';
        dropdown.style.maxWidth = 'none';
        dropdown.style.marginTop = '0.5rem';
        removeBackdrop();
      }
    } else {
      removeBackdrop();
    }
  });

  document.addEventListener("click", closeDropdown);
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      dropdown.classList.add("hidden");
      removeBackdrop();
    }
  });

  // Helper function to format notification titles
  const getNotificationTitle = (notification) => {
    // If there's an explicit title, use it
    if (notification.title) return notification.title;

    // Otherwise, generate title from type
    const typeToTitle = {
      'report_requested': 'Report Requested',
      'report_approved': 'Report Approved',
      'report_rejected': 'Report Rejected',
      'task_assigned': 'New Task Assigned',
      'task_completed': 'Task Completed',
      'task_deleted': 'Task Cancelled',
      'driver_status_update': 'Driver Status Update',
      'work_logged': 'Work Logged',
      'rental_approved': 'Rental Request Approved',
      'rental_rejected': 'Rental Request Rejected',
      'field_approved': 'Field Registration Approved',
      'field_rejected': 'Field Registration Rejected',
      'field_registration': 'New Field Registration',
      'badge_approved': 'Driver Badge Approved',
      'badge_rejected': 'Driver Badge Rejected',
      'badge_deleted': 'Driver Badge Deleted',
      'join_approved': 'Join Request Approved',
      'join_rejected': 'Join Request Rejected'
    };

    return typeToTitle[notification.type] || 'Notification';
  };

  const renderNotifications = (docs = []) => {
    // Fix: use 'read' boolean field instead of 'status' string field
    const unread = docs.filter((doc) => !doc.read);

    if (unread.length > 0) {
      badge.textContent = String(unread.length);
      badge.classList.remove("hidden");
    } else {
      badge.classList.add("hidden");
    }

    if (docs.length === 0) {
      list.innerHTML = '<div class="p-4 text-sm text-gray-500 text-center">No notifications yet.</div>';
      return;
    }

    list.innerHTML = docs
      .map((item) => {
        const title = getNotificationTitle(item);
        const message = item.message || "";
        const meta = formatRelativeTime(item.timestamp || item.createdAt);
        const isRead = item.read === true;
        const statusClass = isRead ? "bg-gray-100" : "bg-[var(--cane-50)]";
        const safeMessage = typeof message === "string" ? message : "";

        return `<button data-id="${item.id}" class="w-full text-left px-4 py-3 border-b border-gray-100 hover:bg-gray-50 focus:outline-none ${statusClass}">
          <div class="flex items-start gap-2">
            <div class="mt-1 h-2 w-2 rounded-full ${isRead ? "bg-gray-300" : "bg-[var(--cane-600)]"}"></div>
            <div class="flex-1">
              <div class="flex items-center justify-between">
                <p class="text-sm font-semibold text-[var(--cane-900)]">${title}</p>
                <span class="text-xs text-[var(--cane-600)]">${meta}</span>
              </div>
              <p class="mt-1 text-sm text-[var(--cane-700)] leading-snug">${safeMessage}</p>
            </div>
          </div>
        </button>`;
      })
      .join("");

    Array.from(list.querySelectorAll("button[data-id]"))
      .forEach(btn => {
        btn.addEventListener("click", async () => {
          const notificationId = btn.dataset.id;
          try {
            await markNotificationRead(userId, notificationId);

            // Handle report request notifications - navigate to reports section with pre-selected type
            const notification = docs.find(doc => doc.id === notificationId);
            if (notification && notification.type === 'report_requested') {
              const reportType = notification.relatedEntityId;
              if (reportType) {
                // Store the requested report type and show reports section
                sessionStorage.setItem('requestedReportType', reportType);
                // Close notification dropdown
                const dropdown = document.getElementById('notificationDropdown');
                if (dropdown) dropdown.classList.add('hidden');
                // Navigate to reports section
                if (typeof showSection === 'function') {
                  showSection('reports');
                }
              }
            }
          } catch (err) {
            console.warn("Failed to update notification status", err);
          }
        });
      });
  };

  const fetchNotifications = () => {
    if (notificationsUnsub) notificationsUnsub();

    const notificationsRef = collection(db, "notifications");
    const notificationsQuery = query(
      notificationsRef,
      where("userId", "==", userId),
      orderBy("timestamp", "desc"),
      limit(25)
    );

    notificationsUnsub = onSnapshot(notificationsQuery, (snapshot) => {
      const docs = snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }));
      console.log(`🔔 Handler notifications loaded: ${docs.length} notifications`);
      renderNotifications(docs);
    }, (error) => {
      console.error("Notifications stream failed", error);
      list.innerHTML = '<div class="p-4 text-sm text-red-500 text-center">Failed to load notifications.</div>';
    });
  };

  // Close button handler
  const closeBtn = document.getElementById('notificationCloseBtn');
  if (closeBtn) {
    closeBtn.addEventListener('click', (event) => {
      event.stopPropagation();
      dropdown.classList.add('hidden');
      removeBackdrop();
    });
  }

  // Mark all as read button handler
  const markAllReadBtn = document.getElementById('notificationMarkAllReadBtn');
  if (markAllReadBtn) {
    markAllReadBtn.addEventListener('click', async (event) => {
      event.stopPropagation();
      try {
        const { collection, query, where, getDocs, updateDoc, doc, serverTimestamp } = await import('https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js');
        const { db } = await import('../Common/firebase-config.js');
        
        // Get all unread notifications for this user
        const notificationsRef = collection(db, "notifications");
        const notificationsQuery = query(
          notificationsRef,
          where("userId", "==", userId)
        );
        
        const snapshot = await getDocs(notificationsQuery);
        const unreadNotifications = snapshot.docs
          .map(docSnap => ({ id: docSnap.id, ...docSnap.data() }))
          .filter(notif => !notif.read);
        
        // Mark all as read
        const updatePromises = unreadNotifications.map(notif =>
          updateDoc(doc(db, "notifications", notif.id), {
            read: true,
            readAt: serverTimestamp()
          })
        );
        
        await Promise.all(updatePromises);
        console.log(`✅ Marked ${unreadNotifications.length} notifications as read`);
      } catch (err) {
        console.error('Failed to mark all notifications as read:', err);
      }
    });
  }

  if (refreshBtn) {
    refreshBtn.addEventListener("click", (event) => {
      event.stopPropagation();
      fetchNotifications();
    });
  }

  fetchNotifications();
}

async function markNotificationRead(userId, notificationId) {
  if (!notificationId) return;
  try {
    await updateDoc(doc(db, "notifications", notificationId), {
      read: true,
      readAt: serverTimestamp()
    });
    console.log(`✅ Marked notification ${notificationId} as read`);
  } catch (err) {
    console.warn("Failed to mark notification as read", err);
  }
}

const toTitleCase = (value) => {
  const cleaned = cleanString(value);
  if (!cleaned) return "";
  return cleaned
    .split(/\s+/)
    .map(segment => segment.charAt(0).toUpperCase() + segment.slice(1).toLowerCase())
    .join(" ");
};

const fieldOwnedByUser = (fieldInfo = {}, userId) => {
  const ownerCandidates = [
    fieldInfo.userId,
    fieldInfo.user_id,
    fieldInfo.owner_uid,
    fieldInfo.ownerId,
    fieldInfo.landowner_id,
    fieldInfo.registered_by
  ]
    .map(cleanString)
    .filter(Boolean);
  return ownerCandidates.includes(userId);
};

function applyUserDisplay({ nameCandidates = [], roleCandidates = [], persist = false, userId }) {
  const resolvedName = resolveValue(nameCandidates, NAME_PLACEHOLDERS) || "Unnamed Farmer";
  const rawRole = resolveValue(roleCandidates, ROLE_PLACEHOLDERS) || "handler";
  const formattedRole = toTitleCase(rawRole || "handler") || "Handler";
  const firstTwoNames = (() => {
    const parts = resolvedName.split(/\s+/).filter(Boolean);
    if (parts.length >= 2) return parts.slice(0, 2).join(" ");
    return parts[0] || resolvedName;
  })();

  const topName = document.getElementById("topUserName");
  const dropdownName = document.getElementById("dropdownUserName");
  const sidebarName = document.getElementById("sidebarUserName");
  const sidebarRole = document.getElementById("sidebarUserRole");

  if (topName) topName.textContent = firstTwoNames;
  if (dropdownName) dropdownName.textContent = firstTwoNames;
  if (sidebarName) sidebarName.textContent = firstTwoNames;
  if (sidebarRole) sidebarRole.textContent = formattedRole;

  if (persist) {
    if (userId) localStorage.setItem("userId", userId);
    if (!NAME_PLACEHOLDERS.has(resolvedName.toLowerCase())) {
      localStorage.setItem("farmerName", resolvedName);
    }
    if (!ROLE_PLACEHOLDERS.has(rawRole.toLowerCase())) {
      localStorage.setItem("userRole", rawRole.toLowerCase());
    }
  }
}

// =============================
// 🟢 Fetch Logged-in User and Display Info
// =============================
async function loadUserProfile(user) {
  try {
    const storedName = cleanString(localStorage.getItem("farmerName"));
    const storedNickname = cleanString(localStorage.getItem("farmerNickname"));
    const storedRole = cleanString(localStorage.getItem("userRole"));

    // Prime UI immediately with locally cached values
    applyUserDisplay({
      nameCandidates: [storedNickname, storedName, user.displayName, user.email],
      roleCandidates: [storedRole || "handler"]
    });

    const userRef = doc(db, "users", user.uid);
    const userSnap = await getDoc(userRef);
    const userData = userSnap.exists() ? userSnap.data() : {};

    applyUserDisplay({
      nameCandidates: [
        userData.nickname,
        storedNickname,
        userData.name,
        userData.fullname,
        userData.fullName,
        userData.displayName,
        storedName,
        user.displayName,
        user.email
      ],
      roleCandidates: [userData.role, storedRole || "handler"],
      persist: true,
      userId: user.uid
    });

    // Load and display profile photo
    if (userData.photoURL) {
      const profilePhoto = document.getElementById('profilePhoto');
      const profileIconDefault = document.getElementById('profileIconDefault');
      if (profilePhoto) {
        profilePhoto.src = userData.photoURL;
        profilePhoto.classList.remove('hidden');
        if (profileIconDefault) profileIconDefault.classList.add('hidden');
      }
    }

    loadReviewedOwnedFields(user.uid);
    // Don't call renderHandlerFields here - let fields.html script handle it when section loads
  } catch (err) {
    console.error("❌ Profile Load Error:", err);
  }
}

// =============================
// 🟢 Render Fields owned by user
// =============================

async function loadJoinRequests(handlerId) {
  const container = document.getElementById("joinRequestsList");
  if (!container) return;

  container.innerHTML = `<div class="p-3 text-gray-500">Loading join requests...</div>`;

  // Debug: Check handler role
  try {
    const handlerUserRef = doc(db, "users", handlerId);
    const handlerUserSnap = await getDoc(handlerUserRef);
    if (handlerUserSnap.exists()) {
      const handlerData = handlerUserSnap.data();
      const handlerRole = handlerData.role || "";
      console.log(`🔍 Handler role check: ${handlerRole} (should be 'handler')`);
      if (handlerRole !== "handler") {
        console.warn(`⚠️ Handler role mismatch: Expected 'handler', got '${handlerRole}'. This may cause permission issues.`);
      }
    } else {
      console.warn(`⚠️ Handler user document not found for ${handlerId}`);
    }
  } catch (err) {
    console.warn("⚠️ Could not verify handler role:", err.message);
  }

  try {
    // Step 1: Get all fields owned by this handler
    // Check multiple possible owner fields (userId, landowner_id, user_id, registered_by)
    // ✅ Simple query - just get fields by userId
    let handlerFields = [];
    try {
      const fieldsQuery = query(
        collection(db, "fields"),
        where("userId", "==", handlerId)
      );
      const snap = await getDocs(fieldsQuery);
      handlerFields = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    } catch (err) {
      console.warn("Could not fetch fields:", err.message);
    }

    const handlerFieldIds = new Set(handlerFields.map(f => f.id).filter(Boolean));

    console.log(`📋 Found ${handlerFields.length} field(s) for handler`);
    
    if (handlerFieldIds.size === 0) {
      container.innerHTML = `<div class="p-3 text-gray-600">No fields found. Register a field to receive join requests.</div>`;
      updateJoinRequestCounts(0);
      return;
    }

    // Step 2: Query top-level field_joins collection for this handler's fields
    let allJoinRequests = [];

    try {
      // ✅ Query top-level field_joins collection where handlerId matches
      const joinFieldsQuery = query(
        collection(db, "field_joins"),
        where("handlerId", "==", handlerId),
        where("status", "==", "pending")
      );
      const joinFieldsSnap = await getDocs(joinFieldsQuery);

      console.log(`📥 Retrieved ${joinFieldsSnap.docs.length} pending join requests for handler`);

      // Process join requests
      allJoinRequests = joinFieldsSnap.docs.map(doc => {
        const data = doc.data();

        return {
          id: doc.id,
          refPath: doc.ref.path,
          fieldId: data.fieldId,
          userId: data.userId,
          user_uid: data.userId,
          fieldName: data.fieldName || "",
          street: data.street || "",
          barangay: data.barangay || "",
          role: data.assignedAs || data.joinAs || data.role || "worker", // ✅ Check assignedAs first
          status: data.status || "pending",
          requestedAt: data.requestedAt
        };
      });

      console.log(`✅ Loaded ${allJoinRequests.length} pending join requests for handler's fields`);

    } catch (err) {
      console.error("❌ Error fetching join requests:", err);
      console.error("   Error code:", err.code);
      console.error("   Error message:", err.message);

      // Show user-friendly error message
      container.innerHTML = `
        <div class="p-4 text-red-600 border border-red-200 rounded-lg bg-red-50">
          <p class="font-semibold mb-2">Unable to load join requests</p>
          <p class="text-sm mb-2">Error: ${err.message || "Permission denied"}</p>
          <p class="text-xs text-gray-600 mb-3">
            This may be due to Firestore security rules or network issues.
          </p>
          <button onclick="location.reload()" class="px-3 py-1 text-sm bg-red-600 text-white rounded hover:bg-red-700">
            <i class="fas fa-redo mr-1"></i>Retry
          </button>
        </div>
      `;
      updateJoinRequestCounts(0);
      return;
    }

    // Step 3: Build field info map for quick lookup
    const fieldInfoMap = new Map();
    handlerFields.forEach(field => {
      fieldInfoMap.set(field.id, field);
    });

    // Step 4: Fetch user info for all requesters
    const requesterIds = Array.from(new Set(
      allJoinRequests
        .map(req => req.userId || req.user_id || req.user_uid)
        .filter(Boolean)
        .map(cleanString)
        .filter(Boolean)
    ));

    const requesterMap = new Map();
    await Promise.all(
      requesterIds.map(async uid => {
        try {
          const snap = await getDoc(doc(db, "users", uid));
          if (snap.exists()) {
            const data = snap.data();
            const name = resolveValue(
              [data.nickname, data.name, data.fullname, data.fullName, data.displayName, data.email],
              NAME_PLACEHOLDERS
            ) || uid;
            requesterMap.set(uid, {
              name,
              role: data.role || ""
            });
          } else {
            requesterMap.set(uid, { name: uid, role: "" });
          }
        } catch (_) {
          requesterMap.set(uid, { name: uid, role: "" });
        }
      })
    );

    // Step 5: Sort requests by requestedAt (newest first)
    allJoinRequests.sort((a, b) => {
      const toMillis = (ts) => {
        if (!ts) return 0;
        const date = ts.toDate ? ts.toDate() : (ts instanceof Date ? ts : null);
        return date ? date.getTime() : 0;
      };
      return toMillis(b.requestedAt) - toMillis(a.requestedAt);
    });

    // Count pending requests for the badge (allJoinRequests already filtered to pending only)
    updateJoinRequestCounts(allJoinRequests.length);

    // Step 6: Render the requests
    if (!allJoinRequests.length) {
      container.innerHTML = `<div class="p-3 text-gray-600">No pending join requests for your fields.</div>`;
      updateJoinRequestCounts(0);
      return;
    }

    const formatDateTime = (ts) => {
      if (!ts) return "—";
      const date = ts.toDate ? ts.toDate() : (ts instanceof Date ? ts : null);
      if (!date) return "—";
      return date.toLocaleString("en-US", {
        month: "short",
        day: "2-digit",
        year: "numeric",
        hour: "numeric",
        minute: "2-digit"
      });
    };

    container.innerHTML = "";

    for (const req of allJoinRequests) {
      const requesterId = cleanString(req.userId || req.user_id || req.user_uid || "");
      const requester = requesterMap.get(requesterId) || { name: requesterId || "Unknown User", role: "" };
      
      const fieldId = req.fieldId || req.field_id || req.fieldID;
      const fieldInfo = fieldInfoMap.get(fieldId) || {};
      
      const fieldName = req.fieldName || req.field_name || fieldInfo.field_name || fieldInfo.fieldName || fieldInfo.name || `Field ${fieldId}`;
      const barangay = req.barangay || fieldInfo.barangay || fieldInfo.location || "—";
      const street = req.street || fieldInfo.street || "";
      const locationLine = [barangay, street].filter(Boolean).join(" • ") || "Location pending";
      // Check for joinAs field first, then fallback to role/requested_role
      const roleLabel = toTitleCase(req.joinAs || req.role || req.requested_role || "worker");
      const requestedLabel = formatDateTime(req.requestedAt || req.requested_at || req.createdAt);

      const card = document.createElement("div");
      card.className = "border border-gray-200 rounded-xl p-4 mb-3 shadow-sm bg-white hover:shadow-md transition-shadow";
      card.dataset.requestItem = "true";
      card.innerHTML = `
        <div class="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div class="flex-1">
            <p class="font-semibold text-[var(--cane-900)] text-base">${requester.name}</p>
            <p class="text-sm text-gray-600 mt-1">
              <span class="inline-block px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800 mr-2">${roleLabel}</span>
              request for <span class="font-medium text-[var(--cane-900)]">${fieldName}</span>
            </p>
            <p class="text-xs text-gray-500 mt-1">
              <i class="fas fa-map-marker-alt mr-1"></i>${locationLine}
            </p>
            <p class="text-xs text-gray-400 mt-1">
              <i class="fas fa-clock mr-1"></i>Requested ${requestedLabel}
            </p>
          </div>
          <div class="flex items-center gap-2 flex-shrink-0">
            ${
              // Only show buttons for pending requests (since we filter to only show pending)
              `
                <button class="px-4 py-2 rounded-md text-sm font-medium bg-green-600 text-white hover:bg-green-700 transition-colors focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2" data-join-action="approve" data-path="${req.refPath}" data-request-id="${req.id}">
                  <i class="fas fa-check mr-1"></i>Approve
                </button>
                <button class="px-4 py-2 rounded-md text-sm font-medium bg-red-600 text-white hover:bg-red-700 transition-colors focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2" data-join-action="reject" data-path="${req.refPath}" data-request-id="${req.id}">
                  <i class="fas fa-times mr-1"></i>Reject
                </button>
              `
            }
          </div>
        </div>
      `;
      container.appendChild(card);
    }

    // Step 7: Attach event listeners to action buttons
    container.querySelectorAll("[data-join-action]").forEach(btn => {
      btn.addEventListener("click", async (e) => {
        e.stopPropagation();
        const path = btn.dataset.path;
        const action = btn.dataset.joinAction;
        const requestId = btn.dataset.requestId;
        
        if (!path || !action) {
          console.error("Missing path or action for join request button");
          return;
        }

        // Show confirmation modal
        const confirmModal = document.createElement("div");
        confirmModal.className = "fixed inset-0 bg-black/40 flex items-center justify-center z-[10000]";
        const iconClass = action === "approve" ? "check" : "times";
        const iconColor = action === "approve" ? "text-green-600" : "text-red-600";
        const bgColor = action === "approve" ? "bg-green-100" : "bg-red-100";
        const btnColor = action === "approve" ? "bg-green-600 hover:bg-green-700" : "bg-red-600 hover:bg-red-700";
        
        confirmModal.innerHTML = `
          <div class="bg-white rounded-xl p-6 w-[90%] max-w-sm text-center border border-gray-200 shadow-lg">
            <div class="mb-4">
              <div class="w-16 h-16 mx-auto rounded-full flex items-center justify-center ${bgColor}">
                <i class="fas fa-${iconClass} text-2xl ${iconColor}"></i>
              </div>
            </div>
            <h3 class="text-lg font-semibold mb-2 text-gray-800">Confirm ${action === "approve" ? "Approval" : "Rejection"}</h3>
            <p class="text-gray-600 text-sm mb-5">Are you sure you want to <strong>${action === "approve" ? "approve" : "reject"}</strong> this join request?</p>
            <div class="flex justify-center gap-3">
              <button id="cancelConfirm" class="px-4 py-2 rounded-md border border-gray-300 text-gray-700 hover:bg-gray-100 transition">Cancel</button>
              <button id="okConfirm" class="px-4 py-2 rounded-md ${btnColor} text-white transition font-medium">${action === "approve" ? "Approve" : "Reject"}</button>
            </div>
          </div>
        `;
        document.body.appendChild(confirmModal);

        // Cancel handler
        confirmModal.querySelector("#cancelConfirm").onclick = () => {
          confirmModal.remove();
        };

        // Confirm handler
        confirmModal.querySelector("#okConfirm").onclick = async () => {
          confirmModal.remove();

          const originalText = btn.textContent;
          const originalDisabled = btn.disabled;
          btn.disabled = true;
          btn.textContent = action === "approve" ? "Approving..." : "Rejecting...";

          try {
            const docRef = doc(db, path);
            const requestDoc = await getDoc(docRef);
            const requestData = requestDoc.exists() ? requestDoc.data() : {};
            const requesterUserId = requestData.userId || requestData.user_id || requestData.user_uid || "";
            // ✅ Check assignedAs first (new field), then fallback to joinAs/role
            const assignedAs = requestData.assignedAs || requestData.joinAs || requestData.role || requestData.requested_role || "worker";

            // Update join request status
            await updateDoc(docRef, {
              status: action === "approve" ? "approved" : "rejected",
              statusUpdatedAt: serverTimestamp(),
              reviewedBy: handlerId,
              reviewedAt: serverTimestamp()
            });

            // ✅ If approved, SMART role upgrade: only upgrade if user doesn't already have that capability
            if (action === "approve" && requesterUserId) {
              try {
                const userRef = doc(db, "users", requesterUserId);
                const userSnap = await getDoc(userRef);

                if (userSnap.exists()) {
                  const currentRole = userSnap.data().role || "farmer";

                  // Role hierarchy: farmer < worker < driver < handler < sra < admin < system_admin
                  const roleHierarchy = {
                    "farmer": 0,
                    "worker": 1,
                    "driver": 2,
                    "handler": 3,
                    "sra": 4,
                    "admin": 5,
                    "system_admin": 6
                  };

                  const currentLevel = roleHierarchy[currentRole] || 0;
                  const requestedLevel = roleHierarchy[assignedAs] || 0;

                  // Only upgrade if requested role is higher than current role
                  if (requestedLevel > currentLevel) {
                    await updateDoc(userRef, {
                      role: assignedAs.toLowerCase(),
                      roleUpdatedAt: serverTimestamp()
                    });
                    console.log(`✅ Upgraded user ${requesterUserId} from ${currentRole} → ${assignedAs}`);
                  } else {
                    console.log(`ℹ️ User ${requesterUserId} already has role "${currentRole}" (>= ${assignedAs}), no upgrade needed`);
                  }
                } else {
                  console.warn(`⚠️ User ${requesterUserId} not found in users collection`);
                }
              } catch (roleUpdateErr) {
                console.error("Failed to update user role:", roleUpdateErr);
                // Continue even if role update fails
              }
            }

            //notification for the requester
            if (requesterUserId) {
              const notifRef = doc(collection(db, "notifications"));
              const notifTitle =
                action === "approve"
                  ? "Field Join Approved!"
                  : "Field Join Rejected!";
              const notifMessage =
                action === "approve"
                  ? `Your join request for <strong>${requestData.fieldName || "a field"}</strong> has been approved! You can now access the field from your <a href="../../frontend/Worker/Workers.html" target="_blank" class="notif-link">Worker Dashboard</a>.`
                  : `Your join request for <strong>${requestData.fieldName || "a field"}</strong> has been rejected by the handler. Please contact your handler for more information.`;

              await setDoc(notifRef, {
                userId: requesterUserId,
                title: notifTitle,
                message: notifMessage,
                status: "unread",
                timestamp: serverTimestamp(),
              });

              console.log(`📨 Notification sent to ${requesterUserId} (${notifTitle})`);
            }

            // Show success message
            const successModal = document.createElement("div");
            successModal.className = "fixed inset-0 bg-black/40 flex items-center justify-center z-[10000]";
            const successIconClass = action === "approve" ? "check-circle" : "times-circle";
            const successIconColor = action === "approve" ? "text-green-600" : "text-red-600";
            const successBgColor = action === "approve" ? "bg-green-100" : "bg-red-100";
            
            successModal.innerHTML = `
              <div class="bg-white rounded-xl p-6 w-[90%] max-w-sm text-center border border-gray-200 shadow-lg">
                <div class="mb-4">
                  <div class="w-16 h-16 mx-auto rounded-full flex items-center justify-center ${successBgColor}">
                    <i class="fas fa-${successIconClass} text-2xl ${successIconColor}"></i>
                  </div>
                </div>
                <h3 class="text-lg font-semibold mb-2 text-gray-800">${action === "approve" ? "Approved" : "Rejected"} Successfully</h3>
                <p class="text-gray-600 text-sm mb-5">The join request has been ${action === "approve" ? "approved" : "rejected"} successfully.</p>
                <button id="okSuccess" class="px-4 py-2 rounded-md bg-[var(--cane-700)] text-white hover:bg-[var(--cane-800)] transition font-medium">OK</button>
              </div>
            `;
            document.body.appendChild(successModal);

            successModal.querySelector("#okSuccess").onclick = async () => {
              successModal.remove();
              // Refresh the list - approved/rejected requests will disappear (only pending shown)
              await loadJoinRequests(handlerId);
            };

          } catch (err) {
            console.error("Join Request update failed:", err);
            alert(`Failed to ${action} join request: ${err.message || "Unknown error"}`);
            btn.disabled = originalDisabled;
            btn.textContent = originalText;
          }
        };

        // Close modal on background click
        confirmModal.addEventListener("click", (e) => {
          if (e.target === confirmModal) {
            confirmModal.remove();
          }
        });
      });
    });

  } catch (err) {
    console.error("Join Request Error:", err);
    const container = document.getElementById("joinRequestsList");
    const message = err?.message || err?.code || "Unexpected error";
    if (container) {
      container.innerHTML = `
        <div class="p-4 text-red-500 border border-red-200 rounded-lg bg-red-50">
          <p class="font-semibold">Error loading join requests</p>
          <p class="text-sm mt-1">${message}</p>
          <button onclick="location.reload()" class="mt-3 px-3 py-1 text-sm bg-red-600 text-white rounded hover:bg-red-700">
            <i class="fas fa-redo mr-1"></i>Reload
          </button>
        </div>
      `;
    }
    updateJoinRequestCounts(0);
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
// 🟢 Load Recent Task Activity (Last 10 completed tasks)
// =============================
async function loadRecentTaskActivity(handlerId) {
  const container = document.getElementById("recentTaskActivityList");
  if (!container) return;

  container.innerHTML = `<div class="text-center py-4 text-gray-500"><i class="fas fa-spinner fa-spin mr-2"></i>Loading recent activity...</div>`;

  try {
    // Get handler's fields first
    const fieldsQuery = query(
      collection(db, "fields"),
      where("userId", "==", handlerId)
    );
    const fieldsSnapshot = await getDocs(fieldsQuery);
    const fieldIds = fieldsSnapshot.docs.map(doc => doc.id);

    if (fieldIds.length === 0) {
      container.innerHTML = `
        <div class="text-center py-8">
          <i class="fas fa-map-marked-alt text-4xl text-gray-300 mb-3"></i>
          <p class="text-gray-500">No fields registered yet</p>
          <p class="text-sm text-gray-400 mt-1">Register a field to start tracking tasks</p>
        </div>
      `;
      return;
    }

    // Get recent completed tasks for handler's fields
    const tasksQuery = query(
      collection(db, "tasks"),
      where("handlerId", "==", handlerId),
      where("status", "==", "done"),
      orderBy("completedAt", "desc"),
      limit(10)
    );

    const tasksSnapshot = await getDocs(tasksQuery);

    if (tasksSnapshot.empty) {
      container.innerHTML = `
        <div class="text-center py-8">
          <i class="fas fa-check-circle text-4xl text-gray-300 mb-3"></i>
          <p class="text-gray-500">No completed tasks yet</p>
          <p class="text-sm text-gray-400 mt-1">Completed tasks will appear here</p>
        </div>
      `;
      return;
    }

    // Fetch user and field data for each task
    const tasksWithDetails = await Promise.all(
      tasksSnapshot.docs.map(async (taskDoc) => {
        const taskData = taskDoc.data();
        let workerName = "Unknown Worker";
        let fieldName = "Unknown Field";

        // Get worker name
        if (taskData.assignedTo && taskData.assignedTo.length > 0) {
          try {
            const workerId = taskData.assignedTo[0];
            const workerDoc = await getDoc(doc(db, "users", workerId));
            if (workerDoc.exists()) {
              const workerData = workerDoc.data();
              workerName = workerData.name || workerData.email || "Unknown Worker";
            }
          } catch (err) {
            console.error("Error fetching worker:", err);
          }
        }

        // Get field name
        if (taskData.fieldId) {
          try {
            const fieldDoc = await getDoc(doc(db, "fields", taskData.fieldId));
            if (fieldDoc.exists()) {
              fieldName = fieldDoc.data().fieldName || "Unknown Field";
            }
          } catch (err) {
            console.error("Error fetching field:", err);
          }
        }

        return {
          id: taskDoc.id,
          ...taskData,
          workerName,
          fieldName
        };
      })
    );

    // Render tasks
    container.innerHTML = tasksWithDetails.map(task => {
      const completedDate = task.completedAt?.toDate ? task.completedAt.toDate() : new Date();
      const timeAgo = getTimeAgo(completedDate);
      const taskName = getTaskDisplayName(task.taskName || task.task);

      // Get task type icon
      let taskIcon = 'fa-tasks';
      let iconColor = 'text-green-600';
      if (task.assignType === 'driver') {
        taskIcon = 'fa-truck';
        iconColor = 'text-blue-600';
      } else if (task.taskName?.includes('harvest')) {
        taskIcon = 'fa-cut';
        iconColor = 'text-orange-600';
      } else if (task.taskName?.includes('plant')) {
        taskIcon = 'fa-seedling';
        iconColor = 'text-green-700';
      } else if (task.taskName?.includes('fertil')) {
        taskIcon = 'fa-flask';
        iconColor = 'text-purple-600';
      }

      return `
        <div class="flex items-start gap-3 p-3 bg-white border border-gray-200 rounded-lg hover:shadow-sm transition-shadow">
          <div class="flex-shrink-0 w-10 h-10 bg-green-50 rounded-full flex items-center justify-center">
            <i class="fas ${taskIcon} ${iconColor}"></i>
          </div>
          <div class="flex-1 min-w-0">
            <div class="flex items-start justify-between gap-2">
              <div class="flex-1">
                <p class="text-sm font-semibold text-gray-900 truncate">${escapeHtml(taskName)}</p>
                <p class="text-xs text-gray-600 mt-0.5">
                  <i class="fas fa-user text-gray-400 mr-1"></i>${escapeHtml(task.workerName)}
                  <span class="mx-1">•</span>
                  <i class="fas fa-map-marker-alt text-gray-400 mr-1"></i>${escapeHtml(task.fieldName)}
                </p>
              </div>
              <span class="text-xs text-gray-500 whitespace-nowrap">${timeAgo}</span>
            </div>
            ${task.notes ? `<p class="text-xs text-gray-500 mt-1 line-clamp-1">${escapeHtml(task.notes)}</p>` : ''}
          </div>
        </div>
      `;
    }).join('');

  } catch (error) {
    console.error("Error loading recent task activity:", error);
    container.innerHTML = `
      <div class="text-center py-8">
        <i class="fas fa-exclamation-circle text-4xl text-red-300 mb-3"></i>
        <p class="text-red-600">Failed to load recent activity</p>
        <p class="text-sm text-gray-500 mt-1">${escapeHtml(error.message)}</p>
      </div>
    `;
  }
}

// Helper function to get time ago string
function getTimeAgo(date) {
  const now = new Date();
  const diffInSeconds = Math.floor((now - date) / 1000);

  if (diffInSeconds < 60) return 'Just now';
  if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)}m ago`;
  if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)}h ago`;
  if (diffInSeconds < 604800) return `${Math.floor(diffInSeconds / 86400)}d ago`;

  return date.toLocaleDateString();
}

function formatTimeAgo(timestamp) {
  return getTimeAgo(timestamp);
}

function getDriverStatusLabel(status) {
  const statusMap = {
    'preparing_to_load': 'Preparing to Load',
    'loading_at_warehouse': 'Loading at Warehouse',
    'en_route_to_field': 'En Route to Field',
    'arrived_at_field': 'Arrived at Field',
    'unloading_at_field': 'Unloading at Field',
    'completed_delivery': 'Completed Delivery',
    'returning_to_base': 'Returning to Base',
    'vehicle_breakdown': 'Vehicle Breakdown',
    'delayed': 'Delayed',
    'loading_cane_at_field': 'Loading Cane at Field',
    'en_route_to_mill': 'En Route to Mill',
    'arrived_at_mill': 'Arrived at Mill',
    'in_queue_at_mill': 'In Queue at Mill',
    'unloading_at_mill': 'Unloading at Mill',
    'returning_to_field': 'Returning to Field',
    'en_route_to_collection': 'En Route to Collection Point',
    'arrived_at_collection': 'Arrived at Collection Point',
    'in_queue': 'In Queue',
    'unloading': 'Unloading',
    'en_route_to_weighbridge': 'En Route to Weighbridge',
    'arrived_at_weighbridge': 'Arrived at Weighbridge',
    'weighing_in_progress': 'Weighing in Progress',
    'weight_recorded': 'Weight Recorded',
    'waiting_for_loading': 'Waiting for Loading',
    'scheduled': 'Scheduled',
    'in_progress': 'In Progress',
    'waiting_for_parts': 'Waiting for Parts',
    'inspection_complete': 'Inspection Complete',
    'maintenance_complete': 'Maintenance Complete',
    'en_route_to_fuel_station': 'En Route to Fuel Station',
    'arrived_at_fuel_station': 'Arrived at Fuel Station',
    'refueling': 'Refueling',
    'on_hold': 'On Hold',
    'completed': 'Completed',
    'issue_encountered': 'Issue Encountered'
  };
  return statusMap[status] || status.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
}

function getDriverStatusBadgeClass(status) {
  const statusLower = (status || '').toLowerCase();
  if (statusLower.includes('completed') || statusLower.includes('complete') || statusLower.includes('recorded')) {
    return 'bg-green-100 text-green-800';
  } else if (statusLower.includes('breakdown') || statusLower.includes('issue') || statusLower.includes('delayed')) {
    return 'bg-red-100 text-red-800';
  } else if (statusLower.includes('queue') || statusLower.includes('waiting') || statusLower.includes('hold')) {
    return 'bg-yellow-100 text-yellow-800';
  } else {
    return 'bg-blue-100 text-blue-800';
  }
}

// Helper function to get task display name
function getTaskDisplayName(taskValue) {
  const taskMap = {
    // Worker tasks
    'plowing': 'Plowing',
    'harrowing': 'Harrowing',
    'furrowing': 'Furrowing',
    'planting': 'Planting Sugarcane',
    'basal_fertilization': 'Basal Fertilization',
    'main_fertilization': 'Main/Top Fertilization',
    'weeding': 'Weeding',
    'pest_control': 'Pest Control',
    'irrigation': 'Irrigation',
    'harvesting': 'Harvesting',
    'ratooning': 'Ratooning',

    // Driver tasks
    'transport_materials': 'Transport Materials to Field',
    'transport_fertilizer': 'Transport Fertilizer to Field',
    'transport_equipment': 'Transport Equipment to Field',
    'pickup_harvested_cane': 'Pickup Harvested Sugarcane',
    'transport_cane_to_mill': 'Transport Cane to Mill',
    'deliver_to_collection': 'Deliver to Collection Points',
    'weighbridge_documentation': 'Weighbridge Documentation',
    'load_cane': 'Load Sugarcane onto Vehicle',
    'unload_cane': 'Unload Sugarcane',
    'vehicle_maintenance': 'Vehicle Maintenance/Inspection',
    'fuel_refill': 'Fuel Refill/Management',
    'route_planning': 'Route Planning and Coordination'
  };

  return taskMap[taskValue] || taskValue;
}

// =============================
// 🟢 Auth Check
// =============================
let unsubscribeJoinRequests = null;

function setupJoinRequestsListener(handlerId) {
  if (!handlerId) return;

  // Unsubscribe from previous listener if exists
  if (unsubscribeJoinRequests) {
    unsubscribeJoinRequests();
    unsubscribeJoinRequests = null;
  }

  try {
    // Listen to field_joins for this handler's requests for real-time updates
    const joinFieldsQuery = query(
      collection(db, "field_joins"),
      where("handlerId", "==", handlerId)
    );
    unsubscribeJoinRequests = onSnapshot(joinFieldsQuery, async (snapshot) => {
      console.log('🔄 Join requests updated in real-time');
      await loadJoinRequests(handlerId);
    }, (error) => {
      console.error('Error in join requests listener:', error);
    });
  } catch (err) {
    console.error('Failed to set up join requests listener:', err);
  }
}

// ✅ Prevent double initialization on auth state changes
let isInitialized = false;
let currentUserId = null;

onAuthStateChanged(auth, async (user) => {
  if (!user) return (window.location.href = "../../frontend/Common/farmers_login.html");

  // ✅ Prevent re-initialization for same user (fixes double rendering in production)
  if (isInitialized && currentUserId === user.uid) {
    console.log('⏭️ Dashboard already initialized for this user, skipping...');
    return;
  }

  // ✅ Cleanup all listeners before re-initializing for a different user
  if (isInitialized && currentUserId !== user.uid) {
    console.log('🔄 User changed, cleaning up previous listeners...');
    if (notificationsUnsub) notificationsUnsub();
    if (activeWorkersUnsub) activeWorkersUnsub();
    if (pendingTasksUnsub) pendingTasksUnsub();
    if (taskWarningsUnsub) taskWarningsUnsub();
    if (unsubscribeJoinRequests) unsubscribeJoinRequests();
    if (tasksUnsubscribe) tasksUnsubscribe();
    isInitialized = false;
  }

  currentUserId = user.uid;

  // ✅ SECURITY: Verify user has handler role before allowing access
  try {
    const userDoc = await getDoc(doc(db, "users", user.uid));
    if (!userDoc.exists()) {
      console.error("❌ User document not found");
      window.location.href = "../../frontend/Common/lobby.html";
      return;
    }

    const userData = userDoc.data();
    const userRole = (userData.role || '').toLowerCase();

    // Only handlers can access this dashboard
    if (userRole !== 'handler') {
      console.warn(`⚠️ Access denied: User role is "${userRole}", not "handler"`);
      alert(`Access Denied

This dashboard is only for Handlers.
Your current role: ${userRole}

Please register a field and wait for SRA approval to become a Handler.`);
      window.location.href = "../../frontend/Common/lobby.html";
      return;
    }

    console.log('✅ Handler access verified');
  } catch (error) {
    console.error("❌ Role verification error:", error);
    window.location.href = "../../frontend/Common/lobby.html";
    return;
  }

  loadUserProfile(user);
  loadJoinRequests(user.uid);
loadRecentTaskActivity(user.uid);
setupRecentTaskActivityListener(user.uid);
  setupJoinRequestsListener(user.uid);
  initNotifications(user.uid);
loadActivityLogs(user.uid);
setupActivityLogsListener(user.uid);

  // REQ-3: Initialize dashboard statistics with realtime listeners
  initActiveWorkersMetric(user.uid);
  initPendingTasksMetric(user.uid);
  initUnreadNotificationsMetric(user.uid);

  // Initialize task warnings system
  initTaskWarningsSystem(user.uid);

  // REQ-4: Initialize tasks section
  initializeTasksSection(user.uid);

  // ✅ Mark as initialized
  isInitialized = true;
  console.log('✅ Dashboard fully initialized');
});

// Add refresh button event listener for join requests
document.addEventListener("DOMContentLoaded", () => {
  const refreshBtn = document.getElementById("refreshJoinRequests");
  if (refreshBtn) {
    refreshBtn.addEventListener("click", async () => {
      const user = auth.currentUser;
      if (!user) return;

      refreshBtn.disabled = true;
      const icon = refreshBtn.querySelector("i");
      if (icon) icon.classList.add("fa-spin");

      try {
        await loadJoinRequests(user.uid);
      } catch (err) {
        console.error("Error refreshing join requests:", err);
      } finally {
        refreshBtn.disabled = false;
        if (icon) icon.classList.remove("fa-spin");
      }
    });
  }

  // Add refresh button event listener for recent task activity
  const refreshTaskActivityBtn = document.getElementById("refreshTaskActivity");
  if (refreshTaskActivityBtn) {
    refreshTaskActivityBtn.addEventListener("click", async () => {
      const user = auth.currentUser;
      if (!user) return;

      refreshTaskActivityBtn.disabled = true;
      const icon = refreshTaskActivityBtn.querySelector("i");
      if (icon) icon.classList.add("fa-spin");

      try {
        await loadRecentTaskActivity(user.uid);
      } catch (err) {
        console.error("Error refreshing task activity:", err);
      } finally {
        refreshTaskActivityBtn.disabled = false;
        if (icon) icon.classList.remove("fa-spin");
      }
    });
  }
});

/* ====== loadActivityLogs + helpers (replace existing loadActivityLogs in dashboard.js) ====== */

async function loadActivityLogs(handlerId) {
  const container = document.getElementById("activityLogsContainer");
  if (!container) return;

  // show loading
  container.innerHTML = `
    <div class="text-center py-6 text-gray-500">
      <i class="fas fa-spinner fa-spin mr-2"></i>Loading activity logs...
    </div>
  `;

  try {
    // 1) get handler's fields
    const fieldsQuery = query(collection(db, "fields"), where("userId", "==", handlerId));
    const fieldsSnap = await getDocs(fieldsQuery);
    const handlerFields = fieldsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    const fieldIds = handlerFields.map(f => f.id);

    if (fieldIds.length === 0) {
      container.innerHTML = `
        <div class="text-center py-6 text-gray-500">
          <i class="fas fa-map-marker-alt text-4xl text-gray-300 mb-3"></i>
          No fields found.
        </div>
      `;
      return;
    }

    // Populate Field filter dropdown + mapping
    populateFieldFilter(handlerFields);

    // For user & type dropdowns we'll collect unique values as we fetch logs
    let logs = [];

    // chunk helper for Firestore IN queries
    const chunk = (arr, size) =>
      arr.length > size ? [arr.slice(0, size), ...chunk(arr.slice(size), size)] : [arr];

    const fieldChunks = chunk(fieldIds, 10);

    // 2) fetch worker logs (task_logs)
    for (const group of fieldChunks) {
      const wq = query(collection(db, "task_logs"), where("field_id", "in", group), orderBy("logged_at", "desc"));
      const ws = await getDocs(wq);
      logs.push(
        ...ws.docs.map(d => {
          const data = d.data();
          return {
            id: d.id,
            source: "task_logs",
            type: "worker",
            task_name: data.task_name || data.task || "Worker Task",
            user_id: data.user_uid || data.user_id || data.user || null,
            user_name: data.worker_name || data.worker || data.userName || "",
            task_type: data.task_name || data.task || "",
            description: data.description || "",
            field_id: data.field_id || data.fieldId || null,
            field_name: data.field_name || data.fieldName || "",
            logged_at: data.logged_at || null,
            selfie_path: data.selfie_path || null,
            field_photo_path: data.field_photo_path || null
          };
        })
      );
    }

    // 3) fetch driver logs (tasks with taskType = 'driver_log')
    for (const group of fieldChunks) {
      const dq = query(
        collection(db, "tasks"),
        where("fieldId", "in", group),
        where("taskType", "==", "driver_log"),
        orderBy("completedAt", "desc")
      );
      const ds = await getDocs(dq);
      logs.push(
        ...ds.docs.map(d => {
          const data = d.data();
          return {
            id: d.id,
            source: "tasks",
            type: "driver",
            task_name: data.title || data.description || data.details || "Driver Activity",
            user_id: (Array.isArray(data.assignedTo) && data.assignedTo[0]) || data.createdBy || data.created_by || null,
            user_name: data.driverName || data.driver_name || "",
            task_type: data.title || data.details || data.taskType || "",
            description: data.details || data.notes || data.description || "",
            field_id: data.fieldId || null,
            field_name: data.fieldName || data.field_name || "",
            logged_at: data.completedAt || data.createdAt || null,
            selfie_path: null,
            field_photo_path: data.photoURL || data.photo || null
          };
        })
      );
    }

// UI DISPLAY SORT — newest → oldest (NO GROUPING)
logs.sort((a, b) => {
  const ta = a.logged_at && a.logged_at.toMillis
    ? a.logged_at.toMillis()
    : (a.logged_at ? new Date(a.logged_at).getTime() : 0);

  const tb = b.logged_at && b.logged_at.toMillis
    ? b.logged_at.toMillis()
    : (b.logged_at ? new Date(b.logged_at).getTime() : 0);

  return tb - ta;  
});

    // Save logs in-memory on window so filters/buttons can access
    window.__activityLogsCache = logs;

    // Populate user and type filters
    populateUserAndTypeFilters(logs);

    
    // Render initial UI (unfiltered)
    renderActivityLogs(logs);

    // wire up filter and export buttons (first load only)
    setupActivityLogsControls();

  } catch (err) {
    console.error("Activity Logs Error:", err);
    container.innerHTML = `
      <div class="text-center py-6 text-red-600">
        Failed to load activity logs.
      </div>
    `;
  }
}

/* ===== Helpers ===== */

function populateFieldFilter(handlerFields = []) {
  const sel = document.getElementById("filterField");
  if (!sel) return;
  sel.innerHTML = `<option value="all">All fields</option>`;
  handlerFields.forEach(f => {
    const name = f.field_name || f.fieldName || f.name || `Field ${f.id}`;
    const opt = document.createElement("option");
    opt.value = f.id;
    opt.textContent = name;
    sel.appendChild(opt);
  });
}

function populateUserAndTypeFilters(logs = []) {
  const userSel = document.getElementById("filterUser");
  const typeSel = document.getElementById("filterType");
  if (!userSel || !typeSel) return;

  const users = new Map();
  const types = new Set();

  logs.forEach(l => {
    if (l.user_id) users.set(l.user_id, l.user_name || l.user_id);
    if (l.task_type && l.task_type !== "driver_log") {
    types.add(l.task_type);
}
  });

  userSel.innerHTML = `<option value="all">All users</option>`;
  Array.from(users.entries()).sort((a,b) => a[1].localeCompare(b[1])).forEach(([uid, name]) => {
    const o = document.createElement("option");
    o.value = uid;
    o.textContent = name;
    userSel.appendChild(o);
  });

  typeSel.innerHTML = `<option value="all">All task types</option>`;
  Array.from(types).sort().forEach(t => {
    const o = document.createElement("option");
    o.value = t;
    o.textContent = t;
    typeSel.appendChild(o);
  });
}

function renderActivityLogs(logs = []) {
  const container = document.getElementById("activityLogsContainer");
  if (!container) return;

  if (!logs.length) {
    container.innerHTML = `
      <div class="text-center py-6 text-gray-500">
        <i class="fas fa-clipboard text-4xl text-gray-300 mb-3"></i>
        No activity logs yet.
      </div>
    `;
    return;
  }

  container.innerHTML = logs.map(log => {
    const date = (log.logged_at && log.logged_at.toDate) ? log.logged_at.toDate().toLocaleString() :
                 (log.logged_at ? new Date(log.logged_at).toLocaleString() : "—");

    const tag = log.type === "driver"
      ? `<span class="px-2 py-1 text-xs bg-blue-100 text-blue-700 rounded">Driver</span>`
      : `<span class="px-2 py-1 text-xs bg-green-100 text-green-700 rounded">Worker</span>`;

    return `
      <div class="bg-white border border-gray-200 rounded-lg p-4 shadow mb-3">
        <div class="flex justify-between items-start">
          <h3 class="font-semibold text-gray-900">${escapeHtml(log.task_name)}</h3>
          <div class="flex items-center gap-2">
            ${tag}
            <span class="text-xs text-gray-500">${escapeHtml(date)}</span>
          </div>
        </div>

        <p class="text-sm text-gray-600 mt-1">
          <i class="fas fa-user mr-1"></i> ${escapeHtml(log.user_name || "Unknown")}
        </p>

        <p class="text-sm text-gray-600">
          <i class="fas fa-map-marker-alt mr-1"></i> ${escapeHtml(log.field_name || "Unknown Field")}
        </p>

        ${log.description ? `<p class="text-sm text-gray-700 mt-2">${escapeHtml(log.description)}</p>` : ""}

        <div class="flex gap-3 mt-3 text-sm">
          ${log.selfie_path ? `<a href="${log.selfie_path}" target="_blank" class="text-blue-600 hover:underline">Selfie</a>` : ""}
          ${log.field_photo_path ? `<a href="${log.field_photo_path}" target="_blank" class="text-blue-600 hover:underline">Field Photo</a>` : ""}
        </div>
      </div>
    `;
  }).join("");
}



/* Filter application (reads controls -> filters cache -> renders) */
function applyActivityFilters() {
  const logs = window.__activityLogsCache || [];
  let filtered = logs.slice();

  const fieldVal = (document.getElementById("filterField") || {}).value || "all";
  const roleVal = (document.getElementById("filterRole") || {}).value || "all";
  const userVal = (document.getElementById("filterUser") || {}).value || "all";
  const typeVal = (document.getElementById("filterType") || {}).value || "all";
  const startVal = (document.getElementById("filterStartDate") || {}).value;
  const endVal = (document.getElementById("filterEndDate") || {}).value;

  if (fieldVal && fieldVal !== "all") {
    filtered = filtered.filter(l => l.field_id === fieldVal);
  }
  if (roleVal && roleVal !== "all") {
    filtered = filtered.filter(l => (l.type || "").toLowerCase() === roleVal.toLowerCase());
  }
  if (userVal && userVal !== "all") {
    filtered = filtered.filter(l => (l.user_id || "") === userVal);
  }
  if (typeVal && typeVal !== "all") {
    filtered = filtered.filter(l => (l.task_type || "").toLowerCase() === typeVal.toLowerCase());
  }

  // date filtering (inclusive)
  if (startVal) {
    const startTs = new Date(startVal);
    filtered = filtered.filter(l => {
      const t = l.logged_at && l.logged_at.toMillis ? l.logged_at.toDate() : (l.logged_at ? new Date(l.logged_at) : null);
      return t ? t >= startTs : false;
    });
  }
  if (endVal) {
    const endTs = new Date(endVal);
    endTs.setHours(23,59,59,999);
    filtered = filtered.filter(l => {
      const t = l.logged_at && l.logged_at.toMillis ? l.logged_at.toDate() : (l.logged_at ? new Date(l.logged_at) : null);
      return t ? t <= endTs : false;
    });
  }

  // render filtered
  renderActivityLogs(filtered);

  // prepare printable table area also
  preparePrintableActivityTable(filtered);
}

/* Clear filters */
function clearActivityFilters() {
  const ids = ["filterField","filterRole","filterUser","filterType","filterStartDate","filterEndDate"];
  ids.forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    if (el.tagName === "SELECT") el.value = "all";
    else el.value = "";
  });
  applyActivityFilters();
}

/* Preset date helpers */
function applyPreset(preset) {
  const start = document.getElementById("filterStartDate");
  const end = document.getElementById("filterEndDate");
  const now = new Date();
  if (!start || !end) return;

  if (preset === "today") {
    const s = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const e = new Date(s); e.setHours(23,59,59,999);
    start.value = s.toISOString().slice(0,10);
    end.value = e.toISOString().slice(0,10);
  } else if (preset === "thisWeek") {
    const day = now.getDay();
    const diffStart = now.getDate() - day + (day === 0 ? -6 : 1);
    const s = new Date(now.getFullYear(), now.getMonth(), diffStart);
    const e = new Date(s); e.setDate(s.getDate() + 6);
    start.value = s.toISOString().slice(0,10);
    end.value = e.toISOString().slice(0,10);
  } else if (preset === "thisMonth") {
    const s = new Date(now.getFullYear(), now.getMonth(), 1);
    const e = new Date(now.getFullYear(), now.getMonth()+1, 0);
    start.value = s.toISOString().slice(0,10);
    end.value = e.toISOString().slice(0,10);
  }
  applyActivityFilters();
}

/* Prepare printable table in #activityLogsPrintArea */
function preparePrintableActivityTable(logs = []) {

    logs.sort((a, b) => {
    const nameA = (a.user_name || "").toLowerCase();
    const nameB = (b.user_name || "").toLowerCase();

    // group alphabetically A → Z
    if (nameA < nameB) return -1;
    if (nameA > nameB) return 1;

    // same person → newest → oldest
    const ta = a.logged_at && a.logged_at.toMillis
      ? a.logged_at.toMillis()
      : (a.logged_at ? new Date(a.logged_at).getTime() : 0);

    const tb = b.logged_at && b.logged_at.toMillis
      ? b.logged_at.toMillis()
      : (b.logged_at ? new Date(b.logged_at).getTime() : 0);

    return tb - ta;
  });
  const printArea = document.getElementById("activityLogsPrintArea") || (function(){
    const div = document.createElement('div');
    div.id = 'activityLogsPrintArea';
    div.style.display = 'none';
    document.body.appendChild(div);
    return div;
  })();
  if (!logs.length) {
    printArea.innerHTML = "<div>No activity logs</div>";
    return;
  }

  // create a simple table
  const rows = logs.map(l => {
    const date = (l.logged_at && l.logged_at.toDate) ? l.logged_at.toDate().toLocaleString() :
                 (l.logged_at ? new Date(l.logged_at).toLocaleString() : "");
    return `<tr>
      <td>${escapeHtml(l.user_name || "")}</td>
      <td>${escapeHtml(l.type)}</td>
      <td>${escapeHtml(l.task_name || "")}</td>
      <td>${escapeHtml(l.field_name || "")}</td>
      <td>${escapeHtml(date)}</td>
      <td>${escapeHtml(l.description || "")}</td>
    </tr>`;
  }).join("");

  printArea.innerHTML = `
    <table border="1" cellpadding="6" cellspacing="0" style="border-collapse:collapse;width:100%;font-size:12px;">
      <thead>
        <tr style="background:#f7fafc;">
          <th>Farmer Name</th><th>Role</th><th>Task</th><th>Field</th><th>Date</th><th>Description</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  `;
}

/* Export CSV using printable table data */
async function exportActivityCSV() {
  // Show loading animation
  const exportBtn = document.getElementById("exportActivityCSV");
  const originalContent = exportBtn ? exportBtn.innerHTML : '';
  if (exportBtn) {
    exportBtn.disabled = true;
    exportBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Exporting...';
  }

  try {
    const printArea = document.getElementById("activityLogsPrintArea");

    const title = getActivityLogDateLabel();

    let csvRows = [];
    csvRows.push(`"${title}"`);
    csvRows.push('"Farmer Name","Role","Task","Field","Date","Description"');


    if (printArea && printArea.querySelector("tbody")) {
      const trs = printArea.querySelectorAll("tbody tr");
      trs.forEach(tr => {
        const vals = Array.from(tr.children).map(td => `"${td.textContent.replace(/"/g,'""')}"`);
        csvRows.push(vals.join(","));
      });
    } else {
      const logs = window.__activityLogsCache || [];
      logs.forEach(l => {
        const date = (l.logged_at && l.logged_at.toDate)
          ? l.logged_at.toDate().toLocaleString()
          : (l.logged_at ? new Date(l.logged_at).toLocaleString() : "");

        csvRows.push([
          l.user_name,
          l.type,
          l.task_name,
          l.field_name,
          date,
          l.description
        ].map(s => `"${(s||"").toString().replace(/"/g,'""')}"`).join(","));
      });
    }

    const csv = csvRows.join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    
    // sanitize title for filename
    const safeTitle = title.replace(/[^a-zA-Z0-9()\- ]/g, "");
    const filename = `${safeTitle}.csv`;

    // Use Android-compatible download
    const { downloadFile } = await import('../Common/android-download.js');
    await downloadFile(blob, filename);
    
    // Small delay to ensure download starts before hiding animation
    await new Promise(resolve => setTimeout(resolve, 500));
  } catch (error) {
    console.error('Error exporting CSV:', error);
    alert('Failed to export CSV. Please try again.');
  } finally {
    // Hide loading animation
    if (exportBtn) {
      exportBtn.disabled = false;
      exportBtn.innerHTML = originalContent;
    }
  }
}


function getActivityLogDateLabel() {
  const start = document.getElementById("filterStartDate")?.value;
  const end = document.getElementById("filterEndDate")?.value;

  // No date filters → Full log label
  if (!start && !end) {
    return "Activity Log (All Records)";
  }

  function format(d) {
    const dt = new Date(d);
    return dt.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric"
    });
  }

  if (start && !end) {
    return `Activity Log (${format(start)} – Present)`;
  }
  if (!start && end) {
    return `Activity Log (Until ${format(end)})`;
  }

  // start + end available
  return `Activity Log (${format(start)} – ${format(end)})`;
}

/* Print logs (open print dialog for the printable table) */
function printActivityLogs() {
  const printArea = document.getElementById("activityLogsPrintArea");
  if (!printArea) return;

  const title = getActivityLogDateLabel();

  const w = window.open("", "_blank");
  const html = `
    <html>
      <head>
        <title>${title}</title>
        <style>
          body { font-family: Arial, sans-serif; padding: 12px; color: #222; }
          table { width: 100%; border-collapse: collapse; font-size: 12px; }
          table th, table td { border: 1px solid #ddd; padding: 6px; text-align: left; }
          table thead { background: #f3f4f6; }
        </style>
      </head>
      <body>
        <h3>${title}</h3>
        ${printArea.innerHTML}
      </body>
    </html>
  `;
  w.document.write(html);
  w.document.close();
  w.focus();
  setTimeout(() => {
    w.print();
    w.close();
  }, 500);
}


/* Wire up controls (idempotent) */
function setupActivityLogsControls() {
  if (window.__activityLogsControlsInited) return;
  window.__activityLogsControlsInited = true;

  const applyBtn = document.getElementById("applyActivityFilters");
  const clearBtn = document.getElementById("clearActivityFilters");
  const exportBtn = document.getElementById("exportActivityCSV");
  const printBtn = document.getElementById("printActivityLogs");
  const pToday = document.getElementById("presetToday");
  const pWeek = document.getElementById("presetThisWeek");
  const pMonth = document.getElementById("presetThisMonth");

  if (applyBtn) applyBtn.addEventListener("click", applyActivityFilters);
  if (clearBtn) clearBtn.addEventListener("click", clearActivityFilters);
  if (exportBtn) exportBtn.addEventListener("click", () => exportActivityCSV());
  if (printBtn) printBtn.addEventListener("click", () => {
    applyActivityFilters();
    printActivityLogs();
  });
  if (pToday) pToday.addEventListener("click", () => applyPreset("today"));
  if (pWeek) pWeek.addEventListener("click", () => applyPreset("thisWeek"));
  if (pMonth) pMonth.addEventListener("click", () => applyPreset("thisMonth"));

  // prepare initial printable table for empty/default state
  applyActivityFilters();
}


const refreshActivityBtn = document.getElementById("refreshActivityLogs");
if (refreshActivityBtn) {
    refreshActivityBtn.addEventListener("click", async () => {
        const user = auth.currentUser;
        refreshActivityBtn.disabled = true;
        await loadActivityLogs(user.uid);
        refreshActivityBtn.disabled = false;
    });
}


document.addEventListener("DOMContentLoaded", () => {
  const dropdownBtn = document.getElementById("profileDropdownBtn");
  const dropdownMenu = document.getElementById("profileDropdown");
  if (dropdownBtn && dropdownMenu) {
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
  }

  const navItems = Array.from(document.querySelectorAll(".nav-item[data-section]"));
  const sections = Array.from(document.querySelectorAll(".content-section"));
  const dashboardPanel = document.getElementById("dashboard");

  // Sections that need to be loaded dynamically
  // Note: 'tasks' is hardcoded in dashboard.html, not dynamically loaded
  const dynamicSections = {
    'fields': 'sections/fields.html',
    'workers': 'sections/workers.html',
    'analytics': 'sections/analytics.html',
    'reports': 'sections/reports.html',
    'rentDriver': 'sections/rent-driver.html'
  };

  // Track loaded sections
  const loadedSections = new Set();

  // Load section content dynamically
  async function loadSection(sectionId) {
    if (loadedSections.has(sectionId)) {
      console.log(`✅ Section "${sectionId}" already loaded, skipping`);
      return true;
    }

    if (!dynamicSections[sectionId]) {
      return true;
    }

    console.log(`📥 Loading section "${sectionId}" for the first time...`);
    const container = document.getElementById(sectionId);
    if (!container) return false;

    try {
      const sectionUrl = dynamicSections[sectionId];
      const cacheBuster = `?v=${Date.now()}`;
      const response = await fetch(`${sectionUrl}${cacheBuster}`, { cache: 'no-store' });

      if (!response.ok) throw new Error(`Failed to load ${sectionId}`);
      const html = await response.text();

      // ✅ Extract body content and styles, but skip duplicate Font Awesome links
      const parser = new DOMParser();
      const doc = parser.parseFromString(html, 'text/html');
      const bodyContent = doc.body.innerHTML;

      container.innerHTML = bodyContent;

      // ✅ Inject section-specific styles (but skip Font Awesome to prevent duplicates)
      const styles = doc.head.querySelectorAll('style');
      styles.forEach(oldStyle => {
        const newStyle = document.createElement('style');
        newStyle.textContent = oldStyle.textContent;
        // Add a data attribute to track which section this style belongs to
        newStyle.setAttribute('data-section', sectionId);
        document.head.appendChild(newStyle);
      });

      // ✅ Execute any script tags from the body
      const scripts = doc.body.querySelectorAll('script');
      scripts.forEach(oldScript => {
        const newScript = document.createElement('script');
        Array.from(oldScript.attributes).forEach(attr => {
          newScript.setAttribute(attr.name, attr.value);
        });
        newScript.textContent = oldScript.textContent;
        container.appendChild(newScript);
      });

      loadedSections.add(sectionId);
      
      // Initialize fields map after loading fields section
      if (sectionId === 'fields') {
        console.log('🗺️ Fields section loaded, initializing map...');
        setTimeout(() => {
          initializeFieldsSection();
        }, 100);
      }

      // Initialize rent driver when it's loaded
      if (sectionId === 'rentDriver') {
          console.log('🚚 Rent Driver section loaded, initializing UI...');
          initializeRentDriverSection();
      }

      if (sectionId === 'workers') {
        console.log('👥 Workers section loaded, initializing scripts...');
        setTimeout(() => {
          initializeHandlerWorkersSection();
        }, 50);
      }

      if (sectionId === 'analytics') {
        console.log('📊 Analytics section loaded, initializing...');
        setTimeout(() => {
          if (window.initializeAnalytics) {
            window.initializeAnalytics();
          }
        }, 100);
      }

      return true;
    } catch (error) {
      console.error(`Error loading section ${sectionId}:`, error);
      container.innerHTML = '<div class="p-6 text-center text-red-600">Failed to load section. Please refresh the page.</div>';
      return false;
    }
  }

  const setActiveSection = async (sectionId) => {
    // Load section if it's dynamic and not yet loaded
    if (dynamicSections[sectionId]) {
      await loadSection(sectionId);
    }

    sections.forEach(section => {
      if (!section) return;
      if (section.id === sectionId) {
        section.classList.remove("hidden");
      } else if (section !== dashboardPanel) {
        section.classList.add("hidden");
      }
    });

    if (dashboardPanel) {
      if (sectionId === "dashboard") {
        dashboardPanel.classList.remove("hidden");
      } else {
        dashboardPanel.classList.add("hidden");
      }
    }

    navItems.forEach(item => {
      if (!item) return;
      if (item.dataset.section === sectionId) {
        item.classList.add("bg-gray-800", "text-white");
        item.classList.remove("text-gray-300");
      } else {
        item.classList.remove("bg-gray-800", "text-white");
        item.classList.add("text-gray-300");
      }
    });
  };

  navItems.forEach(item => {
    item.addEventListener("click", (event) => {
      event.preventDefault();
      const target = event.currentTarget;
      if (!target || !target.dataset.section) return;
      setActiveSection(target.dataset.section);
    });
  });

  setActiveSection("dashboard");
});

async function loadReviewedOwnedFields(userId) {
  try {
    // ✅ Simple query - get all fields owned by this user
    const q = query(
      collection(db, "fields"),
      where("userId", "==", userId)
    );
    const snap = await getDocs(q);

    const total = snap.size;

    // Count pending fields (status === 'pending')
    let pendingCount = 0;
    snap.forEach(doc => {
      const status = doc.data().status || 'pending';
      if (status === 'pending') {
        pendingCount++;
      }
    });

    // Update UI
    const mFields = document.getElementById("mFields");
    const mPendingFields = document.getElementById("mPendingFields");

    if (mFields) mFields.textContent = total;
    if (mPendingFields) mPendingFields.textContent = pendingCount;

    console.log(`📊 Handler Fields: ${total} total, ${pendingCount} pending review`);
  } catch (err) {
    console.error("❌ Field count error:", err);
    const mFields = document.getElementById("mFields");
    const mPendingFields = document.getElementById("mPendingFields");
    if (mFields) mFields.textContent = "0";
    if (mPendingFields) mPendingFields.textContent = "0";
  }
}

// =============================
// 📊 REQ-3: Dashboard Statistics with Realtime Listeners
// =============================

let activeWorkersUnsub = null;
let pendingTasksUnsub = null;
let unreadNotificationsUnsub = null;

/**
 * Active Workers Count: Count distinct userIds from tasks where:
 * - handlerId matches current user
 * - assignedTo contains worker role users
 * - status is 'pending'
 */
function initActiveWorkersMetric(handlerId) {
  console.log(`🔧 initActiveWorkersMetric called with handlerId: ${handlerId}`);
  const mWorkers = document.getElementById("mWorkers");
  if (!mWorkers) {
    console.error("❌ mWorkers element not found!");
    return;
  }
  console.log("✅ mWorkers element found");

  // Cleanup previous listener
  if (activeWorkersUnsub) activeWorkersUnsub();

  try {
    console.log("📡 Setting up Active Workers listener...");
    const tasksQuery = query(
      collection(db, "tasks"),
      where("handlerId", "==", handlerId),
      where("status", "==", "pending")
    );

    activeWorkersUnsub = onSnapshot(tasksQuery, (snapshot) => {
      console.log(`📋 Found ${snapshot.docs.length} pending tasks for handler`);
      const uniqueWorkers = new Set();

      snapshot.forEach((doc) => {
        const data = doc.data();
        console.log(`  - Task ${doc.id}:`, {
          status: data.status,
          assignedTo: data.assignedTo,
          handlerId: data.handlerId
        });
        const assignedTo = data.assignedTo || [];

        // Add all assigned workers to the set (Set automatically handles duplicates)
        if (Array.isArray(assignedTo)) {
          assignedTo.forEach(userId => uniqueWorkers.add(userId));
        }
      });

      const count = uniqueWorkers.size;
      mWorkers.textContent = count;
      console.log(`📊 Active Workers: ${count} unique workers from ${snapshot.docs.length} tasks`);
    }, (error) => {
      console.error("❌ Active Workers Listener Error:", error);
      mWorkers.textContent = "0";
    });
  } catch (err) {
    console.error("❌ Active Workers Init Error:", err);
    mWorkers.textContent = "0";
  }
}

/**
 * Pending Tasks Count: Count documents in tasks where:
 * - handlerId matches current user
 * - status equals 'pending'
 */
function initPendingTasksMetric(handlerId) {
  console.log(`🔧 initPendingTasksMetric called with handlerId: ${handlerId}`);
  const mTasks = document.getElementById("mTasks");
  if (!mTasks) {
    console.error("❌ mTasks element not found!");
    return;
  }
  console.log("✅ mTasks element found");

  // Cleanup previous listener
  if (pendingTasksUnsub) pendingTasksUnsub();

  try {
    console.log("📡 Setting up Pending Tasks listener...");
    const tasksQuery = query(
      collection(db, "tasks"),
      where("handlerId", "==", handlerId),
      where("status", "==", "pending")
    );

    pendingTasksUnsub = onSnapshot(tasksQuery, (snapshot) => {
      const count = snapshot.size;
      console.log(`📋 Found ${count} pending tasks for handler ${handlerId}`);

      snapshot.forEach((doc) => {
        const data = doc.data();
        console.log(`  - Task ${doc.id}:`, {
          status: data.status,
          handlerId: data.handlerId,
          title: data.title,
          assignedTo: data.assignedTo
        });
      });

      mTasks.textContent = count;
      console.log(`📊 Pending Tasks: ${count}`);
    }, (error) => {
      console.error("❌ Pending Tasks Listener Error:", error);
      mTasks.textContent = "0";
    });
  } catch (err) {
    console.error("❌ Pending Tasks Init Error:", err);
    mTasks.textContent = "0";
  }
}

/**
 * Unread Notifications: Count notifications where:
 * - userId matches current user
 * - read is false
 * Note: This already exists in the notification bell, but we add it to metrics too
 */
function initUnreadNotificationsMetric(userId) {
  const badge = document.getElementById("notificationBadge");
  if (!badge) return;

  // This is already handled by initNotifications, but we ensure it's visible
  // The notification system already uses onSnapshot, so we just rely on that
  console.log(`📊 Unread Notifications tracking enabled via notification bell`);
}

// =============================
// ⚠️ Task Warnings System - Detect Overdue Critical Tasks
// =============================

let taskWarningsUnsub = null;

/**
 * Initialize task warnings system to alert handlers about:
 * - Overdue critical tasks (Main Fertilization 45-60 DAP, Harvesting)
 * - Tasks due within 5 days
 */
async function initTaskWarningsSystem(handlerId) {
  console.log(`⚠️ Initializing task warnings system for handler ${handlerId}`);

  const warningsPanel = document.getElementById("taskWarningsPanel");
  const warningsList = document.getElementById("taskWarningsList");
  const dismissBtn = document.getElementById("dismissWarnings");

  if (!warningsPanel || !warningsList) {
    console.warn("⚠️ Task warnings panel elements not found");
    return;
  }

  // Cleanup previous listener
  if (taskWarningsUnsub) taskWarningsUnsub();

  // Dismiss button handler
  if (dismissBtn) {
    dismissBtn.onclick = () => {
      warningsPanel.classList.add("hidden");
      sessionStorage.setItem("taskWarningsDismissed", "true");
    };
  }

  try {
    // Query all pending tasks for this handler
    const tasksQuery = query(
      collection(db, "tasks"),
      where("handlerId", "==", handlerId),
      where("status", "==", "pending")
    );

    taskWarningsUnsub = onSnapshot(tasksQuery, async (snapshot) => {
      console.log(`⚠️ Checking ${snapshot.size} pending tasks for warnings`);

      const warnings = [];
      const fieldCache = new Map(); // Cache field data

      // Helper to get field data
      const getFieldData = async (fieldId) => {
        if (fieldCache.has(fieldId)) return fieldCache.get(fieldId);
        try {
          const fieldSnap = await getDoc(doc(db, "fields", fieldId));
          if (fieldSnap.exists()) {
            const data = fieldSnap.data();
            fieldCache.set(fieldId, data);
            return data;
          }
        } catch (err) {
          console.error(`Failed to fetch field ${fieldId}:`, err);
        }
        return null;
      };

      // Process each task
      for (const taskDoc of snapshot.docs) {
        const task = taskDoc.data();
        const taskId = taskDoc.id;
        const fieldId = task.fieldId;

        if (!fieldId) continue;

        // Get field data to check DAP
        const fieldData = await getFieldData(fieldId);
        if (!fieldData) continue;

        const plantingDate = fieldData.plantingDate;
        if (!plantingDate) continue;

        // Calculate current DAP
        const currentDAP = calculateDAP(plantingDate);
        if (currentDAP === null) continue;

        const taskType = task.taskType || "";
        const taskTitle = task.title || taskType || "Untitled Task";
        const fieldName = fieldData.field_name || fieldData.fieldName || "Unknown Field";
        const priority = task.priority || "medium";
        const deadline = task.deadline ? (task.deadline.toDate ? task.deadline.toDate() : new Date(task.deadline)) : null;
        const dapWindow = task.dapWindow || "";

        // Check if task is critical and overdue
        let isWarning = false;
        let warningType = "info";
        let warningMessage = "";
        let urgency = 0; // Higher = more urgent

        // CRITICAL: Main Fertilization (45-60 DAP)
        if (taskType === "main_fertilization" && priority === "critical") {
          if (currentDAP > 60) {
            isWarning = true;
            warningType = "critical-overdue";
            urgency = 100;
            warningMessage = `OVERDUE: Main Fertilization must be done at 45-60 DAP. Currently ${currentDAP} DAP (${currentDAP - 60} days late)`;
          } else if (currentDAP >= 45 && currentDAP <= 60) {
            isWarning = true;
            warningType = "critical-due";
            urgency = 90;
            warningMessage = `URGENT: Within critical fertilization window! (${60 - currentDAP} days remaining)`;
          } else if (currentDAP >= 40) {
            isWarning = true;
            warningType = "high-upcoming";
            urgency = 50;
            warningMessage = `Approaching main fertilization window (starts at 45 DAP, currently ${currentDAP} DAP)`;
          }
        }

        // CRITICAL: Harvesting
        if (taskType === "harvesting" && priority === "critical") {
          const variety = fieldData.variety || "Unknown";
          const harvestDays = fieldData.expectedHarvestDAP || 365;

          if (currentDAP > harvestDays + 10) {
            isWarning = true;
            warningType = "critical-overdue";
            urgency = 95;
            warningMessage = `OVERDUE: Harvest is ${currentDAP - harvestDays} days late! Quality may be declining.`;
          } else if (currentDAP >= harvestDays - 5 && currentDAP <= harvestDays + 5) {
            isWarning = true;
            warningType = "critical-due";
            urgency = 85;
            warningMessage = `HARVEST NOW: Within optimal window (${harvestDays} DAP ± 5 days)`;
          } else if (currentDAP >= harvestDays - 10) {
            isWarning = true;
            warningType = "high-upcoming";
            urgency = 60;
            warningMessage = `Harvest window approaching (optimal: ${harvestDays} DAP, currently ${currentDAP} DAP)`;
          }
        }

        // HIGH: Basal Fertilization (0-30 DAP)
        if (taskType === "basal_fertilizer" && priority === "high") {
          if (currentDAP > 30) {
            isWarning = true;
            warningType = "high-overdue";
            urgency = 70;
            warningMessage = `Overdue: Should be done within 0-30 DAP (currently ${currentDAP} DAP)`;
          } else if (currentDAP >= 25) {
            isWarning = true;
            warningType = "high-upcoming";
            urgency = 40;
            warningMessage = `Basal fertilization window closing soon (${30 - currentDAP} days left)`;
          }
        }

        // Check deadline-based warnings for all other tasks
        if (!isWarning && deadline && priority === "high") {
          const daysUntilDeadline = Math.ceil((deadline.getTime() - Date.now()) / (1000 * 60 * 60 * 24));

          if (daysUntilDeadline < 0) {
            isWarning = true;
            warningType = "high-overdue";
            urgency = 65;
            warningMessage = `Overdue by ${Math.abs(daysUntilDeadline)} days (deadline: ${deadline.toLocaleDateString()})`;
          } else if (daysUntilDeadline <= 5) {
            isWarning = true;
            warningType = "high-upcoming";
            urgency = 45;
            warningMessage = `Due in ${daysUntilDeadline} day${daysUntilDeadline !== 1 ? 's' : ''} (${deadline.toLocaleDateString()})`;
          }
        }

        if (isWarning) {
          warnings.push({
            taskId,
            taskTitle,
            fieldId,
            fieldName,
            warningType,
            warningMessage,
            urgency,
            currentDAP,
            priority
          });
        }
      }

      // Sort by urgency (highest first)
      warnings.sort((a, b) => b.urgency - a.urgency);

      // Render warnings
      if (warnings.length > 0) {
        console.log(`⚠️ Found ${warnings.length} task warnings`);
        renderTaskWarnings(warnings);

        // Show panel if not dismissed
        if (sessionStorage.getItem("taskWarningsDismissed") !== "true") {
          warningsPanel.classList.remove("hidden");
        }
      } else {
        console.log(`✅ No task warnings found`);
        warningsPanel.classList.add("hidden");
      }
    }, (error) => {
      console.error("❌ Task warnings listener error:", error);
    });

  } catch (err) {
    console.error("❌ Failed to initialize task warnings system:", err);
  }
}

/**
 * Render task warnings in the dashboard panel
 */
function renderTaskWarnings(warnings) {
  const warningsList = document.getElementById("taskWarningsList");
  if (!warningsList) return;

  warningsList.innerHTML = warnings.map(warning => {
    // Determine color and icon based on warning type
    let bgColor, borderColor, textColor, icon;

    switch (warning.warningType) {
      case "critical-overdue":
        bgColor = "bg-red-100";
        borderColor = "border-red-400";
        textColor = "text-red-900";
        icon = "🚨";
        break;
      case "critical-due":
        bgColor = "bg-orange-100";
        borderColor = "border-orange-400";
        textColor = "text-orange-900";
        icon = "⚠️";
        break;
      case "high-overdue":
        bgColor = "bg-red-50";
        borderColor = "border-red-300";
        textColor = "text-red-800";
        icon = "❌";
        break;
      case "high-upcoming":
        bgColor = "bg-yellow-100";
        borderColor = "border-yellow-400";
        textColor = "text-yellow-900";
        icon = "⏰";
        break;
      default:
        bgColor = "bg-blue-50";
        borderColor = "border-blue-300";
        textColor = "text-blue-800";
        icon = "ℹ️";
    }

    return `
      <div class="${bgColor} ${borderColor} border-2 rounded-lg p-4 cursor-pointer hover:shadow-md transition-shadow"
           onclick="navigateToTasksSection()">
        <div class="flex items-start gap-3">
          <div class="text-2xl">${icon}</div>
          <div class="flex-1">
            <div class="flex items-center justify-between mb-1">
              <p class="font-bold ${textColor}">${escapeHtml(warning.taskTitle)}</p>
              <span class="text-xs px-2 py-1 rounded-full bg-white/60 ${textColor} font-semibold">
                ${warning.currentDAP} DAP
              </span>
            </div>
            <p class="text-sm font-medium ${textColor} mb-1">
              Field: ${escapeHtml(warning.fieldName)}
            </p>
            <p class="text-sm ${textColor}">
              ${warning.warningMessage}
            </p>
          </div>
        </div>
      </div>
    `;
  }).join("");
}

/**
 * Navigate to tasks section when warning is clicked
 */
window.navigateToTasksSection = function() {
  // Click the tasks nav item
  const tasksNavItem = document.querySelector('.nav-item[data-section="tasks"]');
  if (tasksNavItem) {
    tasksNavItem.click();

    // Scroll to top of tasks section
    setTimeout(() => {
      const tasksSection = document.getElementById("tasks");
      if (tasksSection) {
        tasksSection.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    }, 100);
  }
};

// =============================
// 📋 REQ-4: Tasks Management - Show All Tasks Across All Fields
// =============================

let allTasksData = [];
let allFieldsMap = new Map(); // fieldId -> fieldData mapping
let tasksUnsubscribe = null; // Real-time listener cleanup

/**
 * Load all fields for the handler to create fieldId -> fieldName mapping
 * Uses real-time listener to keep field names updated
 */
async function loadAllFieldsMapping(handlerId) {
  try {
    const fieldsQuery = query(collection(db, "fields"), where("userId", "==", handlerId));

    // 🔥 Real-time listener for fields
    onSnapshot(fieldsQuery, (snapshot) => {
      allFieldsMap.clear();
      snapshot.forEach((doc) => {
        const data = doc.data();
        allFieldsMap.set(doc.id, {
          id: doc.id,
          name: data.field_name || data.fieldName || 'Unnamed Field',
          ...data
        });
      });
      console.log(`📊 Fields updated: ${allFieldsMap.size} fields in mapping`);

      // Re-render tasks table when fields update (in case field names changed)
      if (allTasksData.length > 0) {
        const filterSelect = document.getElementById('tasksFilter');
        const currentFilter = filterSelect ? filterSelect.value : 'all';
        renderTasksTable(currentFilter);
      }
    }, (error) => {
      console.error("❌ Fields listener error:", error);
    });

    console.log(`✅ Fields real-time listener initialized`);
  } catch (err) {
    console.error("❌ Error loading fields mapping:", err);
  }
}

/**
 * Load all tasks for the handler across all fields
 * Uses real-time listener (onSnapshot) instead of one-time fetch
 */
async function loadAllTasks(handlerId) {
  try {
    // Cleanup previous listener
    if (tasksUnsubscribe) tasksUnsubscribe();

    const tasksQuery = query(
      collection(db, "tasks"),
      where("handlerId", "==", handlerId)
    );

    // 🔥 Real-time listener for tasks
    tasksUnsubscribe = onSnapshot(tasksQuery, (snapshot) => {
      // Prevent double-rendering from local writes
      if (snapshot.metadata.hasPendingWrites) {
        console.log('⏭️ Skipping tasks render - pending local writes');
        return;
      }

      allTasksData = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data()
      }));

      console.log(`🔄 Tasks updated: ${allTasksData.length} tasks (real-time)`);

      // Re-render table with current filter
      const filterSelect = document.getElementById('tasksFilter');
      const currentFilter = filterSelect ? filterSelect.value : 'all';
      renderTasksTable(currentFilter);
    }, (error) => {
      console.error("❌ Tasks listener error:", error);
      const tbody = document.getElementById('tasksTableBody');
      if (tbody) {
        tbody.innerHTML = `
          <tr>
            <td colspan="5" class="px-6 py-10 text-center text-red-500">
              <i class="fas fa-exclamation-triangle text-3xl mb-2"></i>
              <p>Error loading tasks</p>
            </td>
          </tr>
        `;
      }
    });

    console.log(`✅ Tasks real-time listener initialized`);
  } catch (err) {
    console.error("❌ Error loading all tasks:", err);
    return [];
  }
}

/**
 * Render tasks table with filter
 */
function renderTasksTable(filter = 'all') {
  const tbody = document.getElementById('tasksTableBody');
  const countEl = document.getElementById('tasksCount');

  if (!tbody) return;

  // Filter tasks
  let filteredTasks = allTasksData;
  if (filter !== 'all') {
    filteredTasks = allTasksData.filter(task => {
      if (filter === 'worker') {
        // Worker tasks: have metadata.workers_count or don't have metadata.driver
        return task.metadata && (task.metadata.workers_count !== undefined || !task.metadata.driver);
      } else if (filter === 'driver') {
        // Driver tasks: have metadata.driver
        return task.metadata && task.metadata.driver;
      } else if (filter === 'pending') {
        // Pending (On going) tasks
        const status = (task.status || 'pending').toLowerCase();
        return status === 'pending';
      } else if (filter === 'done') {
        // Finished (Done) tasks
        const status = (task.status || 'pending').toLowerCase();
        return status === 'done';
      }
      return true;
    });
  }

  // Update count
  if (countEl) {
    countEl.textContent = `${filteredTasks.length} task${filteredTasks.length !== 1 ? 's' : ''}`;
  }

  // Render table
  if (filteredTasks.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="5" class="py-10 text-center text-gray-500" style="width: 100%; padding: 2.5rem 1.5rem; text-align: center;">
          <div class="flex flex-col items-center justify-center mx-auto" style="max-width: 100%;">
            <i class="fas fa-inbox text-3xl mb-2 text-gray-400"></i>
            <p class="text-base font-medium">No tasks found</p>
          </div>
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = filteredTasks.map(task => {
    const field = allFieldsMap.get(task.fieldId) || { name: 'Unknown Field' };
    const taskTitle = task.title || task.task || task.taskType || 'Untitled Task';
    const deadline = task.deadline ?
      (task.deadline.toDate ? task.deadline.toDate() : new Date(task.deadline)) :
      null;
    const deadlineStr = deadline ?
      deadline.toLocaleDateString() + ' ' + deadline.toLocaleTimeString([], {hour: '2-digit', minute: '2-digit'}) :
      'No deadline';

    const status = (task.status || 'pending').toLowerCase();
    const statusClass = status === 'done' ? 'bg-green-100 text-green-800' :
                       status === 'pending' ? 'bg-yellow-100 text-yellow-800' :
                       'bg-gray-100 text-gray-800';

    return `
      <tr class="hover:bg-gray-50">
        <td class="px-6 py-4">
          <div class="text-sm font-medium text-gray-900">${escapeHtml(taskTitle)}</div>
          ${task.notes ? `<div class="text-xs text-gray-500 mt-1">${escapeHtml(task.notes.substring(0, 50))}${task.notes.length > 50 ? '...' : ''}</div>` : ''}
        </td>
        <td class="px-6 py-4 text-sm text-gray-700">
          ${escapeHtml(field.name)}
        </td>
        <td class="px-6 py-4 text-sm text-gray-600">
          ${deadlineStr}
        </td>
        <td class="px-6 py-4">
          <span class="px-2 py-1 text-xs font-semibold rounded-full ${statusClass}">
            ${status.charAt(0).toUpperCase() + status.slice(1)}
          </span>
        </td>
        <td class="px-6 py-4 text-sm font-medium">
          <div class="flex items-center space-x-2">
            <button onclick="viewTaskDetails('${task.id}')" class="text-blue-600 hover:text-blue-700" title="View Details">
              <i class="fas fa-eye"></i>
            </button>
            <button onclick="confirmDeleteTask('${task.id}')" class="text-red-600 hover:text-red-700" title="Delete Task">
              <i class="fas fa-trash"></i>
            </button>
          </div>
        </td>
      </tr>
    `;
  }).join('');
}

/**
 * Initialize tasks section
 */
async function initializeTasksSection(handlerId) {
  await loadAllFieldsMapping(handlerId);
  await loadAllTasks(handlerId);
  renderTasksTable('all');

  // Setup filter listener
  const filterSelect = document.getElementById('tasksFilter');
  if (filterSelect) {
    filterSelect.addEventListener('change', (e) => {
      renderTasksTable(e.target.value);
    });
  }
}

/**
 * View task details in modal
 */
window.viewTaskDetails = function(taskId) {
  const task = allTasksData.find(t => t.id === taskId);
  if (!task) return;

  const field = allFieldsMap.get(task.fieldId) || { name: 'Unknown Field' };
  const deadline = task.deadline ?
    (task.deadline.toDate ? task.deadline.toDate() : new Date(task.deadline)) :
    null;

  const modalHTML = `
    <div id="taskDetailsModal" class="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div class="bg-white rounded-2xl shadow-2xl w-[90%] max-w-lg p-6">
        <div class="flex items-center justify-between mb-4">
          <h3 class="text-xl font-bold text-gray-900">Task Details</h3>
          <button onclick="document.getElementById('taskDetailsModal').remove()" class="text-gray-400 hover:text-gray-600">
            <i class="fas fa-times text-xl"></i>
          </button>
        </div>

        <div class="space-y-3">
          <div>
            <label class="text-sm font-medium text-gray-500">Task</label>
            <p class="text-gray-900">${escapeHtml(task.title || task.task || task.taskType || 'Untitled')}</p>
          </div>

          <div>
            <label class="text-sm font-medium text-gray-500">Field</label>
            <p class="text-gray-900">${escapeHtml(field.name)}</p>
          </div>

          <div>
            <label class="text-sm font-medium text-gray-500">Deadline</label>
            <p class="text-gray-900">${deadline ? deadline.toLocaleString() : 'No deadline'}</p>
          </div>

          <div>
            <label class="text-sm font-medium text-gray-500">Overall Status</label>
            <p class="text-gray-900">${(task.status || 'pending').charAt(0).toUpperCase() + (task.status || 'pending').slice(1)}</p>
          </div>
          ${task.metadata && task.metadata.driver ? `
          <div>
            <label class="text-sm font-medium text-gray-500">Current Delivery Status</label>
            ${task.driverDeliveryStatus && task.driverDeliveryStatus.status ? `
              <div class="mt-1">
                <span class="px-2 py-1 text-xs font-semibold rounded-full ${getDriverStatusBadgeClass(task.driverDeliveryStatus.status)}">
                  ${getDriverStatusLabel(task.driverDeliveryStatus.status)}
                </span>
                ${task.driverDeliveryStatus.updatedAt ? `
                  <p class="text-xs text-gray-500 mt-1">
                    Updated ${formatTimeAgo(task.driverDeliveryStatus.updatedAt)}
                  </p>
                ` : ''}
                ${task.driverDeliveryStatus.notes ? `
                  <p class="text-xs text-gray-600 mt-1">${(task.driverDeliveryStatus.notes || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</p>
                ` : ''}
              </div>
            ` : '<p class="text-gray-500 text-sm">No status update yet</p>'}
          </div>
          ` : ''}

          ${task.notes ? `
          <div>
            <label class="text-sm font-medium text-gray-500">Notes</label>
            <p class="text-gray-900">${escapeHtml(task.notes)}</p>
          </div>
          ` : ''}

          ${task.assignedTo && task.assignedTo.length > 0 ? `
          <div>
            <label class="text-sm font-medium text-gray-500">Assigned To</label>
            <p class="text-gray-900">${task.assignedTo.length} worker(s)</p>
          </div>
          ` : ''}
        </div>

        <div class="mt-6 flex justify-end">
          <button onclick="document.getElementById('taskDetailsModal').remove()" class="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300">
            Close
          </button>
          
        </div>
      </div>
    </div>
  `;

  document.body.insertAdjacentHTML('beforeend', modalHTML);
};

/**
 * Delete task with confirmation
 */
window.confirmDeleteTask = async function(taskId) {
  const task = allTasksData.find(t => t.id === taskId);
  if (!task) return;

  // Remove existing modal if open
  const existing = document.getElementById('confirmDeleteTaskModal');
  if (existing) existing.remove();

  const taskTitle = task.title || task.task || task.taskType || 'Untitled Task';

  // Create overlay modal
  const overlay = document.createElement('div');
  overlay.id = 'confirmDeleteTaskModal';
  overlay.className = 'fixed inset-0 flex items-center justify-center bg-black bg-opacity-40 backdrop-blur-sm z-50';

  overlay.innerHTML = `
    <div class="bg-white rounded-2xl shadow-2xl w-[90%] max-w-lg p-6 text-gray-800 animate-fadeIn">
      <h2 class="text-xl font-bold mb-2 text-gray-900">Delete Task</h2>
      <p class="text-sm text-gray-600 mb-4">
        You are about to permanently delete the task <strong>"${escapeHtml(taskTitle)}"</strong>.
        ${task.assignedTo && task.assignedTo.length > 0 ? `This task is assigned to ${task.assignedTo.length} worker(s)/driver(s) who will be notified of the cancellation.` : ''}
        This action cannot be undone.
      </p>
      <div class="flex items-start gap-2 mb-4">
        <input type="checkbox" id="taskConfirmCheck" class="mt-1 accent-[var(--cane-600)]" />
        <label for="taskConfirmCheck" class="text-gray-600 text-sm leading-snug">I understand this action is permanent and I want to proceed.</label>
      </div>
      <div class="flex justify-end gap-3">
        <button id="taskCancelBtn" class="px-4 py-2 rounded-lg bg-gray-200 hover:bg-gray-300 transition">Cancel</button>
        <button id="taskConfirmBtn" class="px-4 py-2 rounded-lg bg-red-600 text-white hover:bg-red-700 transition">Delete Task</button>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);

  // Cancel button
  document.getElementById('taskCancelBtn').addEventListener('click', () => overlay.remove());

  // Confirm button
  document.getElementById('taskConfirmBtn').addEventListener('click', async () => {
    const checked = document.getElementById('taskConfirmCheck').checked;
    if (!checked) {
      showHandlerToast('⚠️ Please confirm the checkbox to proceed', 'error');
      return;
    }

    overlay.remove();

    try {
      // Get field name for notification
      let fieldName = 'Unknown Field';
      if (task.fieldId) {
        const field = allFieldsMap.get(task.fieldId);
        if (field) {
          fieldName = field.name;
        }
      }

      // Notify assigned workers/drivers before deleting
      if (task.assignedTo && Array.isArray(task.assignedTo) && task.assignedTo.length > 0) {
        try {
          await notifyTaskDeletion(task.assignedTo, taskTitle, fieldName, taskId);
          console.log(`✅ Sent deletion notifications to ${task.assignedTo.length} assigned user(s)`);
        } catch (notifErr) {
          console.error('⚠️ Failed to send deletion notifications:', notifErr);
          // Continue with deletion even if notifications fail
        }
      }

      // Delete from Firestore (real-time listener will automatically update the UI)
      await deleteDoc(doc(db, "tasks", taskId));

      // Show success toast
      showHandlerToast('✅ Task deleted successfully', 'success');

      console.log(`✅ Task ${taskId} deleted successfully`);
    } catch (err) {
      console.error("❌ Error deleting task:", err);
      showHandlerToast('❌ Failed to delete task', 'error');
    }
  });
};

// Helper function to escape HTML
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// Export tasks section initializer for global access
window.initializeTasksSection = initializeTasksSection;

const DEFAULT_HANDLER_MAP_CENTER = [11.0, 124.6];

const toLatLng = (fieldInfo = {}) => {
  const lat = fieldInfo.latitude || fieldInfo.lat || fieldInfo.location_lat;
  const lng = fieldInfo.longitude || fieldInfo.lng || fieldInfo.location_lng;
  if (typeof lat === "string") {
    const parsed = parseFloat(lat);
    if (!Number.isNaN(parsed)) fieldInfo.latitude = parsed;
  }
  if (typeof lng === "string") {
    const parsed = parseFloat(lng);
    if (!Number.isNaN(parsed)) fieldInfo.longitude = parsed;
  }
  return {
    lat: typeof fieldInfo.latitude === "number" ? fieldInfo.latitude : null,
    lng: typeof fieldInfo.longitude === "number" ? fieldInfo.longitude : null
  };
};

let handlerFieldsMapInstance = null;
let handlerFieldsLastBounds = null;
let handlerFieldsData = [];
let handlerFieldsMarkers = [];
let handlerFieldsSearchInput = null;

const removeHandlerFieldMarkers = () => {
  handlerFieldsMarkers.forEach(marker => marker.remove());
  handlerFieldsMarkers = [];
};

const buildFieldDisplayValues = (field = {}) => {
  const fieldName = field.field_name || field.fieldName || field.name || "Unnamed Field";
  const barangay = field.barangay || field.location || "—";
  const area = field.field_size || field.area_size || field.area || field.size || null;
  console.log('🔍 buildFieldDisplayValues:', {
    fieldName,
    field_size: field.field_size,
    area_size: field.area_size,
    area: field.area,
    size: field.size,
    finalArea: area
  });
  return { fieldName, barangay, area };
};

const createHandlerPinIcon = () => L.icon({
  iconUrl: "../img/PIN.png",
  iconSize: [36, 36],
  iconAnchor: [18, 34],
  popupAnchor: [0, -32]
});

async function renderHandlerFields(userId) {
  const mapContainer = document.getElementById("handlerFieldsMap");
  const listContainer = document.getElementById("handlerFieldsList");
  const totalLabel = document.getElementById("handlerFieldsTotal");
  const message = document.getElementById("handlerFieldsMessage");
  if (!mapContainer || !listContainer) return;

  mapContainer.innerHTML = "";
  listContainer.innerHTML = "";
  if (message) message.textContent = "Loading fields...";

  handlerFieldsData = [];
  removeHandlerFieldMarkers();
  if (handlerFieldsMapInstance) {
    handlerFieldsMapInstance.remove();
    handlerFieldsMapInstance = null;
  }

  try {
    // ✅ Get all fields from fields collection only (single source of truth)
    // Fields can have status: 'pending', 'approved', 'rejected', etc.
    const fieldsQuery = query(collection(db, "fields"), where("userId", "==", userId));
    const fieldsSnap = await getDocs(fieldsQuery);
    const fields = fieldsSnap.docs.map(docSnap => ({
      id: docSnap.id,
      ...(docSnap.data() || {}),
      status: docSnap.data().status || 'pending' // Default to pending if not set
    }));

    handlerFieldsData = fields;

    if (totalLabel) totalLabel.textContent = `${fields.length} field${fields.length === 1 ? "" : "s"}`;

    const firstWithCoords = fields.find(field => toLatLng(field).lat && toLatLng(field).lng);
    const initialCenter = firstWithCoords ? [toLatLng(firstWithCoords).lat, toLatLng(firstWithCoords).lng] : DEFAULT_HANDLER_MAP_CENTER;

    const map = L.map(mapContainer).setView(initialCenter, 11);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: "© OpenStreetMap contributors"
    }).addTo(map);

    handlerFieldsMapInstance = map;
    handlerFieldsLastBounds = null;

    handlerFieldsSearchInput = document.getElementById("handlerFieldsSearch");
    if (handlerFieldsSearchInput) {
      handlerFieldsSearchInput.value = "";
      handlerFieldsSearchInput.disabled = !fields.length;
      handlerFieldsSearchInput.oninput = (e) => updateHandlerFieldsView(e.target.value || "");
    }

    updateHandlerFieldsView("");

  } catch (err) {
    console.error("Handler fields map error", err);
    if (message) message.textContent = "Failed to load fields.";
  }
}

function updateHandlerFieldsView(rawTerm = "") {
  const listContainer = document.getElementById("handlerFieldsList");
  const message = document.getElementById("handlerFieldsMessage");
  if (!listContainer || !handlerFieldsMapInstance) return;

  const searchTerm = cleanString(rawTerm).toLowerCase();
  listContainer.innerHTML = "";
  removeHandlerFieldMarkers();

  if (!handlerFieldsData.length) {
    if (message) message.textContent = "You have no registered fields yet.";
    handlerFieldsMapInstance.setView(DEFAULT_HANDLER_MAP_CENTER, 11);
    setTimeout(() => handlerFieldsMapInstance.invalidateSize(), 150);
    return;
  }

  const filtered = handlerFieldsData.filter(field => {
    if (!searchTerm) return true;
    const { fieldName, barangay } = buildFieldDisplayValues(field);
    const candidate = `${fieldName} ${barangay}`.toLowerCase();
    return candidate.includes(searchTerm);
  });

  if (!filtered.length) {
    if (message) message.textContent = "No fields match your search.";
    handlerFieldsMapInstance.setView(DEFAULT_HANDLER_MAP_CENTER, 11);
    setTimeout(() => handlerFieldsMapInstance.invalidateSize(), 150);
    return;
  }

  if (message) message.textContent = "";

  const icon = createHandlerPinIcon();
  const markers = [];

  filtered.forEach(field => {
    const { lat, lng } = toLatLng(field);
    const { fieldName, barangay, area } = buildFieldDisplayValues(field);

    if (lat && lng) {
      const marker = L.marker([lat, lng], { icon }).addTo(handlerFieldsMapInstance);
      marker.bindPopup(`
        <div class="text-sm">
          <p class="font-semibold text-[var(--cane-900)]">${fieldName}</p>
          <p class="text-gray-600 text-xs">${barangay}</p>
          ${area ? `<p class="text-gray-600 text-xs">${area} ha</p>` : ""}
        </div>
      `);
      markers.push(marker);
      handlerFieldsMarkers.push(marker);
    }

    const item = document.createElement("div");
    item.className = "border border-[var(--cane-200)] rounded-lg p-3 hover:bg-[var(--cane-50)] transition";

    // Status badge based on field status
    const status = field.status || 'pending';
    let statusBadge = '';
    if (status === 'pending') {
      statusBadge = '<span class="text-xs px-2 py-1 rounded-full bg-yellow-100 border border-yellow-300 text-yellow-800 ml-2">Pending</span>';
    } else if (status === 'reviewed') {
      statusBadge = '<span class="text-xs px-2 py-1 rounded-full bg-blue-100 border border-blue-300 text-blue-800 ml-2">Reviewed</span>';
    } else if (status === 'active') {
      statusBadge = '<span class="text-xs px-2 py-1 rounded-full bg-green-100 border border-green-300 text-green-800 ml-2">Active</span>';
    }

    item.innerHTML = `
      <div class="flex items-center justify-between">
        <div class="flex items-center">
          <div>
            <p class="font-semibold text-[var(--cane-900)]">${fieldName}</p>
            <p class="text-sm text-gray-600">${barangay}</p>
          </div>
          ${statusBadge}
        </div>
        ${area ? `<span class="text-xs px-2 py-1 rounded-full bg-[var(--cane-100)] border border-[var(--cane-200)] text-[var(--cane-800)]">${area} ha</span>` : ""}
      </div>
    `;

    item.addEventListener("click", () => {
      if (!lat || !lng) return;
      handlerFieldsMapInstance.setView([lat, lng], 14, { animate: true });
    });

    listContainer.appendChild(item);
  });

  if (markers.length > 0) {
    const group = L.featureGroup(markers);
    handlerFieldsLastBounds = group.getBounds();
    handlerFieldsMapInstance.fitBounds(handlerFieldsLastBounds, { padding: [20, 20] });
  }

  setTimeout(() => handlerFieldsMapInstance.invalidateSize(), 150);
}

document.addEventListener("DOMContentLoaded", () => {
  const myFieldsLink = document.getElementById("linkMyFields");
  const fieldsSection = document.getElementById("fieldsSection");
  const fieldsIframe = document.getElementById("fieldsIframe");

  if (myFieldsLink && fieldsSection && fieldsIframe) {
    myFieldsLink.addEventListener("click", (e) => {
      e.preventDefault();
      // Hide all content sections
      document.querySelectorAll(".content-section").forEach(sec => sec.classList.add("hidden"));
      // Show Fields iframe
      fieldsSection.classList.remove("hidden");
      fieldsIframe.src = "Fields.html";
    });
  }
});

document.addEventListener("DOMContentLoaded", () => {
  const sidebar = document.getElementById("sidebar");
  const hamburger = document.getElementById("hamburger");
  const closeSidebar = document.getElementById("closeSidebar");
  const overlay = document.getElementById("sidebarOverlay");

  if (!sidebar || !hamburger) return;

  const openSidebar = () => {
    sidebar.classList.add("open");
    sidebar.classList.remove("closed");
    hamburger.classList.add("active");
    overlay.classList.remove("hidden");
  };

  const closeSidebarFn = () => {
    sidebar.classList.remove("open");
    sidebar.classList.add("closed");
    hamburger.classList.remove("active");
    overlay.classList.add("hidden");
  };

  hamburger.addEventListener("click", () => {
    if (sidebar.classList.contains("open")) {
      closeSidebarFn();
    } else {
      openSidebar();
    }
  });

  if (closeSidebar) closeSidebar.addEventListener("click", closeSidebarFn);
  if (overlay) overlay.addEventListener("click", closeSidebarFn);
});

/* === Realtime Activity Logs Listener === */
let activityLogsUnsub = null;

function setupActivityLogsListener(handlerId) {
  if (!handlerId) return;

  if (activityLogsUnsub) activityLogsUnsub();

  // top-level task_logs
  const q1 = query(
    collection(db, "task_logs"),
    where("handlerId", "==", handlerId)
  );

  // driver logs come from tasks collection
  const q2 = query(
    collection(db, "tasks"),
    where("handlerId", "==", handlerId),
    where("taskType", "==", "driver_log")
  );

  activityLogsUnsub = [
    onSnapshot(q1, () => {
      console.log("🔄 Worker activity updated");
      loadActivityLogs(handlerId);
    }),
    onSnapshot(q2, () => {
      console.log("🔄 Driver activity updated");
      loadActivityLogs(handlerId);
    })
  ];
}

/* === Realtime Recent Task Activity Listener === */
let recentActivityUnsub = null;

function setupRecentTaskActivityListener(handlerId) {
  if (!handlerId) return;

  if (recentActivityUnsub) recentActivityUnsub();

  const q = query(
    collection(db, "tasks"),
    where("handlerId", "==", handlerId),
    where("status", "==", "done")
  );

  recentActivityUnsub = onSnapshot(q, () => {
    console.log("🔄 Recent task activity updated");
    loadRecentTaskActivity(handlerId);
  });
}

// Expose sync function for profile-settings to call
window.__syncDashboardProfile = async function() {
    try {
        // Update display name from localStorage
        const nickname = localStorage.getItem('farmerNickname');
        const name = localStorage.getItem('farmerName') || 'Handler';
        const display = nickname && nickname.trim().length > 0 ? nickname : name.split(' ')[0];
        
        const userNameElements = document.querySelectorAll('#topUserNameHeader, #sidebarUserName');
        userNameElements.forEach(el => { 
            if (el) el.textContent = display; 
        });
        
        // Try to fetch latest profile photo from Firestore if available
        if (typeof auth !== 'undefined' && auth.currentUser) {
            const uid = auth.currentUser.uid;
            try {
                const userRef = doc(db, 'users', uid);
                const userSnap = await getDoc(userRef);
                if (userSnap.exists() && userSnap.data().photoURL) {
                    const photoUrl = userSnap.data().photoURL;
                    // Update profile icons (header and sidebar)
                    const profilePhoto = document.getElementById('profilePhoto');
                    const profileIconDefault = document.getElementById('profileIconDefault');
                    const sidebarProfilePhoto = document.getElementById('sidebarProfilePhoto');
                    const sidebarProfileIconDefault = document.getElementById('sidebarProfileIconDefault');
                    
                    if (profilePhoto) {
                        profilePhoto.src = photoUrl;
                        profilePhoto.classList.remove('hidden');
                        if (profileIconDefault) profileIconDefault.classList.add('hidden');
                    }
                    if (sidebarProfilePhoto) {
                        sidebarProfilePhoto.src = photoUrl;
                        sidebarProfilePhoto.classList.remove('hidden');
                        if (sidebarProfileIconDefault) sidebarProfileIconDefault.classList.add('hidden');
                    }
                }
            } catch(e) {
                console.error('Error syncing profile photo:', e);
            }
        }
    } catch(e) {
        console.error('Profile sync error:', e);
    }
};

