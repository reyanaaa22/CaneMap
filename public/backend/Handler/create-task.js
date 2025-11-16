// create-task.js
import { db, auth } from '../Common/firebase-config.js';
import {
  collection, doc, addDoc, updateDoc, getDocs, query, where, orderBy, getDoc, collectionGroup, serverTimestamp, Timestamp
} from 'https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/12.1.0/firebase-auth.js';

let currentUserId = null;
onAuthStateChanged(auth, user => { currentUserId = user ? user.uid : null; });

// Helper to escape html
function escapeHtml(s){ return String(s||'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;'); }

async function updateFieldVariety(fieldId, variety) {
  if (!variety || !currentUserId) return;
  try {
    const fieldRef = doc(db, 'field_applications', currentUserId, 'fields', fieldId);
    await updateDoc(fieldRef, { sugarcane_variety: variety });
    console.log(`Field ${fieldId} sugarcane_variety updated to ${variety}`);
  } catch (err) {
    console.error('Failed to update field variety:', err);
  }
}

// Save task to Firestore (subcollection + top-level fallback)
async function saveTaskToFirestore(fieldId, payload) {
  const result = { ok: false, errors: [] };
  try {
    try {
      const ref = collection(db, 'fields', fieldId, 'tasks');
      Object.keys(payload).forEach(k => payload[k] === undefined && delete payload[k]);
      await addDoc(ref, payload);
    } catch (err) {
      result.errors.push('subcollection:' + err.message);
    }
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

// Fetch drivers joined for this field
async function fetchDriversForField(fieldId) {
  const drivers = [];
  try {
    const q = query(
      collectionGroup(db, 'join_fields'),
      where('fieldId', '==', fieldId),
      where('role', '==', 'driver'),
      where('status', '==', 'approved')
    );
    const snap = await getDocs(q);
    const seenIds = new Set();

    for (const docSnap of snap.docs) {
      const data = docSnap.data();
      const userId = data.user_uid || data.userId || data.user_id;
      if (!userId || seenIds.has(userId)) continue;
      seenIds.add(userId);

      const badgeDoc = await getDoc(doc(db, 'Drivers_Badge', userId));
      const badgeData = badgeDoc.exists() ? badgeDoc.data() : null;
      if (!badgeData) continue;

      drivers.push({
        id: userId,
        fullname: badgeData.fullname || 'Unknown',
        vehicle_type: badgeData.other_vehicle_type || 'Unknown',
        contact_number: badgeData.contact_number || 'N/A',
        plate_number: badgeData.plate_number || 'N/A'
      });
    }
  } catch (err) {
    console.error('Error fetching drivers for field:', err);
  }
  return drivers;
}

// Populate driver dropdown
async function populateDriverDropdown(modal, fieldId) {
  const dropdownBtn = modal.querySelector('#ct_driver_dropdown_btn');
  const dropdownList = modal.querySelector('#ct_driver_dropdown_list');
  dropdownList.innerHTML = '';

  dropdownList.innerHTML = '';

  const clearDiv = document.createElement('div');
  clearDiv.className = 'px-3 py-2 text-green-500 hover:bg-gray-100 cursor-pointer font-medium transition duration-200 transform hover:scale-105';
  clearDiv.textContent = 'Clear';
  clearDiv.addEventListener('click', () => {
    dropdownBtn.textContent = 'Select driver';
    dropdownBtn.dataset.driverId = '';
    dropdownList.classList.add('hidden');
    
    // Clear driver error if any
    const driverErrorEl = modal.querySelector('#ct_driver_error');
    driverErrorEl.textContent = '';
    driverErrorEl.classList.add('hidden');
  });
  dropdownList.appendChild(clearDiv);

  const drivers = await fetchDriversForField(fieldId);

  if (drivers.length === 0) {
    dropdownBtn.textContent = 'No drivers';
    dropdownBtn.classList.add('bg-gray-100', 'text-gray-400', 'cursor-not-allowed');
    dropdownBtn.style.pointerEvents = 'none';

    const div = document.createElement('div');
    div.className = 'px-3 py-2 text-gray-500';
    div.textContent = 'No drivers joined this field';
    dropdownList.appendChild(div);
    return;
  }

  drivers.forEach(d => {
    const div = document.createElement('div');
    div.className = 'px-3 py-2 hover:bg-gray-100 cursor-pointer transition duration-200 transform hover:scale-105';
    div.innerHTML = `
      <div class="font-medium">${d.fullname} (${d.contact_number})</div>
      <div class="text-sm text-gray-600">${d.vehicle_type} — ${d.plate_number}</div>
    `;
    div.addEventListener('click', () => {
      dropdownBtn.textContent = d.fullname;
      dropdownBtn.dataset.driverId = d.id;
      dropdownList.classList.add('hidden');
    });
    dropdownList.appendChild(div);
  });

  // Toggle dropdown
  dropdownBtn.addEventListener('click', () => {
    dropdownList.classList.toggle('hidden');
  });
  
}

// Main function to open modal
export async function openCreateTaskModal(fieldId) {
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
      </header>

      <div class="space-y-4 text-sm">
        <div class="flex items-center gap-2 mb-2">
          <label id="ct_deadline_label" class="text-[var(--cane-700)] font-semibold text-[15px]">Deadline</label>
          <span id="ct_deadline_error" class="text-xs text-red-500 hidden ml-2"></span>
        </div>

        <div class="flex items-center gap-2 mb-2">
          <input id="ct_this_week" type="checkbox" class="accent-[var(--cane-700)]" />
          <span class="text-[var(--cane-700)] font-medium">This week</span>
        </div>

        <div class="text-xs text-[var(--cane-600)] mb-1">or set time & date:</div>
        <div class="grid grid-cols-2 gap-2">
          <input id="ct_date" type="date" class="px-3 py-2 border rounded-md text-sm" />
          <input id="ct_time" type="time" class="px-3 py-2 border rounded-md text-sm" />
        </div>

        <!-- TASK TYPE DROPDOWN -->
        <div>
          <label class="text-xs font-semibold text-[var(--cane-700)]">Task Type</label>
          <select id="ct_title" 
              class="w-full px-3 py-2 border rounded-md text-sm">
              <option value="">Select task...</option>
              <option value="plowing">Plowing</option>
              <option value="harrowing">Harrowing</option>
              <option value="furrowing">Furrowing</option>
              <option value="planting">Planting (0 DAP)</option>
              <option value="basal_fertilizer">Basal Fertilizer (0–30 DAP)</option>
              <option value="main_fertilization">Main Fertilization (45–60 DAP)</option>
              <option value="spraying">Spraying</option>
              <option value="others">Others</option>
          </select>
        </div>

        <!-- PLANTING → SHOW VARIETY -->
        <div id="ct_variety_section" class="hidden mt-3">
          <label class="text-xs font-semibold text-[var(--cane-700)]">Sugarcane Variety</label>
          <select id="sugarcane_variety"
              class="form-select w-full px-3 py-2 border rounded-md text-sm">
              <option value="">Select variety...</option>
              <option value="PSR 07-195">PSR 07-195</option>
              <option value="PSR 03-171">PSR 03-171</option>
              <option value="Phil 93-1601">Phil 93-1601</option>
              <option value="Phil 94-0913">Phil 94-0913</option>
              <option value="Phil 92-0577">Phil 92-0577</option>
              <option value="Phil 92-0051">Phil 92-0051</option>
              <option value="Phil 99-1793">Phil 99-1793</option>
              <option value="VMC 84-524">VMC 84-524</option>
              <option value="LCP 85-384">LCP 85-384</option>
              <option value="BZ 148">BZ 148</option>
          </select>
        </div>

        <!-- BASAL FERTILIZER -->
        <div id="ct_basal_section" class="hidden mt-3">
          <label class="text-xs font-semibold text-[var(--cane-700)]">Fertilizer Type</label>
          <input id="basal_type" type="text" placeholder="e.g. 14-14-14" 
                class="w-full px-3 py-2 border rounded-md text-sm mt-1"/>

          <label class="text-xs font-semibold text-[var(--cane-700)] mt-2 block">Amount per Hectare</label>
          <input id="basal_amount" type="number" placeholder="kg/ha"
                class="w-full px-3 py-2 border rounded-md text-sm mt-1"/>
        </div>

        <!-- MAIN FERTILIZATION -->
        <div id="ct_mainfert_section" class="hidden mt-3">
          <label class="text-xs font-semibold text-[var(--cane-700)]">Amount per Hectare</label>
          <input id="mainfert_amount" type="number" placeholder="kg/ha"
                class="w-full px-3 py-2 border rounded-md text-sm mt-1"/>
        </div>

        <!-- SPRAYING -->
        <div id="ct_spraying_section" class="hidden mt-3">
          <label class="text-xs font-semibold text-[var(--cane-700)]">Spray Type</label>
          <input id="spray_type" type="text" placeholder="e.g. Herbicide, Insecticide..."
                class="w-full px-3 py-2 border rounded-md text-sm mt-1"/>
        </div>

        <!-- OTHERS -->
        <div id="ct_other_section" class="hidden mt-3">
          <label class="text-xs font-semibold text-[var(--cane-700)]">Specify Task</label>
          <input id="other_title" type="text" placeholder="Enter task..."
                class="w-full px-3 py-2 border rounded-md text-sm mt-1"/>
        </div>

        <div>
          <label class="text-xs font-semibold text-[var(--cane-700)]">Details</label>
          <textarea id="ct_details" rows="3" placeholder="Describe what needs to be done" class="w-full px-3 py-2 border rounded-md text-sm"></textarea>
        </div>

        <div>
          <label id="ct_assign_label" class="text-[var(--cane-700)] font-semibold text-[15px] block mb-2">Assign to:</label>
          <div class="flex gap-3 mb-3">
            <button id="ct_btn_worker" class="flex-1 border border-[var(--cane-600)] text-[var(--cane-700)] rounded-md px-3 py-2 font-medium transition">Worker</button>
            <button id="ct_btn_driver" class="flex-1 border border-[var(--cane-600)] text-[var(--cane-700)] rounded-md px-3 py-2 font-medium transition">Driver</button>
          </div>

          <div id="ct_worker_options" class="hidden space-y-2 mt-2 border-t pt-3">
            <div class="flex items-center justify-between">
              <label id="ct_people_label" class="text-sm font-medium text-[var(--cane-700)]">People needed:</label>
              <input id="ct_workers_count" type="number" min="0" value="0" class="w-24 px-2 py-1 border rounded-md text-sm" />
            </div>
            <div class="flex items-center gap-2">
              <input id="ct_all_workers" type="checkbox" class="accent-[var(--cane-700)]" />
              <label for="ct_all_workers" class="text-sm text-[var(--cane-700)]">All workers</label>
            </div>
            <div id="ct_worker_error" class="text-xs text-red-500 mt-1 hidden"></div>
          </div>

          <div id="ct_driver_options" class="hidden space-y-2 mt-2 border-t pt-3">
            <div class="flex items-center gap-2">
              <input id="ct_any_driver" type="checkbox" class="accent-[var(--cane-700)]" />
              <label for="ct_any_driver" class="text-sm text-[var(--cane-700)]">Any available driver</label>
            </div>
            <div class="relative w-full">
              <div id="ct_driver_dropdown_btn" 
                  class="px-3 py-2 border rounded-md text-sm cursor-pointer bg-white flex justify-between items-center hover:bg-gray-100 transition-colors duration-200">
                <span>Select driver</span>
                <svg class="w-4 h-4 text-gray-500 ml-2" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M19 9l-7 7-7-7"/>
                </svg>
              </div>
              <div id="ct_driver_dropdown_list" class="absolute left-0 bottom-full w-full border rounded shadow mb-1 bg-white hidden max-h-60 overflow-y-auto z-50"></div>
            </div>
            <div id="ct_driver_error" class="text-xs text-red-500 mt-1 hidden"></div>
          </div>
          
        </div>
      </div>

      <footer class="mt-6 flex items-center justify-end gap-3">
        <button id="ct_cancel" class="px-3 py-2 rounded-md border hover:bg-gray-50 text-sm">Close</button>
        <button id="ct_save" class="px-4 py-2 rounded-md bg-[var(--cane-700)] hover:bg-[var(--cane-800)] text-white font-semibold text-sm shadow">Save</button>
      </footer>
    </div>
  `;

  document.body.appendChild(modal);
  const el = s => modal.querySelector(s);

  // Extra sections
  const varietySec = el("#ct_variety_section");
  const varietySelect = el('#sugarcane_variety');
  // Update Firestore immediately when sugarcane variety changes
  varietySelect.addEventListener('change', async () => {
    const selectedVariety = varietySelect.value;
    if (!selectedVariety) return;

    try {
      await updateFieldVariety(fieldId, selectedVariety);
      console.log(`Variety for field ${fieldId} set to ${selectedVariety}`);
    } catch (err) {
      console.error('Error updating variety:', err);
    }
  });

  const basalSec = el("#ct_basal_section");
  const mainfertSec = el("#ct_mainfert_section");
  const sprayingSec = el("#ct_spraying_section");
  const otherSec = el("#ct_other_section");

  const taskTitle = el("#ct_title");

  // Show/hide extra fields based on task type
  taskTitle.addEventListener("change", () => {
    const v = taskTitle.value;

    // Hide all first
    varietySec.classList.add("hidden");
    basalSec.classList.add("hidden");
    mainfertSec.classList.add("hidden");
    sprayingSec.classList.add("hidden");
    otherSec.classList.add("hidden");

    if (v === "planting") varietySec.classList.remove("hidden");
    if (v === "basal_fertilizer") basalSec.classList.remove("hidden");
    if (v === "main_fertilization") mainfertSec.classList.remove("hidden");
    if (v === "spraying") sprayingSec.classList.remove("hidden");
    if (v === "others") otherSec.classList.remove("hidden");
  });

  // --- Variables ---
  const btnWorker = el('#ct_btn_worker');
  const btnDriver = el('#ct_btn_driver');
  const workerOpts = el('#ct_worker_options');
  const driverOpts = el('#ct_driver_options');
  const allWorkersCheck = el('#ct_all_workers');
  const workerInput = el('#ct_workers_count');
  const peopleLabel = el('#ct_people_label');
  const anyDriverCheck = el('#ct_any_driver');
  const dateInput = el('#ct_date');
  const timeInput = el('#ct_time');
  const weekCheck = el('#ct_this_week');
  const dropdownBtn = el('#ct_driver_dropdown_btn');
  const dropdownList = el('#ct_driver_dropdown_list');
  const driverErrorEl = el('#ct_driver_error');

  
  // Clear driver error when a driver is selected from the dropdown
  dropdownList.addEventListener('click', () => {
    driverErrorEl.textContent = '';
    driverErrorEl.classList.add('hidden');
  });

  // Clear driver error when "Any available driver" is checked or unchecked
  anyDriverCheck.addEventListener('change', () => {
    if (anyDriverCheck.checked) { 
        dropdownBtn.classList.add('bg-gray-100','text-gray-400','cursor-not-allowed'); 
        dropdownBtn.style.pointerEvents='none'; 
        dropdownBtn.textContent='Any available driver';
        driverErrorEl.textContent = '';
        driverErrorEl.classList.add('hidden');
    } else { 
        dropdownBtn.classList.remove('bg-gray-100','text-gray-400','cursor-not-allowed'); 
        dropdownBtn.style.pointerEvents='auto'; 
        dropdownBtn.textContent='Select driver'; 
    }
  });

  let assignType = null;
  let assignErrorEl = null;

  function showAssignError(msg) {
    if (assignErrorEl) assignErrorEl.remove();
    assignErrorEl = document.createElement('span');
    assignErrorEl.className = 'text-xs text-red-500 mt-1 block';
    assignErrorEl.textContent = msg;
    el('#ct_assign_label').appendChild(assignErrorEl);
  }

  function clearAssignError() {
    if (assignErrorEl) { assignErrorEl.remove(); assignErrorEl = null; }
  }

function updateAssignUI() {
    // Reset both buttons
    [btnWorker, btnDriver].forEach(btn => {
        btn.classList.remove('bg-green-700','text-white','shadow-inner');
        btn.classList.add('bg-white','text-gray-700');
    });

    workerOpts.classList.add('hidden');
    driverOpts.classList.add('hidden');

    // Apply active styles
    if(assignType === 'worker') {
        btnWorker.classList.remove('bg-white','text-gray-700');
        btnWorker.classList.add('bg-green-700','text-white','shadow-inner');
        workerOpts.classList.remove('hidden');

        // Force inline text color
        btnWorker.style.color = '#ffffff';
        btnDriver.style.color = '#4b5563'; // gray-700
    }
    if(assignType === 'driver') {
        btnDriver.classList.remove('bg-white','text-gray-700');
        btnDriver.classList.add('bg-green-700','text-white','shadow-inner');
        driverOpts.classList.remove('hidden');

        btnDriver.style.color = '#ffffff';
        btnWorker.style.color = '#4b5563'; // gray-700
    }
}


  // --- Worker / Driver button events ---
  btnWorker.addEventListener('click', () => { assignType='worker'; updateAssignUI(); clearAssignError(); });
  btnDriver.addEventListener('click', async () => { assignType='driver'; updateAssignUI(); clearAssignError(); await populateDriverDropdown(modal, fieldId); });

workerInput.addEventListener('input', () => {
  const errorEl = el('#ct_worker_error');
  if(parseInt(workerInput.value,10) > 0 || allWorkersCheck.checked){
    errorEl.textContent = '';
    errorEl.classList.add('hidden');
  }
});

allWorkersCheck.addEventListener('change', () => {
  const dis = allWorkersCheck.checked;
  workerInput.disabled = dis;
  peopleLabel.classList.toggle('text-gray-400', dis);
  workerInput.classList.toggle('bg-gray-100', dis);
  workerInput.classList.toggle('text-gray-400', dis);
  if(dis) workerInput.value = 0; // reset
  const errorEl = el('#ct_worker_error');
  errorEl.textContent = '';
  errorEl.classList.add('hidden');
});


  // --- Driver checkbox ---
  anyDriverCheck.addEventListener('change', () => {
    const dropdownBtn = el('#ct_driver_dropdown_btn');
    if (anyDriverCheck.checked) { dropdownBtn.classList.add('bg-gray-100','text-gray-400','cursor-not-allowed'); dropdownBtn.style.pointerEvents='none'; }
    else { dropdownBtn.classList.remove('bg-gray-100','text-gray-400','cursor-not-allowed'); dropdownBtn.style.pointerEvents='auto'; dropdownBtn.textContent='Select driver'; }
  });

  // --- Date / This week ---
  weekCheck.addEventListener('change', () => {
    const dis = weekCheck.checked;
    [dateInput,timeInput].forEach(i => { i.disabled=dis; i.classList.toggle('bg-gray-100',dis); i.classList.toggle('text-gray-400',dis); });
    if(dis){ dateInput.value=''; timeInput.value=''; }
  });

  // --- Cancel / Backdrop ---
  el('#ct_cancel').addEventListener('click',()=>modal.remove());
  el('#ct_backdrop').addEventListener('click',(e)=>{ if(e.target.id==='ct_backdrop') modal.remove(); });

  // --- Save button ---
el('#ct_save').addEventListener('click', async () => {
  modal.querySelectorAll('.ct_field_error').forEach(e => e.remove());
  const title = el('#ct_title').value.trim();
  const details = el('#ct_details').value.trim();
  const isWeek = weekCheck.checked;
  const date = dateInput.value;
  const workersCount = parseInt(workerInput.value, 10) || 0;

  // --- Validation ---
  if (!title) {
    el('#ct_title').focus();
    el('#ct_title').insertAdjacentHTML('afterend', '<div class="ct_field_error text-xs text-red-500 mt-1">Please enter a Title.</div>');
    return;
  }
  if (!details) {
    el('#ct_details').focus();
    el('#ct_details').insertAdjacentHTML('afterend', '<div class="ct_field_error text-xs text-red-500 mt-1">Please enter Details.</div>');
    return;
  }

  const deadlineErrorEl = el('#ct_deadline_error');
  deadlineErrorEl.textContent = '';
  deadlineErrorEl.classList.add('hidden');
  if (!isWeek && !date) {
    dateInput.focus();
    deadlineErrorEl.textContent = 'Please set a Deadline date or check "This week".';
    deadlineErrorEl.classList.remove('hidden');
    return;
  }

  if (!assignType) { showAssignError('Please select Worker or Driver.'); return; }
  if (assignType === 'worker' && !allWorkersCheck.checked && workersCount <= 0) {
    const errorEl = el('#ct_worker_error');
    errorEl.textContent = 'Please specify the number of workers needed.';
    errorEl.classList.remove('hidden');
    workerInput.focus();
    return;
  }
  if (assignType === 'driver' && !anyDriverCheck.checked && !el('#ct_driver_dropdown_btn').dataset.driverId) {
    const driverErrorEl = el('#ct_driver_error');
    driverErrorEl.textContent = 'Please select a driver or check "Any available driver".';
    driverErrorEl.classList.remove('hidden');
    return;
  }

  // --- Confirmation Modal ---
  const confirmModal = document.createElement('div');
  confirmModal.className = 'fixed inset-0 z-[23000] flex items-center justify-center bg-black/40';
  confirmModal.innerHTML = `
    <div class="bg-white rounded-xl p-6 max-w-[360px] w-full text-center shadow">
      <h3 class="text-lg font-semibold mb-4">Are you sure?</h3>
      <p class="text-sm text-gray-600 mb-6">Do you want to save this task?</p>
      <div class="flex justify-center gap-3">
        <button id="confirmCancel" class="px-4 py-2 rounded border hover:bg-gray-50">Cancel</button>
        <button id="confirmOk" class="px-4 py-2 rounded bg-green-600 text-white hover:bg-green-700">OK</button>
      </div>
    </div>
  `;
  document.body.appendChild(confirmModal);

  const removeConfirm = () => confirmModal.remove();

  confirmModal.querySelector('#confirmCancel').addEventListener('click', removeConfirm);

  confirmModal.querySelector('#confirmOk').addEventListener('click', async () => {
    removeConfirm();

    // --- Prepare payload ---
    let scheduledAt = isWeek
      ? Timestamp.fromDate(new Date(new Date().setDate(new Date().getDate() + ((7 - new Date().getDay()) % 7))))
      : Timestamp.fromDate(new Date(date + 'T' + (timeInput.value || '00:00') + ':00'));
    if (isWeek) { const d = scheduledAt.toDate(); d.setHours(23, 59, 0, 0); scheduledAt = Timestamp.fromDate(d); }

  const payload = {
    title: taskTitle.value === "others" ? el("#other_title").value : taskTitle.value,
    details,
    scheduled_at: scheduledAt,
    created_by: currentUserId,
    created_at: serverTimestamp(),
    assign_type: assignType,
    status: 'todo',
    metadata: {}
  };

  // Planting
  if (taskTitle.value === "planting") {
    payload.metadata.variety = el("#sugarcane_variety").value;
  }
  

  // Basal Fertilizer
  if (taskTitle.value === "basal_fertilizer") {
    payload.metadata.fertilizer_type = el("#basal_type").value;
    payload.metadata.amount_per_hectare = el("#basal_amount").value;
  }

  // Main Fertilization
  if (taskTitle.value === "main_fertilization") {
    payload.metadata.amount_per_hectare = el("#mainfert_amount").value;
  }

  // Spraying
  if (taskTitle.value === "spraying") {
    payload.metadata.spray_type = el("#spray_type").value;
  }


    if (assignType === 'worker') payload.metadata.workers = allWorkersCheck.checked ? 'all' : workersCount;
    if (assignType === 'driver') payload.metadata.driver = anyDriverCheck.checked
      ? { id: 'any', fullname: 'Any available driver' }
      : { id: el('#ct_driver_dropdown_btn').dataset.driverId, fullname: el('#ct_driver_dropdown_btn').textContent };

    if (Object.keys(payload.metadata).length === 0) delete payload.metadata;

    // --- Save Task ---
    const saveBtn = el('#ct_save');
    saveBtn.disabled = true;
    saveBtn.textContent = 'Saving...';
    const res = await saveTaskToFirestore(fieldId, payload);
    saveBtn.disabled = false;
    saveBtn.textContent = 'Save';

    
    if (res.ok) {
      // --- Centered Success Message ---
      const successModal = document.createElement('div');
      successModal.className = 'fixed inset-0 z-[24000] flex items-center justify-center';
      successModal.innerHTML = `
        <div class="bg-green-600 text-white px-6 py-4 rounded-xl shadow-lg text-center animate-fadeIn">
          Task saved successfully!
        </div>
      `;
      document.body.appendChild(successModal);

      // Remove after 2.5 seconds
      setTimeout(() => successModal.remove(), 1900);

      // Close the create task modal
      modal.remove();

      // Dispatch custom event
      document.dispatchEvent(new CustomEvent('task:created', { detail: { fieldId } }));
    } else {
      alert('Save failed: ' + (res.errors?.join(' | ') || ''));
    }
  });
});

// Close driver dropdown if clicking outside
document.addEventListener('click', (e) => {
  if (!dropdownBtn.contains(e.target) && !dropdownList.contains(e.target)) {
    dropdownList.classList.add('hidden');
  }
});

  return modal;
}

window.openCreateTaskModal = openCreateTaskModal;
