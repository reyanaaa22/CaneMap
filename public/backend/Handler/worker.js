// CaneMap Workers handler hooked to Firestore (falls back to localStorage)
import { db } from '../../backend/Common/firebase-config.js';
import { collection, doc, setDoc, getDoc, getDocs, updateDoc, deleteDoc, serverTimestamp, query, where, collectionGroup, onSnapshot } from 'https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js';

const NAME_PLACEHOLDERS = new Set([
  '',
  'loading',
  'loading...',
  'unnamed',
  'unnamed farmer',
  'farmer name',
  'handler name',
  'user name',
  'null',
  'undefined'
]);

const CONTACT_PLACEHOLDERS = new Set([
  '',
  'none',
  'n/a',
  'na',
  '0000000000',
  '00000000000',
  'contact number',
  'no contact'
]);

const cleanString = (value) => (typeof value === 'string' ? value.trim() : '');

const resolveValue = (candidates = [], placeholders = NAME_PLACEHOLDERS) => {
  for (const value of candidates) {
    const cleaned = cleanString(value);
    if (cleaned && !placeholders.has(cleaned.toLowerCase())) {
      return cleaned;
    }
  }
  return '';
};

const toTitleCase = (value) => {
  const cleaned = cleanString(value);
  if (!cleaned) return '';
  return cleaned
    .split(/\s+/)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(' ');
};

