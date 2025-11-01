// CaneMap Workers handler hooked to Firestore (falls back to localStorage)
import { db } from '../../backend/Common/firebase-config.js';
import { collection, doc, setDoc, getDocs, deleteDoc, serverTimestamp } from 'https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js';

export function initializeHandlerWorkersSection() {
  const STORAGE_KEYS = {
    farmers: 'cm_farmers',
    drivers: 'cm_drivers',
    requests: 'cm_worker_requests'
  };

  const colFarmers = () => collection(db, 'farmers');
  const colDrivers = () => collection(db, 'drivers');
  const colRequests = () => collection(db, 'worker_requests');

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
    if (refs.requestsCount) refs.requestsCount.textContent = `${state.requests.length} pending`;
    if (!refs.requestsList) return;

    if (state.requests.length === 0) {
      refs.requestsList.innerHTML = '<div class="text-sm text-[var(--cane-700)]">No pending requests.</div>';
      return;
    }

    const tpl = document.getElementById('requestItemTpl');
    if (!tpl) return;

    refs.requestsList.innerHTML = '';
    state.requests.forEach(req => {
      const node = tpl.content.cloneNode(true);
      node.querySelector('[data-field="name"]').textContent = req.name || 'Unnamed';
      node.querySelector('[data-field="role"]').textContent = req.role || '';
      node.querySelector('[data-field="barangay"]').textContent = req.barangay || '';
      node.querySelector('[data-field="phone"]').textContent = req.phone || '';
      node.querySelector('[data-action="approve"]').addEventListener('click', async () => { await onApprove(req.id); });
      node.querySelector('[data-action="reject"]').addEventListener('click', async () => { await onReject(req.id); });
      refs.requestsList.appendChild(node);
    });
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
    try {
      const [farmersSnap, driversSnap, requestsSnap] = await Promise.all([
        getDocs(colFarmers()),
        getDocs(colDrivers()),
        getDocs(colRequests())
      ]);

      state.farmers = farmersSnap.docs.map(docSnap => ({ id: docSnap.id, ...docSnap.data() }));
      state.drivers = driversSnap.docs.map(docSnap => ({ id: docSnap.id, ...docSnap.data() }));
      state.requests = requestsSnap.docs.map(docSnap => ({ id: docSnap.id, ...docSnap.data() }));

      writeJson(STORAGE_KEYS.farmers, state.farmers);
      writeJson(STORAGE_KEYS.drivers, state.drivers);
      writeJson(STORAGE_KEYS.requests, state.requests);
    } catch (err) {
      state.farmers = readJson(STORAGE_KEYS.farmers, []);
      state.drivers = readJson(STORAGE_KEYS.drivers, []);
      state.requests = readJson(STORAGE_KEYS.requests, []);
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

  async function approveRequestFirestore(req){
    try {
      const rRef = doc(colRequests(), req.id);
      await deleteDoc(rRef);

      if ((req.role || '').toLowerCase() === 'driver') {
        await addDriverFirestore({ name: req.name, phone: req.phone || '', plate: req.plate || '' });
      } else {
        await addFarmerFirestore({ name: req.name, phone: req.phone || '', barangay: req.barangay || '' });
      }
      return true;
    } catch (_) {
      return false;
    }
  }

  async function rejectRequestFirestore(req){
    try {
      await deleteDoc(doc(colRequests(), req.id));
      return true;
    } catch (_) {
      return false;
    }
  }

  async function onApprove(id){
    const idx = state.requests.findIndex(req => req.id === id);
    if (idx === -1) return;

    const req = state.requests[idx];
    state.requests.splice(idx, 1);
    writeJson(STORAGE_KEYS.requests, state.requests);
    renderRequests();

    const ok = await approveRequestFirestore(req);
    if (!ok) {
      if ((req.role || '').toLowerCase() === 'driver') {
        const drivers = readJson(STORAGE_KEYS.drivers, []);
        drivers.push({ id: uid(), name: req.name, phone: req.phone, plate: req.plate || '', since: new Date().toISOString() });
        writeJson(STORAGE_KEYS.drivers, drivers);
      } else {
        const farmers = readJson(STORAGE_KEYS.farmers, []);
        farmers.push({ id: uid(), name: req.name, phone: req.phone, barangay: req.barangay || '', since: new Date().toISOString() });
        writeJson(STORAGE_KEYS.farmers, farmers);
      }
    }

    await refresh();
  }

  async function onReject(id){
    const idx = state.requests.findIndex(req => req.id === id);
    if (idx === -1) return;

    const req = state.requests[idx];
    state.requests.splice(idx, 1);
    writeJson(STORAGE_KEYS.requests, state.requests);
    renderRequests();
    await rejectRequestFirestore(req);
    await refresh();
  }

  async function refresh(){
    await fetchAllData();
    updateSummaryCounts();
    renderWorkers();
    renderRequests();
  }

  async function init(){
    grabRefs();
    syncFilterUI(state.filter);
    attachEvents();
    await refresh();
  }

  init();
}
