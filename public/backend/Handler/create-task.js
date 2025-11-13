// create-task.js
// Place at: C:\CaneMap\public\backend\Handler\create-task.js
// ES module — uses same Firebase v12 imports as fields-map.js

import { db, auth } from '../Common/firebase-config.js';
import {
  collection, doc, addDoc, setDoc, getDocs, query, where, orderBy, getDoc
} from 'https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/12.1.0/firebase-auth.js';
// FILE: C:\CaneMap\public\backend\Handler\create-task.js   (replace lines building payload)
import { serverTimestamp, Timestamp } from 'https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js';

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
      Object.keys(payload).forEach(k => payload[k] === undefined && delete payload[k]);
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

export async function openCreateTaskModal(fieldId, options = {}) {
  const existing = document.getElementById('createTaskModal');
  if (existing) existing.remove();

  const modal = document.createElement('div');
  modal.id = 'createTaskModal';
  modal.className = 'fixed inset-0 z-[22000] flex items-center justify-center p-4';
  modal.innerHTML = `
    <div id="ct_backdrop" class="absolute inset-0 bg-black/40 backdrop-blur-sm"></div>
    <div class="relative w-full max-w-[520px] rounded-xl bg-white border border-[var(--cane-200)] shadow p-5">
      <header class="flex items-center justify-start mb-3 pb-2 border-b border-gray-200">
        <h3 class="text-xl font-semibold text-[var(--cane-900)]">Create Task</h3>
        <!-- Removed X button -->
      </header>

      <div class="space-y-4 text-sm">

        <!-- DEADLINE -->
        <div>
          <label class="text-[var(--cane-700)] font-semibold text-[15px] block mb-1">Deadline</label>
          <div class="flex items-center gap-2 mb-2">
            <input id="ct_this_week" type="checkbox" class="accent-[var(--cane-700)]" />
            <span class="text-[var(--cane-700)] font-medium">This week</span>
          </div>

          <div class="text-xs text-[var(--cane-600)] mb-1">or set time & date:</div>
          <div class="grid grid-cols-2 gap-2">
            <input id="ct_date" type="date" class="px-3 py-2 border rounded-md text-sm" />
            <input id="ct_time" type="time" class="px-3 py-2 border rounded-md text-sm" />
          </div>
        </div>

        <!-- TITLE -->
        <div>
          <label class="text-xs font-semibold text-[var(--cane-700)]">Title</label>
          <input id="ct_title" type="text" placeholder="e.g. Fertilizer application" class="w-full px-3 py-2 border rounded-md text-sm" />
        </div>

        <!-- DETAILS -->
        <div>
          <label class="text-xs font-semibold text-[var(--cane-700)]">Details</label>
          <textarea id="ct_details" rows="3" placeholder="Describe what needs to be done" class="w-full px-3 py-2 border rounded-md text-sm"></textarea>
        </div>

        <!-- ASSIGN TO -->
        <div>
          <label id="ct_assign_label" class="text-[var(--cane-700)] font-semibold text-[15px] block mb-2">Assign to:</label>

          <div class="flex gap-3 mb-3">
            <button id="ct_btn_worker" class="flex-1 border border-[var(--cane-600)] text-[var(--cane-700)] rounded-md px-3 py-2 font-medium transition">Worker</button>
            <button id="ct_btn_driver" class="flex-1 border border-[var(--cane-600)] text-[var(--cane-700)] rounded-md px-3 py-2 font-medium transition">Driver</button>
          </div>

          <!-- WORKER OPTIONS -->
          <div id="ct_worker_options" class="hidden space-y-2 mt-2 border-t pt-3">
            <div class="flex items-center justify-between">
              <label id="ct_people_label" class="text-sm font-medium text-[var(--cane-700)]">People needed:</label>
              <input id="ct_workers_count" type="number" min="1" value="1" class="w-24 px-2 py-1 border rounded-md text-sm" />
            </div>
            <div class="flex items-center gap-2">
              <input id="ct_all_workers" type="checkbox" class="accent-[var(--cane-700)]" />
              <label for="ct_all_workers" class="text-sm text-[var(--cane-700)]">All workers</label>
            </div>
          </div>
        </div>

        <div id="ct_error" class="text-xs text-red-500 hidden"></div>
      </div>

      <!-- FOOTER -->
      <footer class="mt-6 flex items-center justify-end gap-3">
        <button id="ct_cancel" class="px-3 py-2 rounded-md border hover:bg-gray-50 text-sm">Close</button>
        <button id="ct_save" class="px-4 py-2 rounded-md bg-[var(--cane-700)] hover:bg-[var(--cane-800)] text-white font-semibold text-sm shadow">Save</button>
      </footer>
    </div>
  `;

  document.body.appendChild(modal);
  const el = (s) => modal.querySelector(s);

  // --- ASSIGN-TO ERROR HELPERS (MUST BE HERE, BEFORE ANY USE) ---
  let assignErrorEl = null;
  const assignLabel = el('#ct_assign_label'); // "Assign to:" label

  function showAssignError(msg) {
    if (assignErrorEl) assignErrorEl.remove();
    assignErrorEl = document.createElement('span');
    assignErrorEl.className = 'ct_field_error ml-2 text-xs text-red-500';
    assignErrorEl.textContent = msg;
    assignLabel.appendChild(assignErrorEl);
  }

  function clearAssignError() {
    if (assignErrorEl) {
      assignErrorEl.remove();
      assignErrorEl = null;
    }
  }
// --- Now these can safely use clearAssignError ---
['#ct_date','#ct_time','#ct_title','#ct_details','#ct_workers_count','#ct_all_workers'].forEach(sel => {
  el(sel).addEventListener('focus', () => clearAssignError());
});


  // btn click handlers
  const btnWorker = el('#ct_btn_worker');
  const btnDriver = el('#ct_btn_driver');

  btnWorker.addEventListener('click', () => {
    assignType = 'worker';
    updateAssignUI();
    clearAssignError();
  });
  btnDriver.addEventListener('click', () => {
    assignType = 'driver';
    updateAssignUI();
    clearAssignError();
  });

  // --- DATE / THIS WEEK logic ---
  const dateInput = el('#ct_date');
  const timeInput = el('#ct_time');
  const weekCheck = el('#ct_this_week');
  weekCheck.addEventListener('change', () => {
    const dis = weekCheck.checked;
    [dateInput, timeInput].forEach(i => {
      i.disabled = dis;
      i.classList.toggle('bg-gray-100', dis);
      i.classList.toggle('text-gray-400', dis);
    });
    if (dis) {
      dateInput.value = '';
      timeInput.value = '';
    }
  });

  // --- ASSIGN TO logic ---
  let assignType = null;
  const workerOpts = el('#ct_worker_options');
  const allWorkersCheck = el('#ct_all_workers');
  const peopleLabel = el('#ct_people_label');
  const workerInput = el('#ct_workers_count');

  function updateAssignUI() {
    // reset styles
    [btnWorker, btnDriver].forEach(btn => {
      btn.classList.remove('bg-[var(--cane-700)]', 'text-white', 'shadow-inner');
      btn.classList.add('text-[var(--cane-700)]', 'bg-white');
    });
    workerOpts.classList.add('hidden');

    if (assignType === 'worker') {
      btnWorker.classList.remove('text-[var(--cane-700)]', 'bg-white');
      btnWorker.classList.add('bg-[var(--cane-700)]', 'text-white', 'shadow-inner');
      workerOpts.classList.remove('hidden');
    } else if (assignType === 'driver') {
      btnDriver.classList.remove('text-[var(--cane-700)]', 'bg-white');
      btnDriver.classList.add('bg-[var(--cane-700)]', 'text-white', 'shadow-inner');
    }
  }

  allWorkersCheck.addEventListener('change', () => {
    const dis = allWorkersCheck.checked;
    workerInput.disabled = dis;
    peopleLabel.classList.toggle('text-gray-400', dis);
    workerInput.classList.toggle('bg-gray-100', dis);
    workerInput.classList.toggle('text-gray-400', dis);
  });

  el('#ct_cancel').addEventListener('click', () => modal.remove());
  el('#ct_backdrop').addEventListener('click', (e) => { if (e.target.id === 'ct_backdrop') modal.remove(); });

// Helper to show error below a specific element
function showFieldError(elInput, msg) {
  // remove existing error for this field first
  const existing = elInput.parentElement.querySelector('.ct_field_error');
  if (existing) existing.remove();

  const err = document.createElement('div');
  err.className = 'ct_field_error text-xs text-red-500 mt-1';
  err.textContent = msg;
  elInput.parentElement.appendChild(err);

  elInput.focus();
}

// Helper to remove all field errors
function clearAllFieldErrors(modal) {
  modal.querySelectorAll('.ct_field_error').forEach(e => e.remove());
}

el('#ct_save').addEventListener('click', async () => {
  clearAllFieldErrors(modal);

  const titleInput = el('#ct_title');
  const detailsInput = el('#ct_details');
  const dateInput = el('#ct_date');
  const timeInput = el('#ct_time');
  const allWorkersCheck = el('#ct_all_workers');
  const workerInput = el('#ct_workers_count');

  const title = titleInput.value.trim();
  const details = detailsInput.value.trim();
  const isWeek = weekCheck.checked;
  const date = dateInput.value;
  const assignTypeValue = assignType;
  const workersCount = parseInt(workerInput.value, 10) || 0;

  // --- FIELD VALIDATION ---
  if (!title) {
    showFieldError(titleInput, 'Please enter a Title.');
    return;
  }
  if (!details) {
    showFieldError(detailsInput, 'Please enter Details.');
    return;
  }
  if (!isWeek && !date) {
    showFieldError(dateInput, 'Please set a Deadline date or check "This week".');
    return;
  }
  if (!assignTypeValue) {
    showAssignError('Please select Worker or Driver.');
    return;
  }
  if (assignTypeValue === 'worker' && !allWorkersCheck.checked && workersCount < 1) {
    showFieldError(workerInput, 'Please specify the number of workers needed.');
    return;
  }

  let scheduledAt = null;

  if (isWeek) {
    // Calculate upcoming Sunday 11:59 PM
    const now = new Date();
    const day = now.getDay(); // Sunday = 0, Monday = 1, ...
    const diffToSunday = (7 - day) % 7; // days until Sunday
    const nextSunday = new Date(now);
    nextSunday.setDate(now.getDate() + diffToSunday);
    nextSunday.setHours(23, 59, 0, 0); // 11:59:00 PM
    scheduledAt = Timestamp.fromDate(nextSunday);
  } else {
    scheduledAt = new Date(date + 'T' + (timeInput.value || '00:00') + ':00');
    scheduledAt = Timestamp.fromDate(scheduledAt);
  }

  const payload = {
    title,
    details,
    scheduled_at: scheduledAt,
    created_by: currentUserId,
    created_at: serverTimestamp(),
    assign_type: assignTypeValue,
    status: 'todo',
    metadata: {}
  };

  if (assignTypeValue === 'worker') {
    payload.metadata.workers = allWorkersCheck.checked ? 'all' : workersCount;
  }

  if (Object.keys(payload.metadata).length === 0) delete payload.metadata;

  // --- SAVE TASK ---
  const saveBtn = el('#ct_save');
  saveBtn.disabled = true;
  saveBtn.textContent = 'Saving...';

  const res = await saveTaskToFirestore(fieldId, payload);

  saveBtn.disabled = false;
  saveBtn.textContent = 'Save';

  if (res.ok) {
    const toast = document.createElement('div');
    toast.className = 'fixed right-6 bottom-6 bg-green-600 text-white px-4 py-2 rounded shadow text-sm font-medium';
    toast.textContent = '✅ Task saved successfully!';
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 2500);
    modal.remove();
    document.dispatchEvent(new CustomEvent('task:created', { detail: { fieldId } }));
  } else {
    alert('Save failed: ' + (res.errors?.join(' | ') || ''));
  }
});

// --- AUTO CLEAR ERRORS FUNCTION ---
// Call this once to attach to all relevant inputs/buttons
function attachAutoClearErrors() {
  const inputs = [
    '#ct_title', '#ct_details', '#ct_date', '#ct_time', 
    '#ct_workers_count', '#ct_all_workers'
  ];

  inputs.forEach(sel => {
    const elInput = el(sel);
    if (!elInput) return;
    elInput.addEventListener('input', clearAllErrors);
    elInput.addEventListener('change', clearAllErrors); // for checkboxes & date
  });

  // also clear assign error when clicking Worker/Driver buttons
  [btnWorker, btnDriver].forEach(btn => {
    btn.addEventListener('click', clearAllErrors);
  });
}

// clears all field errors and assign errors
function clearAllErrors() {
  clearAllFieldErrors(modal); // removes ct_field_error divs
  clearAssignError();          // removes assign-to error
}

// --- attach on modal creation ---
attachAutoClearErrors();

  return modal;
}


// expose globally for older code to call
window.openCreateTaskModal = openCreateTaskModal;