export function initializeHandlerWorkersSection() {
  const STORAGE_KEYS = {
    farmers: 'cm_farmers',
    drivers: 'cm_drivers',
    requests: 'cm_worker_requests'
  };

  const getUserId = () => cleanString(localStorage.getItem('userId') || '');
  const colFarmers = () => {
    const uid = getUserId();
    return uid ? collection(db, `users/${uid}/farmers`) : collection(db, 'farmers');
  };
  const colDrivers = () => {
    const uid = getUserId();
    return uid ? collection(db, `users/${uid}/drivers`) : collection(db, 'drivers');
  };
  const colRequests = () => {
    const uid = getUserId();
    return uid ? collection(db, `users/${uid}/worker_requests`) : collection(db, 'worker_requests');
  };

  const state = {
    farmers: [],
    drivers: [],
    requests: [],
    search: '',
    filter: 'all'
  };

  const FILTER_LABELS = {
    all: 'All Workers',
    farmers: 'Workers', // Changed from 'Farmers' to 'Workers'
    drivers: 'Drivers'
  };

  const refs = {};

  function readJson(key, fallback){
    try{ return JSON.parse(localStorage.getItem(key) || 'null') ?? fallback; }catch(_){ return fallback; }
  }
  function writeJson(key, value){ try{ localStorage.setItem(key, JSON.stringify(value)); }catch(_){ } }
  function uid(){ return 'id_' + Math.random().toString(36).slice(2,9); }
  function fmtDate(iso){
    if (!iso) return '';
    try {
      return new Date(iso).toLocaleDateString();
    } catch (_) {
      return '';
    }
  }

  function grabRefs(){
    refs.workersTbody = document.getElementById('workersTbody');
    refs.requestsList = document.getElementById('requestsList');
    refs.requestsCount = document.getElementById('requestsCount');
    refs.searchInput = document.getElementById('searchWorkers');
    refs.dropdownButton = document.getElementById('filterDropdownButton');
    refs.dropdownMenu = document.getElementById('filterDropdownMenu');
    refs.dropdownLabel = document.getElementById('filterDropdownLabel');
    refs.dropdownItems = refs.dropdownMenu ? Array.from(refs.dropdownMenu.querySelectorAll('.filter-dropdown-item')) : [];
    refs.farmersCount = document.getElementById('farmersCount');
    refs.driversCount = document.getElementById('driversCount');
    refs.requestsCount = document.getElementById('requestsCount');
    refs.requestsList = document.getElementById('requestsList');
  }

  function syncFilterUI(filter){
    if (refs.dropdownLabel) refs.dropdownLabel.textContent = FILTER_LABELS[filter] || FILTER_LABELS.all;
    refs.dropdownItems?.forEach(item => {
      item.classList.toggle('active', item.dataset.filter === filter);
    });
  }

  function collectWorkers(){
    const farmers = state.farmers.map(f => ({
      id: f.id,
      type: 'farmers',
      label: 'Worker', // Changed from 'Farmer' to 'Worker'
      icon: 'fas fa-tractor text-[var(--cane-700)]',
      name: f.name || 'Unnamed Worker',
      contact: f.phone || '—',
      detail: f.barangay || '—',
      since: f.since
    }));

    const drivers = state.drivers.map(d => ({
      id: d.id,
      type: 'drivers',
      label: 'Driver',
      icon: 'fas fa-truck text-[#0f609b]',
      name: d.name || 'Unnamed Driver',
      contact: d.phone || '—',
      detail: d.plate || '—',
      since: d.since
    }));

    return [...farmers, ...drivers];
  }

  function updateSummaryCounts(){
    if (refs.farmersCount) refs.farmersCount.textContent = state.farmers.length;
    if (refs.driversCount) refs.driversCount.textContent = state.drivers.length;
  }

  function renderWorkers(){
    if (!refs.workersTbody) return;

    const records = collectWorkers()
      .filter(worker => state.filter === 'all' || worker.type === state.filter)
      .filter(worker => {
        // Dynamic search: filter as user types any key
        if (!state.search) return true;
        const searchTerm = state.search.toLowerCase().trim();
        if (!searchTerm) return true;
        
        // Search across name, contact, detail, label
        const searchableText = [
          worker.name,
          worker.contact,
          worker.detail,
          worker.label,
          worker.type
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        
        return searchableText.includes(searchTerm);
      });

    if (records.length === 0) {
      refs.workersTbody.innerHTML = '<tr><td colspan="5" class="py-4 text-center text-sm text-[var(--cane-700)]">No workers found.</td></tr>';
      return;
    }

    const rows = records.map(worker => `
      <tr class="border-t border-[var(--cane-100)]">
        <td class="py-3 pl-4">
          <span class="inline-flex items-center gap-2 font-semibold text-[var(--cane-800)]">
            <i class="${worker.icon}"></i>
            ${worker.label}
          </span>
        </td>
        <td class="py-3">
          <div class="font-semibold text-[var(--cane-950)]">${worker.name}</div>
          ${worker.since ? `<div class="text-xs text-[var(--cane-600)]">Since ${fmtDate(worker.since)}</div>` : ''}
        </td>
        <td class="py-3">${worker.contact}</td>
        <td class="py-3">${worker.detail}</td>
        <td class="py-3 pr-4 text-right text-sm text-[var(--cane-600)]">—</td>
      </tr>
    `).join('');

    refs.workersTbody.innerHTML = rows;
  }

  function renderRequests(){
    if (!refs.requestsList || !refs.requestsCount) return;

    const total = state.requests.length;
    const countBadge = refs.requestsCount.querySelector('span');
    if (countBadge) countBadge.textContent = `${total} request${total !== 1 ? 's' : ''}`;

    if (total === 0) {
      refs.requestsList.innerHTML = '<div class="p-3 text-sm text-[var(--cane-700)] bg-white/60 rounded-lg">No pending join requests found.</div>';
      return;
    }

    refs.requestsList.innerHTML = state.requests.map((item) => {
      const dateLine = item.requestedLabel ? `<p class="text-[11px] text-gray-500">Requested ${item.requestedLabel}</p>` : '';
      // Only show buttons for pending requests (since we filter to only show pending)
      const actionHtml = `
        <button class="request-btn request-btn-primary" data-action="approve" data-path="${item.refPath}">Approve</button>
        <button class="request-btn request-btn-secondary" data-action="reject" data-path="${item.refPath}">Reject</button>
      `;

      return `
        <div class="request-item rounded-xl bg-white p-3 flex flex-col gap-3">
          <div class="flex justify-between gap-3">
            <div>
              <p class="text-sm font-semibold text-[var(--cane-900)]">${item.name || 'Unknown User'}</p>
              <p class="text-xs text-gray-600">${item.role || 'Worker'} • ${item.fieldName || 'Field'}</p>
              <p class="text-xs text-gray-500">${item.locationLine || ''}</p>
              ${dateLine}
            </div>
            <div class="flex gap-2 items-center">
              ${actionHtml}
            </div>
          </div>
        </div>`;
    }).join('');

    // only add click handlers for pending items
    refs.requestsList.querySelectorAll('[data-action]').forEach(btn => {
      btn.addEventListener('click', async (event) => {
        const { path, action } = btn.dataset;
        if (!path || !action) return;
        await handleJoinRequestAction(btn, path, action);
      });
    });
  }

  async function handleJoinRequestAction(button, path, action) {
    if (!button) return;

    const originalLabel = button.textContent;
    button.disabled = true;
    button.textContent = action === 'approve' ? 'Approving…' : 'Rejecting…';

    const requestIndex = state.requests.findIndex(req => req.refPath === path);
    const request = requestIndex >= 0 ? state.requests[requestIndex] : null;
    const handlerId = getUserId();

    try {
      const docRef = doc(db, path);
      const requestDoc = await getDoc(docRef);
      const requestData = requestDoc.exists() ? requestDoc.data() : {};
      const requesterUserId = requestData.userId || requestData.user_id || requestData.user_uid || "";
      // Check for joinAs field first (as per user requirements), then fallback to role/requested_role
      const requestedRole = requestData.joinAs || requestData.role || requestData.requested_role || "worker";
      
      // Update join request status
      await updateDoc(docRef, {
        status: action === 'approve' ? 'approved' : 'rejected',
        statusUpdatedAt: serverTimestamp(),
        reviewedBy: handlerId,
        reviewedAt: serverTimestamp()
      });

      // If approved, update the user's role in the users collection
      if (action === 'approve' && requesterUserId) {
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

      // Refresh data
      await fetchAllData();
      await loadJoinRequests();
      updateSummaryCounts();
      renderWorkers();
    } catch (err) {
      console.warn('Failed to update join request', err);
      button.disabled = false;
      button.textContent = originalLabel;
      return;
    }

    button.disabled = false;
    button.textContent = originalLabel;
  }

  function closeDropdown(){
    if (refs.dropdownMenu) refs.dropdownMenu.classList.add('hidden');
  }

  function setFilter(filter){
    state.filter = filter;
    syncFilterUI(filter);
    renderWorkers();
  }

  function attachEvents(){
    if (refs.searchInput) {
      refs.searchInput.addEventListener('input', (event) => {
        state.search = event.target.value || '';
        renderWorkers();
      });
    }

    if (refs.dropdownButton && refs.dropdownMenu) {
      refs.dropdownButton.addEventListener('click', (event) => {
        event.stopPropagation();
        refs.dropdownMenu.classList.toggle('hidden');
      });

      document.addEventListener('click', (event) => {
        if (!refs.dropdownButton.contains(event.target) && !refs.dropdownMenu.contains(event.target)) {
          closeDropdown();
        }
      });

      document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') closeDropdown();
      });

      refs.dropdownItems.forEach(item => {
        item.addEventListener('click', () => {
          const filter = item.dataset.filter || 'all';
          closeDropdown();
          setFilter(filter);
        });
      });
    }
  }

  async function fetchAllData(){
    const uid = getUserId();
    if (!uid) {
      state.farmers = [];
      state.drivers = [];
      state.requests = [];
      return;
    }
    try {
      // Get all fields owned by this handler
      const handlerFieldIds = await getHandlerFieldIds(uid);
      
      // Get all approved join requests for handler's fields
      let allApprovedRequests = [];
      try {
        const joinFieldsQuery = query(collectionGroup(db, "join_fields"));
        const joinFieldsSnap = await getDocs(joinFieldsQuery);
        
        allApprovedRequests = joinFieldsSnap.docs
          .map(doc => {
            const data = doc.data();
            const fieldId = data.fieldId || data.field_id || data.fieldID || doc.id;
            const userId = data.userId || data.user_id || data.user_uid || "";
            return {
              userId: userId,
              fieldId: fieldId,
              role: data.joinAs || data.role || data.requested_role || "worker",
              status: data.status || "pending",
              requestedAt: data.requestedAt || data.requested_at || data.createdAt
            };
          })
          .filter(req => {
            // Only include approved requests for handler's fields
            return req.fieldId && handlerFieldIds.has(req.fieldId) && req.status === "approved";
          });
      } catch (err) {
        console.warn('Could not fetch approved join requests:', err);
      }

      // Get user IDs from approved requests
      const approvedUserIds = Array.from(new Set(
        allApprovedRequests.map(req => req.userId).filter(Boolean)
      ));

      // Fetch user details from users collection
      const workers = [];
      const drivers = [];
      
      await Promise.all(
        approvedUserIds.map(async (userId) => {
          try {
            const userSnap = await getDoc(doc(db, "users", userId));
            if (!userSnap.exists()) return;
            
            const userData = userSnap.data();
            const userRole = (userData.role || "").toLowerCase();
            
            // Only include users with role "worker" or "driver"
            if (userRole !== "worker" && userRole !== "driver") return;
            
            // Find the approved request for this user
            const approvedReq = allApprovedRequests.find(req => req.userId === userId);
            const requestedRole = approvedReq?.role || userRole;
            
            const userName = resolveValue(
              [userData.nickname, userData.name, userData.fullname, userData.fullName, userData.displayName, userData.email],
              NAME_PLACEHOLDERS
            ) || userId;
            
            const userInfo = {
              id: userId,
              name: userName,
              phone: resolveValue([userData.phone, userData.phoneNumber, userData.contact, userData.mobile], CONTACT_PLACEHOLDERS) || '—',
              barangay: userData.barangay || '—',
              plate: userData.plate || userData.vehiclePlate || '—',
              since: approvedReq?.requestedAt ? (approvedReq.requestedAt.toDate ? approvedReq.requestedAt.toDate().toISOString() : approvedReq.requestedAt) : new Date().toISOString()
            };
            
            if (requestedRole.toLowerCase() === "driver" || userRole === "driver") {
              drivers.push(userInfo);
            } else {
              workers.push(userInfo);
            }
          } catch (err) {
            console.warn(`Failed to fetch user ${userId}:`, err);
          }
        })
      );

      state.farmers = workers;
      state.drivers = drivers;

      writeJson(STORAGE_KEYS.farmers, state.farmers);
      writeJson(STORAGE_KEYS.drivers, state.drivers);
    } catch (err) {
      console.error('Error fetching workers/drivers:', err);
      state.farmers = readJson(STORAGE_KEYS.farmers, []);
      state.drivers = readJson(STORAGE_KEYS.drivers, []);
    }
  }

  // Helper function to get handler's field IDs
  async function getHandlerFieldIds(handlerId) {
    const fieldIds = new Set();
    
    try {
      // Query by userId
      try {
        const fieldsQuery1 = query(collection(db, "fields"), where("userId", "==", handlerId));
        const snap1 = await getDocs(fieldsQuery1);
        snap1.docs.forEach(doc => fieldIds.add(doc.id));
      } catch (err) {
        console.warn("Could not fetch fields by userId:", err.message);
      }

      // Query by landowner_id
      try {
        const fieldsQuery2 = query(collection(db, "fields"), where("landowner_id", "==", handlerId));
        const snap2 = await getDocs(fieldsQuery2);
        snap2.docs.forEach(doc => fieldIds.add(doc.id));
      } catch (err) {
        console.warn("Could not fetch fields by landowner_id:", err.message);
      }

      // Query by registered_by
      try {
        const fieldsQuery3 = query(collection(db, "fields"), where("registered_by", "==", handlerId));
        const snap3 = await getDocs(fieldsQuery3);
        snap3.docs.forEach(doc => fieldIds.add(doc.id));
      } catch (err) {
        console.warn("Could not fetch fields by registered_by:", err.message);
      }
      
      // Also check field_applications subcollection
      try {
        const nestedFieldsQuery = query(collection(db, `field_applications/${handlerId}/fields`));
        const nestedSnap = await getDocs(nestedFieldsQuery);
        nestedSnap.docs.forEach(doc => fieldIds.add(doc.id));
      } catch (err) {
        console.warn("Could not fetch nested fields:", err.message);
      }
    } catch (err) {
      console.error("Error getting handler field IDs:", err);
    }
    
    return fieldIds;
  }

  async function addFarmerFirestore(payload){
    try {
      const id = payload.id || uid();
      await setDoc(doc(colFarmers(), id), { ...payload, id, since: payload.since || new Date().toISOString(), createdAt: serverTimestamp() });
      return id;
    } catch (_) {
      return null;
    }
  }

  async function addDriverFirestore(payload){
    try {
      const id = payload.id || uid();
      await setDoc(doc(colDrivers(), id), { ...payload, id, since: payload.since || new Date().toISOString(), createdAt: serverTimestamp() });
      return id;
    } catch (_) {
      return null;
    }
  }

  async function loadJoinRequests(){
    try {
      const handlerId = getUserId();
      if (!handlerId) {
        state.requests = [];
        renderRequests();
        return;
      }
      
      // Use the same logic as dashboard.js to load join requests
      const result = await loadJoinRequestsForHandler(handlerId);
      state.requests = result;
      renderRequests();
    } catch (err) {
      console.warn('Failed to load join requests', err);
      state.requests = [];
      renderRequests();
    }
  }

  async function refresh(){
    await fetchAllData();
    updateSummaryCounts();
    renderWorkers();
    await loadJoinRequests();
  }

  // Set up real-time listener for join requests
  let unsubscribeJoinRequests = null;
  function setupJoinRequestsListener() {
    const handlerId = getUserId();
    if (!handlerId) return;

    // Unsubscribe from previous listener if exists
    if (unsubscribeJoinRequests) {
      unsubscribeJoinRequests();
    }

    try {
      // Listen to all join_fields documents via collectionGroup
      const joinFieldsQuery = query(collectionGroup(db, "join_fields"));
      unsubscribeJoinRequests = onSnapshot(joinFieldsQuery, async (snapshot) => {
        console.log('🔄 Join requests updated in real-time');
        await loadJoinRequests();
        await fetchAllData();
        updateSummaryCounts();
        renderWorkers();
      }, (error) => {
        console.error('Error in join requests listener:', error);
      });
    } catch (err) {
      console.error('Failed to set up join requests listener:', err);
    }
  }

  async function init(){
    grabRefs();
    syncFilterUI(state.filter);
    attachEvents();
    await refresh();
    setupJoinRequestsListener();
  }

  init();
}

