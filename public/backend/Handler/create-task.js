// create-task.js
// Place at: C:\CaneMap\public\backend\Handler\create-task.js
// ES module — uses same Firebase v12 imports as fields-map.js

import { db, auth } from '../Common/firebase-config.js';
import {
  collection, doc, addDoc, setDoc, getDocs, query, where, orderBy, getDoc
} from 'https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/12.1.0/firebase-auth.js';

// Expose function globally later: window.openCreateTaskModal = openCreateTaskModal;
let currentUserId = null;
onAuthStateChanged(auth, user => { currentUserId = user ? user.uid : null; });

// Helper to escape html
function escapeHtml(s){ return String(s||'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;'); }

// Attempt multiple queries to find drivers/workers associated with a field
async function fetchParticipantsForField(fieldId) {
  // Try a few collection patterns; return { workers: [...], driversPresent: [...] }
  const workers = [];
  const driversPresent = [];
  try {
    // 1) fields/{fieldId}/members
    const c1 = collection(db, 'fields', fieldId, 'members');
    const snap1 = await getDocs(query(c1, orderBy('name', 'asc')));
    if (!snap1.empty) {
      snap1.forEach(d => {
        const data = d.data();
        if ((data.role || '').toLowerCase().includes('driver')) driversPresent.push({ id: d.id, ...data });
        else workers.push({ id: d.id, ...data });
      });
      return { workers, driversPresent };
    }
  } catch(e){ /* ignore */ }

  try {
    // 2) field_participants collection with fieldId property
    const c2 = query(collection(db, 'field_participants'), where('fieldId', '==', fieldId), orderBy('name','asc'));
    const snap2 = await getDocs(c2);
    if (!snap2.empty) {
      snap2.forEach(d => {
        const data = d.data();
        if ((data.role || '').toLowerCase().includes('driver')) driversPresent.push({ id: d.id, ...data });
        else workers.push({ id: d.id, ...data });
      });
      return { workers, driversPresent };
    }
  } catch(e){ /* ignore */ }

  try {
    // 3) fields_applications/{requestedBy}/fields/{fieldId}/workers (fallback)
    // We can't know requestedBy here; skip
  } catch(e){ /* ignore */ }

  // If still empty return empty arrays
  return { workers, driversPresent };
}

// Fetch rental drivers available in Ormoc City (fallback queries)
async function fetchRentalDrivers(cityName = 'Ormoc City') {
  try {
    const q = query(collection(db, 'drivers_for_rent'), where('city', '==', cityName), orderBy('name','asc'));
    const snap = await getDocs(q);
    const arr = [];
    if (!snap.empty) {
      snap.forEach(d => arr.push({ id: d.id, ...d.data() }));
    }
    return arr;
  } catch(e) {
    // fallback: top-level drivers collection filtered
    try {
      const q2 = query(collection(db, 'drivers'), where('city','==', cityName), orderBy('name','asc'));
      const s2 = await getDocs(q2);
      const arr2 = [];
      s2.forEach(d => arr2.push({ id: d.id, ...d.data() }));
      return arr2;
    } catch(err) {
      console.warn('fetchRentalDrivers failed', err);
      return [];
    }
  }
}

// Save task to both subcollection and top-level tasks (best effort)
async function saveTaskToFirestore(fieldId, payload) {
  const result = { ok: false, errors: [] };
  try {
    // add to fields/{fieldId}/tasks if possible
    try {
      const ref = collection(db, 'fields', fieldId, 'tasks');
      await addDoc(ref, payload);
    } catch (err) {
      result.errors.push('subcollection:' + err.message);
    }

    // also add to top-level tasks collection as duplicate/fallback
    try {
      const topRef = collection(db, 'tasks');
      await addDoc(topRef, { ...payload, fieldId });
    } catch (err) {
      result.errors.push('topcollection:' + err.message);
    }

    result.ok = true;
    return result;
  } catch(e) {
    return { ok: false, errors: [e.message || e] };
  }
}

