
import { auth, db } from "../Common/firebase-config.js";
import {
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/12.1.0/firebase-auth.js";
import { doc, getDoc, collection, query, where, getDocs, updateDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js";
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

async function loadJoinRequests(userId) {
  const container = document.getElementById("joinRequestsList");
  if (!container) return;

  container.innerHTML = `<div class="p-3 text-gray-500">Loading join requests...</div>`;

  try {
    // Query the user's specific subcollection instead of collection group
    const joinFieldsRef = collection(db, `field_joins/${userId}/join_fields`);
    const joinQuery = query(joinFieldsRef, where("status", "==", "pending"));

    const joinsSnap = await getDocs(joinQuery);
    const fieldInfoMap = new Map();
    const pendingRequests = [];

    await Promise.all(
      joinsSnap.docs.map(async (docSnap, idx) => {
        const raw = docSnap.data() || {};
        const fieldId = raw.fieldId || raw.field_id || raw.fieldID || docSnap.id;

        let fieldInfo = fieldInfoMap.get(fieldId);
        if (!fieldInfo) {
          try {
            const fieldSnap = await getDoc(doc(db, "fields", fieldId));
            if (!fieldSnap.exists()) {
              console.warn(`Field ${fieldId} not found`);
              return;
            }
            fieldInfo = fieldSnap.data() || {};
            fieldInfoMap.set(fieldId, fieldInfo);
          } catch (err) {
            console.warn(`Error fetching field ${fieldId}:`, err);
            return;
          }
        }

        if (!fieldOwnedByUser(fieldInfo, userId)) return;

        const requestedAt = raw.requestedAt || raw.requested_at || raw.createdAt || raw.created_at || null;

        pendingRequests.push({
          refPath: docSnap.ref.path,
          fieldId,
          fieldInfo,
          orderIndex: idx,
          data: {
            userId: raw.userId || raw.user_id || raw.user_uid || "",
            fieldId,
            fieldName: raw.fieldName || raw.field_name || fieldInfo.field_name || fieldInfo.fieldName || "",
            barangay: raw.barangay || fieldInfo.barangay || "",
            street: raw.street || fieldInfo.street || "",
            role: raw.role || raw.requested_role || "worker",
            requestedAt
          }
        });
      })
    );

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

    // 🧩 Show confirmation modal first
    const confirmModal = document.createElement("div");
    confirmModal.className = "fixed inset-0 bg-black/40 flex items-center justify-center z-[10000]";
    confirmModal.innerHTML = `
      <div class="bg-white rounded-xl p-6 w-[90%] max-w-sm text-center border border-gray-200 shadow-md">
        <h3 class="text-lg font-semibold mb-3 text-gray-800">Confirm ${action === "approve" ? "Approval" : "Rejection"}</h3>
        <p class="text-gray-600 text-sm mb-5">Are you sure you want to <b>${action}</b> this join request?</p>
        <div class="flex justify-center gap-3">
          <button id="cancelConfirm" class="px-4 py-2 rounded-md border border-gray-300 text-gray-700 hover:bg-gray-100 transition">Cancel</button>
          <button id="okConfirm" class="px-4 py-2 rounded-md ${action === "approve" ? "bg-green-600 hover:bg-green-700" : "bg-red-600 hover:bg-red-700"} text-white transition">${action === "approve" ? "Approve" : "Reject"}</button>
        </div>
      </div>
    `;
    document.body.appendChild(confirmModal);

    // Cancel
    confirmModal.querySelector("#cancelConfirm").onclick = () => confirmModal.remove();

    // Confirm OK
    confirmModal.querySelector("#okConfirm").onclick = async () => {
      confirmModal.remove();

      const originalText = btn.textContent;
      btn.disabled = true;
      btn.textContent = action === "approve" ? "Approving..." : "Rejecting...";

      try {
        const pathSegments = path.split("/").filter(Boolean);
        const docRef = doc(db, path); // use direct Firestore path instead of split()
        await updateDoc(docRef, {
          status: action === "approve" ? "approved" : "rejected",
          statusUpdatedAt: serverTimestamp()
        });

        // ✅ Show success modal after updating
        const successModal = document.createElement("div");
        successModal.className = "fixed inset-0 bg-black/40 flex items-center justify-center z-[10000]";
        successModal.innerHTML = `
          <div class="bg-white rounded-xl p-6 w-[90%] max-w-sm text-center border border-gray-200 shadow-md">
            <h3 class="text-lg font-semibold mb-2 text-gray-800">${action === "approve" ? "Approved" : "Rejected"} Successfully</h3>
            <p class="text-gray-600 text-sm mb-5">The join request has been ${action === "approve" ? "approved" : "rejected"} successfully.</p>
            <button id="okSuccess" class="px-4 py-2 rounded-md bg-[var(--cane-700)] text-white hover:bg-[var(--cane-800)] transition">OK</button>
          </div>
        `;
        document.body.appendChild(successModal);

        successModal.querySelector("#okSuccess").onclick = async () => {
          successModal.remove();
          await loadJoinRequests(userId); // refresh list
        };

      } catch (err) {
        console.error("Join Request update failed:", err);
        btn.disabled = false;
        btn.textContent = originalText;
      }
    };
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
