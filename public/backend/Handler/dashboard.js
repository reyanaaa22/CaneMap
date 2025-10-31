// =============================
// Handler Dashboard Script
// =============================
import { auth, db } from "../Common/firebase-config.js";
import {
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/12.1.0/firebase-auth.js";
import { doc, getDoc, collection, query, where, getDocs, updateDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js";
import { collectionGroup } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js";

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

const toTitleCase = (value) => {
  if (!value) return "";
  return value
    .split(/\s+/)
    .map((s) => s.charAt(0).toUpperCase() + s.slice(1).toLowerCase())
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
    renderHandlerFields(user.uid);
    loadJoinedUsersCount(user.uid);
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
    const collectFromFieldJoins = async () => {
      // 🔹 Step 1: Get all fields owned by this handler
      const ownedFieldsSnap = await getDocs(
        query(collection(db, "field_applications"), where("handlerId", "==", userId))
      );
      const ownedFieldIds = ownedFieldsSnap.docs.map(d => d.id);

      // If no fields, stop early
      if (!ownedFieldIds.length) {
        return { pendingRequests: [], fieldInfoMap: new Map() };
      }

      // 🔹 Step 2: Handle Firestore limit (10 IDs max per 'in' query)
      const chunks = [];
      for (let i = 0; i < ownedFieldIds.length; i += 10) {
        chunks.push(ownedFieldIds.slice(i, i + 10));
      }

      const pendingRequests = [];
      const fieldInfoMap = new Map();

      // 🔹 Step 3: Fetch join_fields where fieldId matches owned fields
      for (const ids of chunks) {
        const snap = await getDocs(
          query(
            collectionGroup(db, "join_fields"),
            where("fieldId", "in", ids),
            where("status", "==", "pending")
          )
        );

        for (const docSnap of snap.docs) {
          const raw = docSnap.data() || {};
          const fieldId = raw.fieldId || raw.field_id;
          if (!fieldId) continue;

          // Cache field info
          let fieldInfo = fieldInfoMap.get(fieldId);
          if (!fieldInfo) {
            try {
              const fieldSnap = await getDoc(doc(db, "fields", fieldId));
              if (!fieldSnap.exists()) continue;
              fieldInfo = fieldSnap.data();
              fieldInfoMap.set(fieldId, fieldInfo);
            } catch {
              continue;
            }
          }

          const requestedAt = raw.requestedAt || raw.createdAt || null;

          pendingRequests.push({
            refPath: docSnap.ref.path,
            fieldId,
            fieldInfo,
            data: {
              userId: raw.user_uid || raw.userId,
              fieldId,
              fieldName: raw.fieldName || fieldInfo.field_name || "",
              barangay: raw.barangay || fieldInfo.barangay || "",
              street: raw.street || fieldInfo.street || "",
              role: raw.role || raw.requested_role || "worker",
              requestedAt
            }
          });
        }
      }

      return { pendingRequests, fieldInfoMap };
    };

    const collectFromFieldWorkers = async () => {
      const fieldWorkersSnap = await getDocs(
        query(collection(db, "field_workers"), where("status", "==", "pending"))
      );

      const fieldInfoMap = new Map();
      const pendingRequests = [];

      await Promise.all(
        fieldWorkersSnap.docs.map(async (docSnap, idx) => {
          const raw = docSnap.data() || {};
          const fieldId = raw.field_id || raw.fieldId;
          if (!fieldId) return;

          let fieldInfo = fieldInfoMap.get(fieldId);
          if (!fieldInfo) {
            try {
              const fieldSnap = await getDoc(doc(db, "fields", fieldId));
              if (!fieldSnap.exists()) return;
              fieldInfo = fieldSnap.data() || {};
              fieldInfoMap.set(fieldId, fieldInfo);
            } catch (_) {
              return;
            }
          }

          if (!fieldOwnedByUser(fieldInfo, userId)) return;

          const requestedAt = raw.requestedAt || raw.requested_at || raw.createdAt || raw.created_at || null;

          pendingRequests.push({
            refPath: `field_workers/${docSnap.id}`,
            fieldId,
            fieldInfo,
            orderIndex: idx,
            data: {
              userId: raw.user_uid || raw.userId || "",
              fieldId,
              fieldName: raw.fieldName || raw.field_name || "",
              barangay: raw.barangay || "",
              street: raw.street || "",
              role: raw.role || raw.requested_role || "worker",
              requestedAt
            }
          });
        })
      );

      pendingRequests.sort((a, b) => a.orderIndex - b.orderIndex);
      return { pendingRequests, fieldInfoMap };
    };

    let pendingRequests = [];
    let fieldInfoMap = new Map();

    try {
      const collected = await collectFromFieldJoins();
      pendingRequests = collected.pendingRequests;
      fieldInfoMap = collected.fieldInfoMap;
    } catch (joinErr) {
      console.warn("field_joins read failed, falling back to field_workers", joinErr);
      if (joinErr?.code && !["permission-denied", "failed-precondition"].includes(joinErr.code)) {
        throw joinErr;
      }
      const fallback = await collectFromFieldWorkers();
      pendingRequests = fallback.pendingRequests;
      fieldInfoMap = fallback.fieldInfoMap;
    }

    pendingRequests.sort((a, b) => {
      const toMillis = (ts) => {
        if (!ts) return 0;
        const date = ts.toDate ? ts.toDate() : (ts instanceof Date ? ts : null);
        return date ? date.getTime() : 0;
      };
      return toMillis(b.data.requestedAt) - toMillis(a.data.requestedAt);
    });

    updateJoinRequestCounts(pendingRequests.length);

    if (!pendingRequests.length) {
      container.innerHTML = `<div class="p-3 text-gray-600">No pending join requests for your fields.</div>`;
      return;
    }

    const requesterIds = Array.from(new Set(
      pendingRequests
        .map(req => req.data.userId)
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

    for (const req of pendingRequests) {
      const requesterId = cleanString(req.data.userId || req.data.user_id || req.data.user_uid || "");
      const requester = requesterMap.get(requesterId) || { name: requesterId || "Unknown", role: "" };
      const fieldInfo = req.fieldInfo || {};
      const fieldName = req.data.fieldName || fieldInfo.field_name || fieldInfo.fieldName || req.fieldId;
      const barangay = req.data.barangay || fieldInfo.barangay || "—";
      const street = req.data.street || fieldInfo.street || "";
      const locationLine = [barangay, street].filter(Boolean).join(" • ") || "Pending location";
      const roleLabel = toTitleCase(req.data.role || "worker");
      const requestedLabel = formatDateTime(req.data.requestedAt);

      const card = document.createElement("div");
      card.className = "border border-gray-200 rounded-xl p-4 mb-3 shadow-sm bg-white";
      card.dataset.requestItem = "true";
      card.innerHTML = `
        <div class="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <p class="font-semibold text-[var(--cane-900)]">${requester.name}</p>
            <p class="text-sm text-gray-600">${roleLabel} request for <span class="font-medium">${fieldName}</span></p>
            <p class="text-xs text-gray-500">${locationLine} • Requested ${requestedLabel}</p>
          </div>
          <div class="flex items-center gap-2">
            <button class="px-3 py-1.5 rounded-md text-sm bg-green-600 text-white hover:bg-green-700 transition" data-join-action="approve" data-path="${req.refPath}">Approve</button>
            <button class="px-3 py-1.5 rounded-md text-sm bg-red-600 text-white hover:bg-red-700 transition" data-join-action="decline" data-path="${req.refPath}">Decline</button>
          </div>
        </div>
      `;
      container.appendChild(card);
    }

    container.querySelectorAll("[data-join-action]").forEach(btn => {
      btn.addEventListener("click", async () => {
        const path = btn.dataset.path;
        const action = btn.dataset.joinAction;
        if (!path || !action) return;

        const originalText = btn.textContent;
        btn.disabled = true;
        btn.textContent = action === "approve" ? "Approving..." : "Declining...";
        try {
          const pathSegments = path.split("/").filter(Boolean);
          await updateDoc(doc(db, ...pathSegments), {
            status: action === "approve" ? "approved" : "declined",
            statusUpdatedAt: serverTimestamp()
          });
          await loadJoinRequests(userId);
        } catch (err) {
          console.error("Join Request update failed:", err);
          btn.disabled = false;
          btn.textContent = originalText;
          btn.classList.add("shake");
          setTimeout(() => btn.classList.remove("shake"), 600);
        }
      });
    });

  } catch (err) {
    console.error("Join Request Error:", err);
    const container = document.getElementById("joinRequestsList");
    const message = err?.message || err?.code || "Unexpected error";
    if (container) container.innerHTML = `<div class="p-3 text-red-500">Error loading join requests. ${message}</div>`;
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

  const setActiveSection = (sectionId) => {
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
    if (registerFrame?.dataset.loggingEnabled !== "true") {
      renderHandlerFields(auth.currentUser?.uid || "");
    }
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
    const ref = collection(db, "field_applications", userId, "fields");
    const q = query(ref, where("status", "==", "reviewed"));
    const snap = await getDocs(q);
    const total = snap.size;

    const mFields = document.getElementById("mFields");
    if (mFields) mFields.textContent = total;
  } catch (err) {
    console.error("❌ Reviewed Fields Error:", err);
  }
}

// =============================
// 🟢 Load Joined Workers/Drivers (pending + approved) from field_joins / join_fields (combined source)
// =============================
async function loadJoinedUsersCount(handlerId) {
  try {
    // 1) Collect field IDs owned by handler from both top-level "fields" and nested "field_applications/{uid}/fields"
    const ownedFieldIds = [];

    // a) top-level fields collection
    try {
      const topSnap = await getDocs(query(collection(db, "fields"), where("userId", "==", handlerId)));
      topSnap.forEach(d => ownedFieldIds.push(d.id));
    } catch (_) {
      // ignore
    }

    // b) nested field_applications/{handlerId}/fields
    try {
      const nestedSnap = await getDocs(collection(db, "field_applications", handlerId, "fields"));
      nestedSnap.forEach(d => ownedFieldIds.push(d.id));
    } catch (_) {
      // ignore
    }

    // dedupe
    const fieldIds = Array.from(new Set(ownedFieldIds));
    if (!fieldIds.length) {
      console.info("No owned fields found for handler:", handlerId);
      const mWorkers = document.getElementById("mWorkers");
      const mDrivers = document.getElementById("mDrivers");
      if (mWorkers) mWorkers.textContent = "0";
      if (mDrivers) mDrivers.textContent = "0";
      // clear list UI
      displayJoinedUsers([]);
      return;
    }

    // 2) Pull join docs using collectionGroup('join_fields') where fieldId in fieldIds (split into chunks of <=10)
    const chunks = [];
    for (let i = 0; i < fieldIds.length; i += 10) chunks.push(fieldIds.slice(i, i + 10));

    const joinedUsers = []; // will store { userId, fieldId, role, status, joinedAt }

    for (const ids of chunks) {
      const snap = await getDocs(
        query(
          collectionGroup(db, "join_fields"),
          where("fieldId", "in", ids),
          where("status", "in", ["pending", "approved", "rejected"])
        )
      );

      snap.forEach(docSnap => {
        const raw = docSnap.data() || {};
        joinedUsers.push({
          userId: raw.user_uid || raw.userId || raw.user || "",
          fieldId: raw.fieldId || raw.field_id || "",
          role: raw.role || raw.requested_role || "worker",
          status: raw.status || "pending",
          joinedAt: raw.joinedAt || raw.requestedAt || raw.createdAt || null
        });
      });
    }

    // 3) Update metric counts (workers vs drivers)
    let workerCount = 0;
    let driverCount = 0;
    joinedUsers.forEach(j => {
      const role = (j.role || "").toLowerCase();
      if (role.includes("driver")) driverCount++;
      else workerCount++;
    });

    const mWorkers = document.getElementById("mWorkers");
    const mDrivers = document.getElementById("mDrivers");
    if (mWorkers) mWorkers.textContent = String(workerCount);
    if (mDrivers) mDrivers.textContent = String(driverCount);

    // 4) Render the list in the dashboard (displayJoinedUsers will fetch user names)
    displayJoinedUsers(joinedUsers);
  } catch (err) {
    console.error("❌ Error loading joined user counts:", err);
    // fallback: clear UI
    displayJoinedUsers([]);
  }
}


// =============================
// 🧩 Display joined users + approve/reject buttons (Fixed)
// =============================
async function displayJoinedUsers(joinedUsers = []) {
  const container = document.getElementById("joinRequestsList");
  if (!container) return;

  container.innerHTML = `<div class="p-3 text-gray-500">Loading joined users...</div>`;

  if (!Array.isArray(joinedUsers) || !joinedUsers.length) {
    container.innerHTML = `<div class="p-3 text-gray-600">No joined workers or drivers yet.</div>`;
    return;
  }

// 🔹 Fetch user display names (ensure fullname is fetched)
const userIds = Array.from(new Set(joinedUsers.map(j => (j.userId || "").trim()).filter(Boolean)));
const userMap = new Map();

await Promise.all(
  userIds.map(async (uid) => {
    try {
      const userRef = doc(db, "users", uid);
      const userSnap = await getDoc(userRef);
      if (userSnap.exists()) {
        const data = userSnap.data();

        // Safely pick best available name
        const fullName =
          data.fullname ||
          data.name ||
          data.nickname ||
          data.displayName ||
          data.email ||
          uid;

        userMap.set(uid, toTitleCase(fullName.trim()));
      } else {
        userMap.set(uid, uid); // fallback to ID if not found
      }
    } catch (error) {
      console.warn("⚠️ Failed to fetch user:", uid, error);
      userMap.set(uid, uid);
    }
  })
);

// 🔹 Fetch field info (both top-level and nested)
const fieldIds = Array.from(new Set(joinedUsers.map(j => (j.fieldId || "").trim()).filter(Boolean)));
const fieldMap = new Map();

await Promise.all(
  fieldIds.map(async fid => {
    let fieldData = null;

    // 1️⃣ Try top-level /fields
    try {
      const fSnap = await getDoc(doc(db, "fields", fid));
      if (fSnap.exists()) fieldData = fSnap.data();
    } catch (_) {}

    // 2️⃣ Fallback: nested field_applications/.../fields
    if (!fieldData) {
      try {
        const cgSnap = await getDocs(collectionGroup(db, "fields"));
        const matchDoc = cgSnap.docs.find(d => d.id === fid);
        if (matchDoc) fieldData = matchDoc.data();
      } catch (err) {
        console.warn("⚠️ Field collectionGroup fallback failed:", err);
      }
    }

    if (fieldData) fieldMap.set(fid, fieldData);
  })
);

  // 🔹 Clear old content
  container.innerHTML = "";

  // 🔹 Sort by join time (latest first)
  joinedUsers.sort((a, b) => {
    const tA = a.joinedAt?.toDate ? a.joinedAt.toDate().getTime() : 0;
    const tB = b.joinedAt?.toDate ? b.joinedAt.toDate().getTime() : 0;
    return tB - tA;
  });

  for (const j of joinedUsers) {
    const uid = j.userId || "";
    const name = userMap.get(uid) || uid;

    const fieldData = fieldMap.get(j.fieldId) || {};
    const fieldName =
      fieldData.field_name || fieldData.fieldName || j.fieldName || "Unnamed Field";
    const barangay =
      fieldData.barangay || fieldData.location || j.barangay || "—";

    const status = (j.status || "pending").toLowerCase();
    const statusColor =
      status === "approved"
        ? "text-green-600"
        : status === "pending"
        ? "text-yellow-600"
        : "text-red-600";

    const joinedAtLabel = j.joinedAt?.toDate
      ? j.joinedAt.toDate().toLocaleString("en-US", {
          month: "short",
          day: "2-digit",
          year: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        })
      : "—";

    // 🔹 Create card
    const div = document.createElement("div");
    div.className =
      "border border-gray-200 rounded-lg p-3 mb-2 bg-white flex justify-between items-center";

    div.innerHTML = `
      <div>
        <p class="font-semibold text-[var(--cane-900)]">${name}</p>
        <p class="text-sm text-gray-600">
          ${toTitleCase(j.role || "Worker")} — 
          <span class="font-medium">${fieldName}</span>
          <span class="ml-2 px-2 py-0.5 rounded-full text-xs border ${statusColor} border-current">
            ${toTitleCase(status)}
          </span>
        </p>
        <p class="text-xs text-gray-500">Brgy. ${barangay} • Joined ${joinedAtLabel}</p>
      </div>
      <div class="flex items-center gap-2">
        ${
          status === "pending"
            ? `
              <button class="px-3 py-1 text-sm rounded-md bg-green-600 text-white hover:bg-green-700 transition" 
                      data-action="approve" data-user="${uid}" data-field="${j.fieldId}">Approve</button>
              <button class="px-3 py-1 text-sm rounded-md bg-red-600 text-white hover:bg-red-700 transition" 
                      data-action="reject" data-user="${uid}" data-field="${j.fieldId}">Reject</button>
            `
            : `<span class="font-semibold ${statusColor}">${toTitleCase(status)}</span>`
        }
      </div>
    `;

    container.appendChild(div);
  }

  // 🔹 Handle approve/reject clicks
  container.querySelectorAll("button[data-action]").forEach(btn => {
    btn.addEventListener("click", async () => {
      const userId = btn.dataset.user;
      const fieldId = btn.dataset.field;
      const action = btn.dataset.action;
      if (!userId || !fieldId) return;

      btn.disabled = true;
      btn.textContent = action === "approve" ? "Approving..." : "Rejecting...";

      try {
        const qSnap = await getDocs(
          query(collectionGroup(db, "join_fields"), where("user_uid", "==", userId), where("fieldId", "==", fieldId))
        );
        if (!qSnap.empty) {
          const docRef = qSnap.docs[0].ref;
          await updateDoc(docRef, {
            status: action === "approve" ? "approved" : "rejected",
            updatedAt: serverTimestamp(),
          });
          loadJoinedUsersCount(auth.currentUser?.uid);
        } else {
          alert("Join record not found!");
        }
      } catch (err) {
        console.error("⚠️ Update failed:", err);
        alert("Failed to update: " + err.message);
      } finally {
        btn.disabled = false;
      }
    });
  });
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
