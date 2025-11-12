
import { auth, db } from "../Common/firebase-config.js";
import {
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/12.1.0/firebase-auth.js";
import { doc, getDoc, collection, query, where, getDocs, updateDoc, serverTimestamp, orderBy, limit, onSnapshot, collectionGroup } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js";
import { initializeFieldsSection } from "./fields-map.js";
import { initializeHandlerWorkersSection } from "./worker.js";

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

  const closeDropdown = (event) => {
    if (!dropdown.contains(event.target) && !bellBtn.contains(event.target)) {
      dropdown.classList.add("hidden");
    }
  };

  bellBtn.addEventListener("click", (event) => {
    event.stopPropagation();
    dropdown.classList.toggle("hidden");
    if (!dropdown.classList.contains("hidden")) {
      bellBtn.classList.add("text-white");
    }
  });

  document.addEventListener("click", closeDropdown);
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") dropdown.classList.add("hidden");
  });

  const renderNotifications = (docs = []) => {
    const unread = docs.filter((doc) => doc.status !== "read");

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
        const title = item.title || "Notification";
        const message = item.message || "";
        const meta = formatRelativeTime(item.timestamp || item.createdAt);
        const statusClass = item.status === "read" ? "bg-gray-100" : "bg-[var(--cane-50)]";
        const safeMessage = typeof message === "string" ? message : "";

        return `<button data-id="${item.id}" class="w-full text-left px-4 py-3 border-b border-gray-100 hover:bg-gray-50 focus:outline-none ${statusClass}">
          <div class="flex items-start gap-2">
            <div class="mt-1 h-2 w-2 rounded-full ${item.status === "read" ? "bg-gray-300" : "bg-[var(--cane-600)]"}"></div>
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
      renderNotifications(docs);
    }, (error) => {
      console.error("Notifications stream failed", error);
      list.innerHTML = '<div class="p-4 text-sm text-red-500 text-center">Failed to load notifications.</div>';
    });
  };

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
      status: "read",
      readAt: serverTimestamp(),
      readBy: userId
    });
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
    let fieldsFromUserId = [];
    let fieldsFromLandownerId = [];
    let fieldsFromRegisteredBy = [];
    
    // Query by userId
    try {
      const fieldsQuery1 = query(
        collection(db, "fields"),
        where("userId", "==", handlerId)
      );
      const snap1 = await getDocs(fieldsQuery1);
      fieldsFromUserId = snap1.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    } catch (err) {
      console.warn("Could not fetch fields by userId:", err.message);
    }

    // Query by landowner_id
    try {
      const fieldsQuery2 = query(
        collection(db, "fields"),
        where("landowner_id", "==", handlerId)
      );
      const snap2 = await getDocs(fieldsQuery2);
      fieldsFromLandownerId = snap2.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    } catch (err) {
      console.warn("Could not fetch fields by landowner_id:", err.message);
    }

    // Query by registered_by
    try {
      const fieldsQuery3 = query(
        collection(db, "fields"),
        where("registered_by", "==", handlerId)
      );
      const snap3 = await getDocs(fieldsQuery3);
      fieldsFromRegisteredBy = snap3.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    } catch (err) {
      console.warn("Could not fetch fields by registered_by:", err.message);
    }
    
    // Also check field_applications subcollection (nested fields)
    let nestedFields = [];
    try {
      const nestedFieldsQuery = query(
        collection(db, `field_applications/${handlerId}/fields`)
      );
      const nestedSnap = await getDocs(nestedFieldsQuery);
      nestedFields = nestedSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    } catch (err) {
      console.warn("Could not fetch nested fields:", err.message);
    }

    // Merge all fields and remove duplicates by id
    const allFieldsMap = new Map();
    [...fieldsFromUserId, ...fieldsFromLandownerId, ...fieldsFromRegisteredBy, ...nestedFields].forEach(field => {
      if (field.id) {
        allFieldsMap.set(field.id, field);
      }
    });

    const handlerFields = Array.from(allFieldsMap.values());
    const handlerFieldIds = new Set(handlerFields.map(f => f.id).filter(Boolean));
    
    console.log(`📋 Found ${handlerFieldIds.size} fields owned by handler:`, Array.from(handlerFieldIds));
    
    if (handlerFieldIds.size === 0) {
      container.innerHTML = `<div class="p-3 text-gray-600">No fields found. Register a field to receive join requests.</div>`;
      updateJoinRequestCounts(0);
      return;
    }

    // Step 2: Query join_fields for each handler field
    // Since we don't know all users, we'll try collectionGroup but handle errors gracefully
    // and also check field_workers collection as a fallback
    let allJoinRequests = [];
    
    // Step 2: Query join_fields using collectionGroup
    // The security rules will filter which documents the handler can read based on field ownership
    try {
      // Query all join_fields documents (security rules will filter by field ownership)
      // We filter client-side for pending status and handler's fields
      const joinFieldsQuery = query(collectionGroup(db, "join_fields"));
      const joinFieldsSnap = await getDocs(joinFieldsQuery);
      
      console.log(`📥 Retrieved ${joinFieldsSnap.docs.length} join_fields documents from collectionGroup`);
      
      // Process and filter join requests
      allJoinRequests = joinFieldsSnap.docs
        .map(doc => {
          const data = doc.data();
          const fieldId = data.fieldId || data.field_id || data.fieldID || doc.id;
          const userId = data.userId || data.user_id || data.user_uid || "";
          
          return {
            id: doc.id,
            refPath: doc.ref.path,
            fieldId: fieldId,
            userId: userId,
            user_uid: userId, // Add for compatibility with rules
            fieldName: data.fieldName || data.field_name || "",
            street: data.street || "",
            barangay: data.barangay || "",
            role: data.joinAs || data.role || data.requested_role || "worker",
            status: data.status || "pending",
            requestedAt: data.requestedAt || data.requested_at || data.createdAt || data.created_at
          };
        })
        .filter(req => {
          // Filter: Only include PENDING requests for fields owned by this handler
          return req.fieldId && handlerFieldIds.has(req.fieldId) && req.status === "pending";
        });
      
      console.log(`✅ Filtered to ${allJoinRequests.length} pending join requests for handler's ${handlerFieldIds.size} fields`);
      
    } catch (err) {
      console.error("❌ Error fetching join requests via collectionGroup:", err);
      console.error("   Error code:", err.code);
      console.error("   Error message:", err.message);
      
      // If collectionGroup fails, try field_workers collection as fallback
      console.log("🔄 Attempting fallback: field_workers collection...");
      try {
        const fieldWorkersQuery = query(
          collection(db, "field_workers"),
          where("status", "==", "pending")
        );
        const fieldWorkersSnap = await getDocs(fieldWorkersQuery);
        const workersRequests = fieldWorkersSnap.docs
          .map(doc => {
            const data = doc.data();
            const fieldId = data.field_id || data.fieldId;
            const userId = data.user_uid || data.userId || "";
            
            return {
              id: doc.id,
              refPath: doc.ref.path,
              fieldId: fieldId,
              userId: userId,
              user_uid: userId,
              role: data.role || "worker",
              requestedAt: data.requested_at || data.requestedAt || data.createdAt,
              status: data.status || "pending",
              fieldName: data.field_name || data.fieldName || "",
              street: data.street || "",
              barangay: data.barangay || ""
            };
          })
          .filter(req => req.fieldId && handlerFieldIds.has(req.fieldId));
        
        allJoinRequests = workersRequests;
        console.log(`✅ Found ${allJoinRequests.length} join requests via field_workers fallback`);
      } catch (fallbackErr) {
        console.error("❌ Fallback query also failed:", fallbackErr);
        console.error("   Fallback error code:", fallbackErr.code);
        console.error("   Fallback error message:", fallbackErr.message);
        
        // Show user-friendly error message
        container.innerHTML = `
          <div class="p-4 text-red-600 border border-red-200 rounded-lg bg-red-50">
            <p class="font-semibold mb-2">Unable to load join requests</p>
            <p class="text-sm mb-2">Error: ${fallbackErr.message || "Permission denied"}</p>
            <p class="text-xs text-gray-600 mb-3">
              This may be due to Firestore security rules or missing indexes. 
              Please check that your fields have the correct ownership fields set (userId, landowner_id, or registered_by).
            </p>
            <button onclick="location.reload()" class="px-3 py-1 text-sm bg-red-600 text-white rounded hover:bg-red-700">
              <i class="fas fa-redo mr-1"></i>Retry
            </button>
          </div>
        `;
        updateJoinRequestCounts(0);
        return;
      }
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
            // Check for joinAs field first (as per user requirements), then fallback to role/requested_role
            const requestedRole = requestData.joinAs || requestData.role || requestData.requested_role || "worker";
            
            // Update join request status
            await updateDoc(docRef, {
              status: action === "approve" ? "approved" : "rejected",
              statusUpdatedAt: serverTimestamp(),
              reviewedBy: handlerId,
              reviewedAt: serverTimestamp()
            });

            // If approved, update the user's role in the users collection
            if (action === "approve" && requesterUserId) {
              try {
                const userRef = doc(db, "users", requesterUserId);
                await updateDoc(userRef, {
                  role: requestedRole.toLowerCase(), // Set to "worker" or "driver"
                  roleUpdatedAt: serverTimestamp()
                });
                console.log(`✅ Updated user ${requesterUserId} role to ${requestedRole}`);
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
                  ? "Field Registration Approved!"
                  : "Field Registration Rejected!";
              const notifMessage =
                action === "approve"
                  ? `Your join request for <strong>${requestData.fieldName || "a field"}</strong> has been approved by the handler. You can now check your joined fields <a href="../../frontend/Worker/join-field.html" target="_blank" class="notif-link">here</a>.`
                  : `Your join request for <strong>${requestData.fieldName || "a field"}</strong> has been rejected by the handler. Please contact your handler for more details.`;

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
    // Listen to all join_fields documents via collectionGroup for real-time updates
    const joinFieldsQuery = query(collectionGroup(db, "join_fields"));
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

onAuthStateChanged(auth, (user) => {
  if (!user) return (window.location.href = "../../login.html");
  loadUserProfile(user);
  loadJoinRequests(user.uid);
  setupJoinRequestsListener(user.uid);
  initNotifications(user.uid);
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
});

// =============================
// ✅ Dropdown + Sidebar Navigation
// =============================
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
  const dynamicSections = {
    'tasks': 'sections/tasks.html',
    'fields': 'sections/fields.html',
    'workers': 'sections/workers.html',
    'analytics': 'sections/analytics.html',
    'reports': 'sections/reports.html',
    'settings': 'sections/settings.html'
  };

  // Track loaded sections
  const loadedSections = new Set();

  // Load section content dynamically
  async function loadSection(sectionId) {
    if (loadedSections.has(sectionId) || !dynamicSections[sectionId]) {
      return true;
    }

    const container = document.getElementById(sectionId);
    if (!container) return false;

    try {
      const sectionUrl = dynamicSections[sectionId];
      const cacheBuster = `?v=${Date.now()}`;
      const response = await fetch(`${sectionUrl}${cacheBuster}`, { cache: 'no-store' });

      if (!response.ok) throw new Error(`Failed to load ${sectionId}`);
      const html = await response.text();
      container.innerHTML = html;
      loadedSections.add(sectionId);
      
      // Initialize fields map after loading fields section
      if (sectionId === 'fields') {
        console.log('🗺️ Fields section loaded, initializing map...');
        setTimeout(() => {
          initializeFieldsSection();
        }, 100);
      }

      if (sectionId === 'workers') {
        console.log('👥 Workers section loaded, initializing scripts...');
        setTimeout(() => {
          initializeHandlerWorkersSection();
        }, 50);
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

  const registerBtn = document.getElementById("registerFieldBtn");
  const backBtn = document.getElementById("backToFields");
  const fieldsDefault = document.getElementById("fieldsDefault");
  const fieldsRegister = document.getElementById("fieldsRegister");
  const registerFrame = document.getElementById("registerFieldFrame");
  const reportsFormWrapper = document.getElementById("reportsFormWrapper");
  const reportsBackBar = document.getElementById("reportsBackBar");
  const reportsFrame = document.getElementById("reportsFormFrame");
  const openReportBtn = document.getElementById("btn-open-report-form");
  const backReportBtn = document.getElementById("btn-back-to-list");

  const showFieldsDefault = () => {
    if (fieldsDefault) fieldsDefault.classList.remove("hidden");
    if (fieldsRegister) fieldsRegister.classList.add("hidden");
    if (registerFrame) registerFrame.src = "";
    // Don't call renderHandlerFields - let fields.html script handle it
  };

  if (registerBtn && fieldsDefault && fieldsRegister && registerFrame) {
    registerBtn.addEventListener("click", () => {
      fieldsDefault.classList.add("hidden");
      fieldsRegister.classList.remove("hidden");
      registerFrame.src = "Register-field.html";
    });
  }

  if (backBtn && registerFrame) {
    backBtn.addEventListener("click", () => {
      showFieldsDefault();
    });
  }

  if (registerFrame) {
    registerFrame.addEventListener("load", () => {
      try {
        const frameWindow = registerFrame.contentWindow;
        if (!frameWindow) return;
        frameWindow.addEventListener("field-registered", () => {
          showFieldsDefault();
        }, { once: true });
      } catch (_) {
        // ignore cross-origin issues
      }
    });
  }

  if (openReportBtn && reportsFormWrapper && reportsBackBar && reportsFrame) {
    openReportBtn.addEventListener("click", () => {
      reportsFormWrapper.classList.remove("hidden");
      reportsBackBar.classList.remove("hidden");
      if (!reportsFrame.src) reportsFrame.src = "Report.html";
    });
  }

  if (backReportBtn && reportsFormWrapper && reportsBackBar && reportsFrame) {
    backReportBtn.addEventListener("click", () => {
      reportsFormWrapper.classList.add("hidden");
      reportsBackBar.classList.add("hidden");
      reportsFrame.src = "";
    });
  }
});

async function loadReviewedOwnedFields(userId) {
  try {
    const q = query(collection(db, "fields"), where("userId", "==", userId));
    const snap = await getDocs(q);
    const total = snap.size;
    const mFields = document.getElementById("mFields");
    if (mFields) mFields.textContent = total;
  } catch (err) {
    console.error("❌ Reviewed Fields Error:", err);
  }
}

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
  const area = field.area_size || field.area || field.size || null;
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
    const snap = await getDocs(query(collection(db, "fields"), where("userId", "==", userId)));
    const fields = snap.docs.map(docSnap => ({ id: docSnap.id, ...(docSnap.data() || {}) }));
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
    item.innerHTML = `
      <div class="flex items-center justify-between">
        <div>
          <p class="font-semibold text-[var(--cane-900)]">${fieldName}</p>
          <p class="text-sm text-gray-600">${barangay}</p>
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
