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
    filter: 'all',
    fieldFilter: 'all', // New: filter by specific field
    availableFields: [] // List of fields handler owns
  };

  const FILTER_LABELS = {
    all: 'All Workers',
    farmers: 'Workers Only',
    drivers: 'Drivers Only'
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
    refs.fieldFilterButton = document.getElementById('fieldFilterButton');
    refs.fieldFilterMenu = document.getElementById('fieldFilterMenu');
    refs.fieldFilterLabel = document.getElementById('fieldFilterLabel');
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

  async function populateFieldFilter() {
    if (!refs.fieldFilterMenu) return;

    try {
      const handlerId = getUserId();
      const fieldIds = await getHandlerFieldIds(handlerId);

      // Fetch field details
      const fields = [];
      for (const fieldId of fieldIds) {
        try {
          const fieldRef = doc(db, 'fields', fieldId);
          const fieldSnap = await getDoc(fieldRef);
          if (fieldSnap.exists()) {
            fields.push({
              id: fieldId,
              name: fieldSnap.data().fieldName || fieldSnap.data().name || 'Unknown Field'
            });
          }
        } catch (err) {
          console.warn(`Could not fetch field ${fieldId}:`, err);
        }
      }

      state.availableFields = fields;

      // Populate dropdown
      const fieldOptions = [
        `<button data-field-id="all" class="field-filter-item flex w-full items-center justify-between px-4 py-2 text-sm text-[var(--cane-800)] hover:bg-[var(--cane-50)] active">
          <span class="inline-flex items-center gap-2"><i class="fas fa-border-all"></i>All Fields</span>
          <i class="fas fa-check"></i>
        </button>`,
        ...fields.map(f => `
          <button data-field-id="${f.id}" class="field-filter-item flex w-full items-center justify-between px-4 py-2 text-sm text-[var(--cane-800)] hover:bg-[var(--cane-50)]">
            <span class="inline-flex items-center gap-2"><i class="fas fa-map-marker-alt"></i>${f.name}</span>
            <i class="fas fa-check"></i>
          </button>
        `)
      ].join('');

      refs.fieldFilterMenu.innerHTML = fieldOptions;

      // Attach click handlers
      refs.fieldFilterMenu.querySelectorAll('.field-filter-item').forEach(btn => {
        btn.addEventListener('click', () => {
          const fieldId = btn.dataset.fieldId;
          state.fieldFilter = fieldId;

          // Update UI
          refs.fieldFilterLabel.textContent = fieldId === 'all' ? 'All Fields' : fields.find(f => f.id === fieldId)?.name || 'All Fields';
          refs.fieldFilterMenu.querySelectorAll('.field-filter-item').forEach(item => {
            item.classList.toggle('active', item.dataset.fieldId === fieldId);
          });
          refs.fieldFilterMenu.classList.add('hidden');

          renderWorkers();
        });
      });

    } catch (err) {
      console.error('Error populating field filter:', err);
    }
  }

  function collectWorkers(){
    // Combine all workers and drivers
    const allRecords = [...state.farmers, ...state.drivers];

    // Group by userId to deduplicate
    const groupedByUser = new Map();

    allRecords.forEach(record => {
      if (!groupedByUser.has(record.id)) {
        groupedByUser.set(record.id, {
          id: record.id,
          name: record.name || 'Unnamed User',
          contact: record.phone || '—',
          barangay: record.barangay,
          plate: record.plate,
          since: record.since,
          fields: [] // Array of {fieldId, fieldName, role}
        });
      }

      // Add this field assignment to the user's record
      groupedByUser.get(record.id).fields.push({
        fieldId: record.fieldId,
        fieldName: record.fieldName,
        role: record.role
      });
    });

    // Convert Map to array
    return Array.from(groupedByUser.values());
  }

  function updateSummaryCounts(){
    const workers = collectWorkers();

    // Count unique users who have at least one worker role
    const workerCount = workers.filter(w =>
      w.fields.some(f => f.role?.toLowerCase() === 'worker')
    ).length;

    // Count unique users who have at least one driver role
    const driverCount = workers.filter(w =>
      w.fields.some(f => f.role?.toLowerCase() === 'driver')
    ).length;

    if (refs.farmersCount) refs.farmersCount.textContent = workerCount;
    if (refs.driversCount) refs.driversCount.textContent = driverCount;
  }

  function renderWorkers() {
    if (!refs.workersTbody) return;

    let records = collectWorkers();

    // Apply search filter
    if (state.search) {
      const searchTerm = state.search.toLowerCase().trim();
      records = records.filter(worker => {
        const searchableText = [
          worker.name,
          worker.barangay,
          worker.plate,
          ...worker.fields.map(f => f.fieldName)
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        return searchableText.includes(searchTerm);
      });
    }

    // Apply type filter (workers vs drivers)
    if (state.filter !== 'all') {
      records = records.filter(worker => {
        if (state.filter === 'farmers') {
          // Show if they have at least one worker role
          return worker.fields.some(f => f.role?.toLowerCase() === 'worker');
        } else if (state.filter === 'drivers') {
          // Show if they have at least one driver role
          return worker.fields.some(f => f.role?.toLowerCase() === 'driver');
        }
        return true;
      });
    }

    // Apply field filter
    if (state.fieldFilter !== 'all') {
      records = records.filter(worker => {
        // Show if they have at least one assignment in the selected field
        return worker.fields.some(f => f.fieldId === state.fieldFilter);
      });
    }

    if (records.length === 0) {
      refs.workersTbody.innerHTML =
        '<tr><td colspan="3" class="py-5 text-center text-sm text-[var(--cane-700)]">No workers found.</td></tr>';
      return;
    }

    const rows = records.map(worker => {
      // Filter field badges based on field filter
      let fieldsToShow = worker.fields;
      if (state.fieldFilter !== 'all') {
        fieldsToShow = worker.fields.filter(f => f.fieldId === state.fieldFilter);
      }

      // Filter badges based on type filter
      if (state.filter === 'farmers') {
        fieldsToShow = fieldsToShow.filter(f => f.role?.toLowerCase() === 'worker');
      } else if (state.filter === 'drivers') {
        fieldsToShow = fieldsToShow.filter(f => f.role?.toLowerCase() === 'driver');
      }

      // Create field badges
      const fieldBadges = fieldsToShow.map(f => {
        const roleLabel = f.role?.toLowerCase() === 'driver' ? 'Driver' : 'Worker';
        const roleColor = f.role?.toLowerCase() === 'driver' ? 'bg-blue-100 text-blue-800' : 'bg-green-100 text-green-800';
        return `<span class="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${roleColor}">
          <i class="fas fa-map-marker-alt"></i>
          ${f.fieldName || 'Unknown Field'} (${roleLabel})
        </span>`;
      }).join(' ');

      return `
        <tr class="group transition-all hover:bg-[var(--cane-50)] border-t border-[var(--cane-100)]">
          <td class="py-4 pl-4">
            <div class="font-semibold text-[var(--cane-950)]">${worker.name}</div>
            ${worker.since ? `<div class="text-xs text-[var(--cane-500)] mt-0.5">Since ${fmtDate(worker.since)}</div>` : ''}
          </td>
          <td class="py-4">
            <div class="flex flex-wrap gap-1.5">
              ${fieldBadges || '<span class="text-xs text-gray-400">No assignments</span>'}
            </div>
          </td>
          <td class="py-4 pr-4 text-right">
            <button class="see-details-btn bg-[var(--cane-600)] hover:bg-[var(--cane-700)] text-white font-semibold px-3 py-1.5 rounded-lg text-sm transition-all duration-200"
              data-id="${worker.id}">
              See Details
            </button>
          </td>
        </tr>
      `;
    }).join('');

    refs.workersTbody.innerHTML = rows;

    refs.workersTbody.querySelectorAll('.see-details-btn').forEach(btn => {
      btn.addEventListener('click', e => showDetailsModal(e.target.dataset.id));
    });
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

    const handlerId = getUserId();
    
    // Show confirmation dialog (same as dashboard.js)
    const confirmModal = document.createElement("div");
    confirmModal.className = "fixed inset-0 bg-black/40 flex items-center justify-center z-[10000]";
    const iconClass = action === "approve" ? "check-circle" : "times-circle";
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

      const originalText = button.textContent;
      const originalDisabled = button.disabled;
      button.disabled = true;
      button.textContent = action === "approve" ? "Approving..." : "Rejecting...";

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

        if (requesterUserId) {
          const notifRef = doc(collection(db, "notifications"));
          const fieldName = requestData.fieldName || "a field";
          const notifType = action === "approve" ? "join_approved" : "join_rejected";
          const notifTitle = action === "approve"
            ? "Join Request Approved"
            : "Join Request Rejected";
          const notifMessage = action === "approve"
            ? `Your join request for ${fieldName} has been approved! You can now access the field.`
            : `Your join request for ${fieldName} has been rejected. Please contact your handler for more information.`;

          await setDoc(notifRef, {
            userId: requesterUserId,
            type: notifType,
            title: notifTitle,
            message: notifMessage,
            read: false,
            createdAt: serverTimestamp(),
            relatedEntityId: requestData.fieldId || requestData.field_id,
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
          await loadJoinRequests();
          await fetchAllData();
          updateSummaryCounts();
          renderWorkers();
        };

      } catch (err) {
        console.error("Join Request update failed:", err);
        alert(`Failed to ${action} join request: ${err.message || "Unknown error"}`);
        button.disabled = originalDisabled;
        button.textContent = originalText;
      }
    };
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

    // Field filter dropdown
    if (refs.fieldFilterButton && refs.fieldFilterMenu) {
      refs.fieldFilterButton.addEventListener('click', (event) => {
        event.stopPropagation();
        refs.fieldFilterMenu.classList.toggle('hidden');
        if (refs.dropdownMenu) refs.dropdownMenu.classList.add('hidden'); // Close other dropdown
      });

      document.addEventListener('click', (event) => {
        if (!refs.fieldFilterButton.contains(event.target) && !refs.fieldFilterMenu.contains(event.target)) {
          refs.fieldFilterMenu.classList.add('hidden');
        }
      });
    }

    // Type filter dropdown
    if (refs.dropdownButton && refs.dropdownMenu) {
      refs.dropdownButton.addEventListener('click', (event) => {
        event.stopPropagation();
        refs.dropdownMenu.classList.toggle('hidden');
        if (refs.fieldFilterMenu) refs.fieldFilterMenu.classList.add('hidden'); // Close other dropdown
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
        const joinFieldsQuery = query(
          collection(db, "field_joins"),
          where("handlerId", "==", uid),
          where("status", "==", "approved")
        );
        const joinFieldsSnap = await getDocs(joinFieldsQuery);

        allApprovedRequests = joinFieldsSnap.docs.map(doc => {
          const data = doc.data();
          return {
            userId: data.userId,
            fieldId: data.fieldId,
            role: data.assignedAs || data.joinAs || data.role || "worker",
            status: data.status,
            requestedAt: data.requestedAt
          };
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

            // fetch contact number from Drivers_Badge if driver
            let badgeData = {};
            if (userRole === "driver") {
              try {
                const badgeSnap = await getDoc(doc(db, "Drivers_Badge", userId));
                if (badgeSnap.exists()) {
                  badgeData = badgeSnap.data();
                }
              } catch (err) {
                console.warn(`⚠️ Failed to fetch Drivers_Badge for ${userId}:`, err);
              }
            }


            // REMOVED filter - now allows farmers to be shown as workers/drivers based on field_joins role
            // This supports: farmer can be worker on one field, driver on another field

            // Find ALL approved requests for this user (they might work on multiple fields)
            const userApprovedRequests = allApprovedRequests.filter(req => req.userId === userId);
            
            const userName = resolveValue(
              [userData.nickname, userData.name, userData.fullname, userData.fullName, userData.displayName, userData.email],
              NAME_PLACEHOLDERS
            ) || userId;
            
const address =
  userRole === "worker"
    ? resolveValue(
        [
          userData.address,
          `${userData.street || ""}, ${userData.barangay || ""}, ${userData.city || ""}`,
          userData.barangay,
          userData.city,
        ],
        new Set(["", "n/a", "none"])
      )
    : userData.barangay || badgeData.barangay || "—";

            // Process each field this user works on
            for (const req of userApprovedRequests) {
              // Fetch field name
              let fieldName = 'Unknown Field';
              try {
                const fieldRef = doc(db, 'fields', req.fieldId);
                const fieldSnap = await getDoc(fieldRef);
                if (fieldSnap.exists()) {
                  fieldName = fieldSnap.data().fieldName || fieldSnap.data().name || 'Unknown Field';
                }
              } catch (err) {
                console.warn(`Could not fetch field ${req.fieldId}:`, err);
              }

              const userInfo = {
                id: userId,
                name: userName,
                phone: resolveValue(
                  [
                    userData.phone,
                    userData.phoneNumber,
                    userData.contact,
                    userData.mobile,
                    badgeData.contact_number,
                    badgeData.contactNumber,
                  ],
                  CONTACT_PLACEHOLDERS
                ) || "—",
                barangay: address || "—",
                plate: userData.plate || badgeData.vehiclePlate || badgeData.plate || "—",
                since: req.requestedAt
                  ? (req.requestedAt.toDate ? req.requestedAt.toDate().toISOString() : req.requestedAt)
                  : new Date().toISOString(),
                fieldId: req.fieldId, // Store field ID
                fieldName: fieldName, // Store field name
                role: req.role // Store role for THIS specific field
              };

              if (req.role.toLowerCase() === "driver") {
                drivers.push(userInfo);
              } else {
                workers.push(userInfo);
              }
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
      
      // field_applications subcollection removed - all fields now in top-level fields collection
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
      // Listen to field_joins for this handler
      const uid = localStorage.getItem('userId');
      const joinFieldsQuery = query(
        collection(db, "field_joins"),
        where("handlerId", "==", uid)
      );
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
    await populateFieldFilter();
    await refresh();
    setupJoinRequestsListener();
  }

// Show Details Modal (fixed clean layout, includes contact, birthday, and driver badge info)
async function showDetailsModal(uid) {
  try {
    const userRef = doc(db, "users", uid);
    const userSnap = await getDoc(userRef);
    if (!userSnap.exists()) {
      alert("User not found.");
      return;
    }

    const userData = userSnap.data() || {};
    const fullname = resolveValue(
      [userData.fullname, userData.name, userData.displayName, userData.nickname],
      NAME_PLACEHOLDERS
    ) || uid;
    const roleRaw = (userData.role || "worker").toLowerCase();
    const roleLabel = toTitleCase(roleRaw);

    // birthday
    const birthday = userData.birthday || userData.birth_date || "";
    const age = computeAge(birthday);

    // default contact from users
    let contact = resolveValue(
      [userData.contact, userData.phone, userData.phoneNumber, userData.mobile],
      CONTACT_PLACEHOLDERS
    );

    let badge = {};
    if (roleRaw === "driver") {
      try {
        const badgeRef = doc(db, "Drivers_Badge", uid);
        const badgeSnap = await getDoc(badgeRef);
        if (badgeSnap.exists()) {
          badge = badgeSnap.data();
          // override contact with badge version if available
          if (badge.contact_number && badge.contact_number.trim()) {
            contact = badge.contact_number.trim();
          }
        }
      } catch (err) {
        console.warn("Could not fetch Drivers_Badge:", err);
      }
    }

  const address =
    roleRaw === "worker"
      ? resolveValue(
          [
            userData.address,
            `${userData.street || ""}, ${userData.barangay || ""}, ${userData.city || ""}`,
            userData.barangay,
          ],
          new Set(["", "none", "n/a"])
        ) || "—"
      : resolveValue(
          [badge.address, userData.address, userData.barangay, userData.street],
          new Set(["", "none", "n/a"])
        ) || "—";

    const plate = badge.plate_number || badge.plate || userData.plate || "—";
    const vehicleType = badge.vehicle_types || badge.vehicle_type || "—";
    const vehicleModel = badge.vehicle_model || "—";
    const vehicleColor = badge.vehicle_color || "—";
    const licenseExpiry = badge.license_expiry || badge.licenseExpiry || "—";

    let contentHTML = `
      <div style="margin-bottom:16px;">
        <h2 style="margin:0;font-size:20px;font-weight:700;color:var(--cane-900)">
          ${escapeHtml(fullname)}
          <span style="font-weight:600;font-size:13px;color:var(--cane-700)"> (${escapeHtml(roleLabel)})</span>
        </h2>
      </div>

      <div style="display:grid;grid-template-columns:repeat(2,1fr);gap:12px;">
        <div>
          <label style="display:block;font-size:12px;font-weight:700;color:var(--cane-700);margin-bottom:4px;">Contact</label>
          <input type="text" value="${escapeHtml(contact || '—')}" readonly
            style="width:100%;padding:10px;border-radius:8px;border:1px solid var(--cane-200);
            background:var(--cane-50);font-size:13px;color:var(--cane-900)">
        </div>

        <div>
          <label style="display:block;font-size:12px;font-weight:700;color:var(--cane-700);margin-bottom:4px;">Address</label>
          <input type="text" value="${escapeHtml(address)}" readonly
            style="width:100%;padding:10px;border-radius:8px;border:1px solid var(--cane-200);
            background:var(--cane-50);font-size:13px;color:var(--cane-900)">
        </div>

        <div>
          <label style="display:block;font-size:12px;font-weight:700;color:var(--cane-700);margin-bottom:4px;">Birthday</label>
          <input type="text" value="${birthday ? escapeHtml(birthday) : '—'}" readonly
            style="width:100%;padding:10px;border-radius:8px;border:1px solid var(--cane-200);
            background:var(--cane-50);font-size:13px;color:var(--cane-900)">
        </div>

        <div>
          <label style="display:block;font-size:12px;font-weight:700;color:var(--cane-700);margin-bottom:4px;">Age</label>
          <input type="text" value="${escapeHtml(String(age))}" readonly
            style="width:100%;padding:10px;border-radius:8px;border:1px solid var(--cane-200);
            background:var(--cane-50);font-size:13px;color:var(--cane-900)">
        </div>
      </div>
    `;

    if (roleRaw === "driver") {
      contentHTML += `
        <hr style="margin:18px 0;border-color:var(--cane-200)">
        <div style="display:grid;grid-template-columns:repeat(2,1fr);gap:12px;">
          <div>
            <label style="display:block;font-size:12px;font-weight:700;color:var(--cane-700);margin-bottom:4px;">Plate Number</label>
            <input type="text" value="${escapeHtml(plate)}" readonly
              style="width:100%;padding:10px;border-radius:8px;border:1px solid var(--cane-200);
              background:var(--cane-50);font-size:13px;color:var(--cane-900)">
          </div>
          <div>
            <label style="display:block;font-size:12px;font-weight:700;color:var(--cane-700);margin-bottom:4px;">Vehicle Type</label>
            <input type="text" value="${escapeHtml(vehicleType)}" readonly
              style="width:100%;padding:10px;border-radius:8px;border:1px solid var(--cane-200);
              background:var(--cane-50);font-size:13px;color:var(--cane-900)">
          </div>
          <div>
            <label style="display:block;font-size:12px;font-weight:700;color:var(--cane-700);margin-bottom:4px;">Vehicle Model</label>
            <input type="text" value="${escapeHtml(vehicleModel)}" readonly
              style="width:100%;padding:10px;border-radius:8px;border:1px solid var(--cane-200);
              background:var(--cane-50);font-size:13px;color:var(--cane-900)">
          </div>
          <div>
            <label style="display:block;font-size:12px;font-weight:700;color:var(--cane-700);margin-bottom:4px;">Vehicle Color</label>
            <input type="text" value="${escapeHtml(vehicleColor)}" readonly
              style="width:100%;padding:10px;border-radius:8px;border:1px solid var(--cane-200);
              background:var(--cane-50);font-size:13px;color:var(--cane-900)">
          </div>
          <div>
            <label style="display:block;font-size:12px;font-weight:700;color:var(--cane-700);margin-bottom:4px;">License Expiry</label>
            <input type="text" value="${escapeHtml(licenseExpiry)}" readonly
              style="width:100%;padding:10px;border-radius:8px;border:1px solid var(--cane-200);
              background:var(--cane-50);font-size:13px;color:var(--cane-900)">
          </div>
        </div>
      `;
    }

    createModal(contentHTML);
  } catch (err) {
    console.error("Error showing details modal:", err);
    alert("Failed to load user details.");
  }
}

  // Compute age from birthday (accepts YYYY-MM-DD string or Date)
  function computeAge(birth) {
    if (!birth) return "N/A";
    let birthDate;
    if (typeof birth === "string") {
      const s = birth.trim();
      const maybe = s.split("T")[0];
      birthDate = new Date(maybe);
    } else if (birth.toDate && typeof birth.toDate === "function") {
      birthDate = birth.toDate();
    } else if (birth instanceof Date) {
      birthDate = birth;
    } else {
      birthDate = new Date(birth);
    }
    if (isNaN(birthDate.getTime())) return "N/A";
    const today = new Date();
    let age = today.getFullYear() - birthDate.getFullYear();
    const m = today.getMonth() - birthDate.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) {
      age--;
    }
    return age >= 0 ? age : "N/A";
  }

  // Escape HTML for user-controlled values
  function escapeHtml(str) {
    if (!str && str !== 0) return "";
    return String(str)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");
  }

function createModal(contentHTML) {
  const existing = document.getElementById("details-modal");
  if (existing) existing.remove();

  // Overlay (background)
  const overlay = document.createElement("div");
  overlay.id = "details-modal";
  overlay.className = `
    fixed inset-0 bg-[rgba(0,0,0,0.45)] backdrop-blur-sm 
    z-[9999] flex justify-center overflow-y-auto animate-fadeIn
  `;
  overlay.style.scrollBehavior = "smooth";
  overlay.style.padding = "40px 0"; // space top & bottom when scrolling

  // Modal container
  const modal = document.createElement("div");
  modal.className = `
    relative bg-gradient-to-b from-white to-[var(--cane-50)] 
    rounded-2xl shadow-2xl w-[90%] max-w-lg border border-[var(--cane-200)] 
    p-7 my-auto transform transition-all duration-300 animate-slideUp
  `;
  modal.style.boxShadow = "0 15px 35px rgba(0,0,0,0.25)";
  modal.style.maxHeight = "90vh"; // keep inside viewport
  modal.style.overflowY = "auto"; // allow scroll for long content
  modal.style.scrollbarWidth = "thin";
  modal.style.scrollbarColor = "var(--cane-400) transparent";

  // Modal content
  modal.innerHTML = `
    <button id="closeModalBtn" 
      class="absolute top-3 right-4 text-[var(--cane-700)] text-2xl font-bold 
      hover:text-[var(--cane-900)] hover:scale-110 transition-transform duration-200 
      bg-transparent border-none cursor-pointer">×</button>

    <div class="space-y-4">${contentHTML}</div>
  `;

  overlay.appendChild(modal);
  document.body.appendChild(overlay);

  // Close logic
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) overlay.remove();
  });
  modal.querySelector("#closeModalBtn").onclick = () => overlay.remove();
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
    
    // field_applications subcollection removed - all fields now in top-level fields collection

    // Merge all fields and remove duplicates
    const allFieldsMap = new Map();
    [...fieldsFromUserId, ...fieldsFromLandownerId, ...fieldsFromRegisteredBy].forEach(field => {
      if (field.id) {
        allFieldsMap.set(field.id, field);
      }
    });

    const handlerFields = Array.from(allFieldsMap.values());
    const handlerFieldIds = new Set(handlerFields.map(f => f.id).filter(Boolean));
    
    if (handlerFieldIds.size === 0) {
      return [];
    }

    // Step 2: Query field_joins for this handler's pending requests
    let allJoinRequests = [];

    try {
      const joinFieldsQuery = query(
        collection(db, "field_joins"),
        where("handlerId", "==", handlerId),
        where("status", "==", "pending")
      );
      const joinFieldsSnap = await getDocs(joinFieldsQuery);

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
          role: data.assignedAs || data.joinAs || data.role || "worker",
          status: data.status,
          requestedAt: data.requestedAt
        };
      });

    } catch (err) {
      console.error("❌ Error fetching join requests:", err);
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

  const q = query(
    collection(db, 'field_joins'),
    where('userId', '==', userId),
    where('status', 'in', ['pending', 'approved'])
  );
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