// Build and open the small Create Task modal
export async function openCreateTaskModal(fieldId, options = {}) {
  // options can include small boolean for size etc.
  // Remove existing create-task modal
  const existing = document.getElementById('createTaskModal');
  if (existing) existing.remove();

  // Create modal element
  const modal = document.createElement('div');
  modal.id = 'createTaskModal';
  modal.className = 'fixed inset-0 z-[22000] flex items-center justify-center p-4';
  modal.innerHTML = `
    <div id="ct_backdrop" class="absolute inset-0 bg-black/40 backdrop-blur-sm"></div>
    <div class="relative w-full max-w-[520px] rounded-xl bg-white border border-[var(--cane-200)] shadow-xl p-4">
      <header class="flex items-center justify-between gap-3 mb-3">
        <h3 class="text-lg font-semibold text-[var(--cane-900)]">Create Task</h3>
        <button id="ct_close_x" class="inline-flex items-center justify-center w-8 h-8 rounded-md hover:bg-gray-100">
          <i class="fas fa-times text-[var(--cane-700)]"></i>
        </button>
      </header>

      <div class="space-y-3 text-sm">
        <div class="grid grid-cols-2 gap-2">
          <label class="col-span-2 text-xs font-semibold text-[var(--cane-700)]">When</label>
          <input id="ct_date" type="date" class="px-3 py-2 border rounded-md text-sm" />
          <input id="ct_time" type="time" class="px-3 py-2 border rounded-md text-sm" />
        </div>

        <div>
          <label class="text-xs font-semibold text-[var(--cane-700)]">Title</label>
          <input id="ct_title" type="text" placeholder="e.g. Pest control — Plot A" class="w-full px-3 py-2 border rounded-md text-sm" />
        </div>

        <div>
          <label class="text-xs font-semibold text-[var(--cane-700)]">Details</label>
          <textarea id="ct_details" rows="3" placeholder="Describe what needs to be done" class="w-full px-3 py-2 border rounded-md text-sm"></textarea>
        </div>

        <div>
          <label class="text-xs font-semibold text-[var(--cane-700)]">Assign to</label>
          <div class="mt-1 flex gap-2 items-center">
            <select id="ct_assign_type" class="px-3 py-2 border rounded-md text-sm">
              <option value="worker" selected>Worker</option>
              <option value="driver">Driver</option>
            </select>
            <div id="ct_assign_placeholder" class="flex-1 text-xs text-[var(--cane-600)]">Choose assignment type</div>
          </div>
        </div>

        <div id="ct_worker_options" class="hidden space-y-2">
          <div class="flex items-center gap-2">
            <input id="ct_all_workers" type="checkbox" />
            <label for="ct_all_workers" class="text-xs">All workers</label>
            <div class="flex items-center ml-auto gap-2">
              <label class="text-xs">Needed:</label>
              <input id="ct_workers_count" type="number" min="1" class="w-20 px-2 py-1 border rounded-md text-sm" />
            </div>
          </div>
        </div>

        <div id="ct_driver_options" class="hidden space-y-2">
          <div class="text-xs text-[var(--cane-700)]">Drivers currently on field</div>
          <div id="ct_drivers_list" class="max-h-24 overflow-auto space-y-1 mt-1 p-1 border rounded-md"></div>

          <div class="text-xs text-[var(--cane-700)]">Rental drivers (Ormoc City)</div>
          <div id="ct_rental_list" class="max-h-24 overflow-auto space-y-1 mt-1 p-1 border rounded-md"></div>

          <div class="flex items-center gap-2 mt-1">
            <input id="ct_any_driver" type="checkbox" />
            <label for="ct_any_driver" class="text-xs">Any available driver</label>
          </div>
        </div>

        <div id="ct_error" class="text-xs text-red-500 hidden"></div>
      </div>

      <footer class="mt-4 flex items-center justify-end gap-3">
        <button id="ct_cancel" class="px-3 py-2 rounded-md border hover:bg-gray-50 text-sm">Close</button>
        <button id="ct_save" class="px-4 py-2 rounded-md bg-[var(--cane-700)] hover:bg-[var(--cane-800)] text-white font-semibold text-sm shadow">Save</button>
      </footer>
    </div>
  `;

  document.body.appendChild(modal);

  // short helpers to select elements
  const el = (sel) => modal.querySelector(sel);

  // set default date/time to today + current time
  const dateInput = el('#ct_date');
  const timeInput = el('#ct_time');
  const today = new Date();
  dateInput.value = today.toISOString().slice(0,10);
  timeInput.value = today.toTimeString().slice(0,5);

  // show/hide assign sections
  const assignSelect = el('#ct_assign_type');
  const workerOpts = el('#ct_worker_options');
  const driverOpts = el('#ct_driver_options');

  function updateAssignUI() {
    const v = assignSelect.value;
    if (v === 'worker') {
      workerOpts.classList.remove('hidden');
      driverOpts.classList.add('hidden');
      el('#ct_assign_placeholder').textContent = 'Assign to workers';
    } else {
      workerOpts.classList.add('hidden');
      driverOpts.classList.remove('hidden');
      el('#ct_assign_placeholder').textContent = 'Assign to drivers';
    }
  }
  assignSelect.addEventListener('change', updateAssignUI);
  updateAssignUI();

  // fetch participants + rental drivers
  const driversListEl = el('#ct_drivers_list');
  const rentalListEl = el('#ct_rental_list');

  (async () => {
    const { workers, driversPresent } = await fetchParticipantsForField(fieldId).catch(()=>({workers:[],driversPresent:[]}));
    // populate driversPresent
    driversPresent.forEach(d => {
      const id = 'drv_' + (d.id||Math.random().toString(36).slice(2,8));
      const html = `<label class="flex items-center gap-2 text-xs"><input type="radio" name="ct_driver_select" value="${escapeHtml(d.id || d.name || id)}" /> <span>${escapeHtml(d.name || d.fullname || d.displayName || 'Unnamed')}</span> <small class="text-[10px] text-[var(--cane-600)] ml-2">${escapeHtml(d.truck_type || d.vehicle || '')}</small></label>`;
      driversListEl.insertAdjacentHTML('beforeend', html);
    });

    // workers count default
    if (workers && workers.length > 0) {
      // nothing to list here in compact UI; the option All workers / number is enough
      el('#ct_workers_count').value = Math.min(3, workers.length);
    }

    // rental drivers
    const rentals = await fetchRentalDrivers('Ormoc City').catch(()=>[]);
    rentals.forEach(d => {
      const id = 'rental_' + (d.id||Math.random().toString(36).slice(2,8));
      const html = `<label class="flex items-center gap-2 text-xs"><input type="radio" name="ct_rental_select" value="${escapeHtml(d.id || d.name)}" /> <span>${escapeHtml(d.name || 'Unnamed')}</span> <small class="text-[10px] text-[var(--cane-600)] ml-2">Age: ${escapeHtml(String(d.age || '—'))} • ${escapeHtml(d.truck_type || d.vehicle || '')}</small></label>`;
      rentalListEl.insertAdjacentHTML('beforeend', html);
    });

    if (!driversPresent.length && rentals.length === 0) {
      driversListEl.innerHTML = `<div class="text-xs text-[var(--cane-500)]">No drivers found for this field.</div>`;
      rentalListEl.innerHTML = `<div class="text-xs text-[var(--cane-500)]">No rental drivers found in Ormoc City.</div>`;
    }
  })();

  // close handlers
  el('#ct_close_x').addEventListener('click', () => modal.remove());
  el('#ct_cancel').addEventListener('click', () => modal.remove());
  el('#ct_backdrop').addEventListener('click', (e) => { if (e.target.id === 'ct_backdrop') modal.remove(); });

  // Save handler
  el('#ct_save').addEventListener('click', async () => {
    el('#ct_error').classList.add('hidden');
    const title = el('#ct_title').value.trim();
    const details = el('#ct_details').value.trim();
    const date = el('#ct_date').value;
    const time = el('#ct_time').value;
    const assignType = el('#ct_assign_type').value;
    const allWorkers = el('#ct_all_workers').checked;
    const workersCount = parseInt(el('#ct_workers_count').value, 10) || null;
    const anyDriver = el('#ct_any_driver').checked;

    // selected driver from present drivers or rentals (priority: present drivers, then rentals)
    const selectedDriverRadio = modal.querySelector('input[name="ct_driver_select"]:checked');
    const selectedRentalRadio = modal.querySelector('input[name="ct_rental_select"]:checked');
    const assignedDriver = selectedDriverRadio ? selectedDriverRadio.value : (selectedRentalRadio ? selectedRentalRadio.value : null);

    // basic validation
    if (!title) {
      el('#ct_error').textContent = 'Please enter a short title for the task.'; el('#ct_error').classList.remove('hidden'); return;
    }
    if (!date) { el('#ct_error').textContent = 'Please select a date.'; el('#ct_error').classList.remove('hidden'); return; }

    // build scheduled_at ISO (local)
    const scheduledAt = new Date(date + 'T' + (time || '00:00') + ':00');
    const payload = {
      title,
      details,
      scheduled_at: scheduledAt,
      created_by: currentUserId || 'unknown',
      created_at: new Date(),
      assign_type: assignType, // 'worker' | 'driver'
      status: 'todo',
      metadata: {
        workers: assignType === 'worker' ? (allWorkers ? 'all' : (workersCount || 1)) : null,
        driver_assigned: assignType === 'driver' ? (assignedDriver || (anyDriver ? 'any' : null)) : null,
      },
    };

    // disable save while in progress
    const saveBtn = el('#ct_save');
    saveBtn.disabled = true;
    saveBtn.textContent = 'Saving...';

    const res = await saveTaskToFirestore(fieldId, payload);
    saveBtn.disabled = false;
    saveBtn.textContent = 'Save';

    if (res.ok) {
      // small success toast-like
      const tiny = document.createElement('div');
      tiny.className = 'fixed right-6 bottom-6 bg-white border px-3 py-2 rounded shadow-lg text-sm';
      tiny.textContent = 'Task saved';
      document.body.appendChild(tiny);
      setTimeout(()=>tiny.remove(), 2400);

      modal.remove();
      // optionally trigger an event so parent modal can refresh tasks
      document.dispatchEvent(new CustomEvent('task:created', { detail: { fieldId } }));
    } else {
      el('#ct_error').textContent = 'Save failed. ' + (res.errors?.join(' | ') || '');
      el('#ct_error').classList.remove('hidden');
    }
  });

  // return modal DOM reference
  return modal;
}

// expose globally for older code to call
window.openCreateTaskModal = openCreateTaskModal;