// Shared function to load join requests for a handler (same logic as dashboard.js)
async function loadJoinRequestsForHandler(handlerId) {
  try {
    // Step 1: Get all fields owned by this handler
    let fieldsFromUserId = [];
    let fieldsFromLandownerId = [];
    let fieldsFromRegisteredBy = [];
    
    // Query by userId
    try {
      const fieldsQuery1 = query(collection(db, "fields"), where("userId", "==", handlerId));
      const snap1 = await getDocs(fieldsQuery1);
      fieldsFromUserId = snap1.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    } catch (err) {
      console.warn("Could not fetch fields by userId:", err.message);
    }

    // Query by landowner_id
    try {
      const fieldsQuery2 = query(collection(db, "fields"), where("landowner_id", "==", handlerId));
      const snap2 = await getDocs(fieldsQuery2);
      fieldsFromLandownerId = snap2.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    } catch (err) {
      console.warn("Could not fetch fields by landowner_id:", err.message);
    }

    // Query by registered_by
    try {
      const fieldsQuery3 = query(collection(db, "fields"), where("registered_by", "==", handlerId));
      const snap3 = await getDocs(fieldsQuery3);
      fieldsFromRegisteredBy = snap3.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    } catch (err) {
      console.warn("Could not fetch fields by registered_by:", err.message);
    }
    
    // Also check field_applications subcollection
    let nestedFields = [];
    try {
      const nestedFieldsQuery = query(collection(db, `field_applications/${handlerId}/fields`));
      const nestedSnap = await getDocs(nestedFieldsQuery);
      nestedFields = nestedSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    } catch (err) {
      console.warn("Could not fetch nested fields:", err.message);
    }

    // Merge all fields and remove duplicates
    const allFieldsMap = new Map();
    [...fieldsFromUserId, ...fieldsFromLandownerId, ...fieldsFromRegisteredBy, ...nestedFields].forEach(field => {
      if (field.id) {
        allFieldsMap.set(field.id, field);
      }
    });

    const handlerFields = Array.from(allFieldsMap.values());
    const handlerFieldIds = new Set(handlerFields.map(f => f.id).filter(Boolean));
    
    if (handlerFieldIds.size === 0) {
      return [];
    }

    // Step 2: Query join_fields using collectionGroup
    let allJoinRequests = [];
    
    try {
      const joinFieldsQuery = query(collectionGroup(db, "join_fields"));
      const joinFieldsSnap = await getDocs(joinFieldsQuery);
      
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
            user_uid: userId,
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
      
    } catch (err) {
      console.error("❌ Error fetching join requests via collectionGroup:", err);
      return [];
    }

    // Step 3: Build field info map
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

    // Step 5: Format requests for display
    const toLabel = (ts) => {
      if (!ts) return '';
      const date = ts.toDate ? ts.toDate() : (ts instanceof Date ? ts : null);
      return date ? date.toLocaleString('en-US', { month: 'short', day: '2-digit', year: 'numeric', hour: 'numeric', minute: '2-digit' }) : '';
    };

    const requests = allJoinRequests.map(req => {
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

      return {
        refPath: req.refPath,
        name: requester.name,
        status: req.status || 'pending',
        role: roleLabel,
        userId: requesterId,
        contact: requester.contact || '',
        fieldName,
        locationLine,
        barangay,
        street,
        requestedLabel: toLabel(req.requestedAt || req.requested_at || req.createdAt)
      };
    });

    return requests;
  } catch (err) {
    console.error("Error loading join requests for handler:", err);
    return [];
  }
}

