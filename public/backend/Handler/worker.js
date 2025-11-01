// CaneMap Workers handler hooked to Firestore (falls back to localStorage)
import { db } from '../../backend/Common/firebase-config.js';
import { collection, doc, setDoc, getDoc, getDocs, updateDoc, deleteDoc, serverTimestamp, query, where } from 'https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js';

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
    farmers: 'Farmers',
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
      label: 'Farmer',
      icon: 'fas fa-tractor text-[var(--cane-700)]',
      name: f.name || 'Unnamed Farmer',
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
        if (!state.search) return true;
        return [worker.name, worker.contact, worker.detail]
          .join(' ')
          .toLowerCase()
          .includes(state.search.toLowerCase());
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
    if (countBadge) countBadge.textContent = `${total} pending`;

    if (total === 0) {
      refs.requestsList.innerHTML = '<div class="p-3 text-sm text-[var(--cane-700)] bg-white/60 rounded-lg">No pending requests.</div>';
      return;
    }

    refs.requestsList.innerHTML = state.requests.map((item) => {
      const dateLine = item.requestedLabel ? `<p class="text-[11px] text-gray-500">Requested ${item.requestedLabel}</p>` : '';
      return `
      <div class="request-item rounded-xl bg-white p-3 flex flex-col gap-3">
        <div class="flex justify-between gap-3">
          <div>
            <p class="text-sm font-semibold text-[var(--cane-900)]">${item.name || 'Unknown User'}</p>
            <p class="text-xs text-gray-600">${item.role || 'Worker'} • ${item.fieldName || 'Field'}</p>
            <p class="text-xs text-gray-500">${item.locationLine || ''}</p>
            ${dateLine}
          </div>
          <div class="flex gap-2">
            <button class="request-btn request-btn-primary" data-action="approve" data-path="${item.refPath}">Approve</button>
            <button class="request-btn request-btn-secondary" data-action="decline" data-path="${item.refPath}">Decline</button>
          </div>
        </div>
      </div>`;
    }).join('');

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
    button.textContent = action === 'approve' ? 'Approving…' : 'Declining…';

    const requestIndex = state.requests.findIndex(req => req.refPath === path);
    const request = requestIndex >= 0 ? state.requests[requestIndex] : null;

    try {
      const docRef = doc(db, path);
      await updateDoc(docRef, {
        status: action === 'approve' ? 'approved' : 'rejected',
        statusUpdatedAt: serverTimestamp()
      });

      if (action === 'approve' && request) {
        const roleKey = cleanString(request.role || 'worker').toLowerCase();
        const basePayload = {
          name: request.name || 'Unnamed Worker',
          phone: request.contact || '',
          barangay: request.barangay || '',
          plate: request.plate || ''
        };

        if (roleKey === 'driver') {
          await addDriverFirestore({
            name: basePayload.name,
            phone: basePayload.phone,
            plate: basePayload.plate,
            since: new Date().toISOString()
          });
        } else {
          await addFarmerFirestore({
            name: basePayload.name,
            phone: basePayload.phone,
            barangay: basePayload.barangay,
            since: new Date().toISOString()
          });
        }
      }

      if (requestIndex >= 0) {
        state.requests.splice(requestIndex, 1);
      }

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
      const [farmersSnap, driversSnap] = await Promise.all([
        getDocs(query(colFarmers()))
        ,
        getDocs(query(colDrivers()))
      ]);

      state.farmers = farmersSnap.docs.map(docSnap => ({ id: docSnap.id, ...docSnap.data() }));
      state.drivers = driversSnap.docs.map(docSnap => ({ id: docSnap.id, ...docSnap.data() }));

      writeJson(STORAGE_KEYS.farmers, state.farmers);
      writeJson(STORAGE_KEYS.drivers, state.drivers);
    } catch (err) {
      state.farmers = readJson(STORAGE_KEYS.farmers, []);
      state.drivers = readJson(STORAGE_KEYS.drivers, []);
    }
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
      const result = await loadJoinRequestsForUser();
      state.requests = result;
      renderRequests();
    } catch (err) {
      console.warn('Failed to load join requests', err);
    }
  }

  async function refresh(){
    await fetchAllData();
    updateSummaryCounts();
    renderWorkers();
    await loadJoinRequests();
  }

  async function init(){
    grabRefs();
    syncFilterUI(state.filter);
    attachEvents();
    await refresh();
  }

  init();
}

async function loadJoinRequestsForUser(){
  const userId = localStorage.getItem('userId');
  if (!userId) return [];

  const joinFieldsRef = collection(db, `field_joins/${userId}/join_fields`);
  const q = query(joinFieldsRef, where('status', '==', 'pending'));
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