async function loadJoinRequestsForUser(){
  const userId = localStorage.getItem('userId');
  if (!userId) return [];

  const joinFieldsRef = collection(db, `field_joins/${userId}/join_fields`);
  const q = query(joinFieldsRef, where('status', 'in', ['pending', 'approved']));
  const snapshot = await getDocs(q);

  const fieldCache = new Map();

  const resolveField = async (fieldId) => {
    if (!fieldId) return {};
    if (fieldCache.has(fieldId)) return fieldCache.get(fieldId);
    const candidates = [
      doc(db, 'fields', fieldId),
      doc(db, `field_applications/${userId}/fields/${fieldId}`)
    ];
    for (const ref of candidates) {
      try {
        const snap = await getDoc(ref);
        if (snap.exists()) {
          const data = snap.data() || {};
          fieldCache.set(fieldId, data);
          return data;
        }
      } catch (_) {}
    }
    return {};
  };

  const toLabel = (ts) => {
    if (!ts) return '';
    const date = ts.toDate ? ts.toDate() : (ts instanceof Date ? ts : null);
    return date ? date.toLocaleString('en-US', { month: 'short', day: '2-digit', year: 'numeric', hour: 'numeric', minute: '2-digit' }) : '';
  };

  const requests = [];

  for (const docSnap of snapshot.docs) {
    const raw = docSnap.data() || {};
    const fieldId = raw.fieldId || raw.field_id || raw.fieldID || docSnap.id;
    const fieldInfo = await resolveField(fieldId);
    const requesterId = raw.userId || raw.user_id || raw.user_uid || '';
    const rawNameCandidates = [
      raw.userName,
      raw.username,
      raw.requesterName,
      raw.requester_name,
      raw.name
    ];
    let requesterName = resolveValue(rawNameCandidates, NAME_PLACEHOLDERS) || requesterId;
    let requesterRole = cleanString(raw.role || raw.requested_role || '');
    const phoneCandidates = [
      raw.contact,
      raw.contactNumber,
      raw.contact_number,
      raw.phone,
      raw.phoneNumber,
      raw.phone_number,
      raw.mobile,
      raw.mobileNumber
    ];
    let contact = resolveValue(phoneCandidates, CONTACT_PLACEHOLDERS);
    let plate = cleanString(raw.plate || raw.vehiclePlate || raw.vehicle_plate || '');
    if (requesterId) {
      try {
        const snap = await getDoc(doc(db, 'users', requesterId));
        if (snap.exists()) {
          const data = snap.data() || {};
          requesterName = resolveValue([
            data.nickname,
            data.name,
            data.fullname,
            data.fullName,
            data.full_name,
            data.displayName,
            data.display_name,
            [data.firstName, data.lastName].filter(Boolean).join(' '),
            [data.firstname, data.lastname].filter(Boolean).join(' '),
            data.email
          ], NAME_PLACEHOLDERS) || requesterName || requesterId;
          requesterRole = cleanString(data.role || requesterRole);
          contact = resolveValue([
            contact,
            data.phone,
            data.phoneNumber,
            data.contact,
            data.mobile
          ], CONTACT_PLACEHOLDERS) || contact;
        }
      } catch (_) {}
    }

    const barangay = raw.barangay || fieldInfo.barangay || '';
    const street = raw.street || fieldInfo.street || '';
    const locationLine = [barangay, street].filter(Boolean).join(' • ');

    requests.push({
      refPath: docSnap.ref.path,
      name: requesterName,
      status: raw.status || 'pending',
      role: toTitleCase(requesterRole || 'worker'),
      userId: requesterId,
      contact,
      fieldName: raw.fieldName || raw.field_name || fieldInfo.field_name || fieldInfo.fieldName || '',
      locationLine,
      barangay,
      street,
      plate,
      requestedLabel: toLabel(raw.requestedAt || raw.requested_at || raw.createdAt || raw.created_at)
    });
  }

  return requests;
}

