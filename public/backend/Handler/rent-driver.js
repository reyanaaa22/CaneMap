// rent-driver.js
import { auth, db } from "../Common/firebase-config.js";
import {
  collection,
  query,
  where,
  getDocs,
  doc,
  getDoc,
  addDoc,
  serverTimestamp,
  orderBy
} from "https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-auth.js";

let currentUserId = null;
let isRenderingDrivers = false;
onAuthStateChanged(auth, u => currentUserId = u ? u.uid : null);

// Utilities
function el(sel, parent = document) { return parent.querySelector(sel); }
function create(tag, opts = {}) {
  const e = document.createElement(tag);
  if (opts.className) e.className = opts.className;
  if (opts.html) e.innerHTML = opts.html;
  if (opts.attrs) for (const k in opts.attrs) e.setAttribute(k, opts.attrs[k]);
  return e;
}
function safeText(s){ return (s==null)? "—" : String(s); }
function computeAgeFromBirth(birthStr) {
  if (!birthStr) return "—";
  const d = new Date(birthStr);
  if (isNaN(d)) return "—";
  const diff = Date.now() - d.getTime();
  const years = Math.floor(diff / (365.25*24*3600*1000));
  return years;
}

function renderDriverCard(driver) {
  const formatVehicleType = (str) => {
    if (!str) return '—';
    if (typeof str !== 'string') str = String(str);
    return str.split('_').map(w => w[0].toUpperCase() + w.slice(1)).join(' ');
  };

  const formatAddressShort = (address) => {
    if (!address) return '—';
    const brgyMatch = address.match(/brgy\.?\s*([a-zA-Z\s]+)/i);
    const brgyName = brgyMatch ? brgyMatch[1].trim() : '';
    return `Brgy. ${brgyName}, Ormoc City, Leyte`;
  };

  const card = create('div', { className: 'bg-white border rounded-xl p-4 shadow hover:shadow-lg transition cursor-pointer' });
  card.innerHTML = `
    <div class="flex items-start gap-3">
      <div class="w-12 h-12 rounded-lg bg-[var(--cane-100)] flex items-center justify-center text-[var(--cane-800)] font-semibold text-sm">
        ${(driver.fullname||'--').split(' ').map(s=>s[0]||'').slice(0,2).join('')}
      </div>
      <div class="flex-1">
        <div class="flex items-center justify-between">
          <div class="font-semibold text-[var(--cane-900)]">${safeText(driver.fullname)} (${computeAgeFromBirth(driver.birth_date) || '—'})</div>
        </div>
        <div class="text-xs text-[var(--cane-700)] mt-1">${formatVehicleType(driver.vehicle_types || driver.other_vehicle_type)}</div>
        <div class="flex items-center gap-1 mt-2 text-sm text-[var(--cane-700)]">
          <span class="w-3 h-3 rounded-full bg-green-500 inline-block"></span>
          <span>${formatAddressShort(driver.address)}</span>
        </div>
        <div class="mt-2 text-xs text-green-600 font-medium">Tap for more details</div>
      </div>
    </div>
  `;

  card.addEventListener('click', () => showDriverDetailsModal(driver));
  return card;
}


function showDriverDetailsModal(driver) {
  const formatVehicleType = (str) => {
    if (!str) return '—';
    if (typeof str !== 'string') str = String(str);
    return str.split('_').map(w => w[0].toUpperCase() + w.slice(1)).join(' ');
  };

  const age = computeAgeFromBirth(driver.birth_date);

  const modal = create('div', { className: 'fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4' });
  modal.innerHTML = `
    <div class="bg-white rounded-xl w-full max-w-3xl shadow-xl hover:shadow-2xl transition overflow-hidden">
      <div class="px-6 py-4 border-b flex items-start justify-between">
        <div>
          <h3 class="text-xl font-semibold text-[var(--cane-900)]">
            ${safeText(driver.fullname)}${age !== '—' ? ', ' + age + ' y/o' : ''}
          </h3>
          <p class="text-sm text-[var(--cane-700)]">${formatVehicleType(driver.vehicle_types || driver.other_vehicle_type)}</p>
        </div>
        <button class="text-[var(--cane-800)]" id="drvCloseBtn"><i class="fas fa-times"></i></button>
      </div>

      <!-- Professional rental row-style details -->
      <div class="p-6 space-y-4">
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div class="bg-green-50 rounded-xl p-4 shadow-sm hover:shadow-md transition flex flex-col">
            <span class="text-xs text-green-700 font-medium">Contact</span>
            <span class="mt-1 text-gray-900 font-semibold">${safeText(driver.contact_number)}</span>
          </div>
          <div class="bg-green-50 rounded-xl p-4 shadow-sm hover:shadow-md transition flex flex-col">
            <span class="text-xs text-green-700 font-medium">Address</span>
            <span class="mt-1 text-gray-900 font-semibold">${safeText(driver.address)}</span>
          </div>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div class="bg-green-50 rounded-xl p-4 shadow-sm hover:shadow-md transition flex flex-col">
            <span class="text-xs text-green-700 font-medium">License Expiry</span>
            <span class="mt-1 text-gray-900 font-semibold">${safeText(driver.license_expiry)}</span>
          </div>
          <div class="bg-green-50 rounded-xl p-4 shadow-sm hover:shadow-md transition flex flex-col">
            <span class="text-xs text-green-700 font-medium">Vehicle</span>
            <span class="mt-1 text-gray-900 font-semibold">${safeText(driver.vehicle_model)} • ${safeText(driver.vehicle_color)} • Plate ${safeText(driver.plate_number)}</span>
          </div>
        </div>

        <div class="flex justify-end gap-3 mt-4">
          <button id="drvCancelBtn" class="px-4 py-2 rounded-md bg-gray-200 hover:bg-gray-300 shadow-sm transition">Cancel</button>
          <button id="drvRentBtn" class="px-4 py-2 rounded-md bg-[var(--cane-700)] text-white hover:bg-[var(--cane-800)] shadow-sm transition">Rent this Driver</button>
        </div>
      </div>
    </div>
  `;

  document.body.appendChild(modal);

    modal.querySelectorAll('#drvCloseBtn, #drvCancelBtn').forEach(btn => {
        btn.addEventListener('click', () => modal.remove());
    });
  modal.querySelector('#drvRentBtn').addEventListener('click', async () => {
    modal.remove();
    await openRentFormModal(driver);
  });

  const esc = (e) => { if (e.key === 'Escape') { modal.remove(); document.removeEventListener('keydown', esc); } };
  document.addEventListener('keydown', esc);
}


async function openRentFormModal(driver) {
  const fields = await fetchHandlerFields() || [];
  const modal = create('div', { className: 'fixed inset-0 z-[70] flex items-center justify-center bg-black/40 p-4' });
  modal.innerHTML = `
    <div class="bg-white rounded-xl w-full max-w-2xl shadow-xl overflow-hidden">
      <div class="px-6 py-4 border-b flex items-start justify-between">
        <div>
          <h3 class="text-lg font-semibold text-[var(--cane-900)]">Rent ${safeText(driver.fullname)}</h3>
          <p class="text-sm text-[var(--cane-700)]">Complete the rental details below. This request will be recorded and a confirmation sent.</p>
        </div>
        <button id="rfCloseBtn" class="text-[var(--cane-800)]"><i class="fas fa-times"></i></button>
      </div>
      <div class="p-6 space-y-4">
        <div>
          <label class="text-sm text-[var(--cane-700)]">Select Field</label>
          <select id="rfFieldSelect" class="w-full mt-1 p-3 rounded border border-[var(--neutral-medium)]">
            <option value="">-Select field-</option>
            ${fields.map(f => `<option value="${f.id}">${(f.field_name || f.fieldName || f.name || 'Unnamed')} - Brgy. ${f.barangay || ''}</option>`).join('')}
          </select>
          <div id="rfFieldError" class="text-xs text-red-500 mt-1 hidden">Please select a field.</div>
        </div>
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label class="text-sm text-[var(--cane-700)]">Rental Date</label>
            <input id="rfDate" type="date" class="w-full mt-1 p-3 rounded border border-[var(--neutral-medium)]" />
            <div id="rfDateError" class="text-xs text-red-500 mt-1 hidden">Please choose date.</div>
          </div>
          <div>
            <label class="text-sm text-[var(--cane-700)]">Start Time</label>
            <input id="rfTime" type="time" class="w-full mt-1 p-3 rounded border border-[var(--neutral-medium)]" />
            <div id="rfTimeError" class="text-xs text-red-500 mt-1 hidden">Please choose time.</div>
          </div>
        </div>
        <div>
          <label class="text-sm text-[var(--cane-700)]">Remarks (optional)</label>
          <textarea id="rfRemarks" rows="3" class="w-full mt-1 p-3 rounded border border-[var(--neutral-medium)]"></textarea>
        </div>
        <div class="text-sm">
          <label class="inline-flex items-start gap-2"><input type="checkbox" id="rfAgree" /> <span>I confirm that I have read and agree to the rental terms and privacy notice.</span></label>
          <div id="rfAgreeError" class="text-xs text-red-500 mt-1 hidden">You must accept the terms to continue.</div>
        </div>
        <div class="flex justify-end gap-3">
          <button id="rfCancel" class="px-4 py-2 rounded-md bg-gray-200 hover:bg-gray-300">Cancel</button>
          <button id="rfSubmit" class="px-4 py-2 rounded-md bg-[var(--cane-700)] text-white hover:bg-[var(--cane-800)]">Submit Rental</button>
        </div>
      </div>
    </div>
  `;
  document.body.appendChild(modal);

  const fieldInput = modal.querySelector('#rfFieldSelect');
  const dateInput = modal.querySelector('#rfDate');
  const timeInput = modal.querySelector('#rfTime');

  const agreeCheckbox = modal.querySelector('#rfAgree');

  // Close buttons
    modal.querySelectorAll('#rfCloseBtn, #rfCancel').forEach(btn => {
        btn.addEventListener('click', () => modal.remove());
    });

  // Hide errors when user interacts
  [fieldInput, dateInput, timeInput, agreeCheckbox].forEach(el => {
    el.addEventListener(el.type === 'checkbox' ? 'change' : 'input', () => {
      if(el.id === 'rfFieldSelect') modal.querySelector('#rfFieldError').classList.add('hidden');
      if(el.id === 'rfDate') modal.querySelector('#rfDateError').classList.add('hidden');
      if(el.id === 'rfTime') modal.querySelector('#rfTimeError').classList.add('hidden');
      if(el.id === 'rfAgree') modal.querySelector('#rfAgreeError').classList.add('hidden');
    });
  });

  // Submit button
  modal.querySelector('#rfSubmit').addEventListener('click', async () => {
    const fieldId = fieldInput.value;
    const date = dateInput.value;
    const time = timeInput.value;
    const agree = agreeCheckbox.checked;

    let hasError = false;
    modal.querySelectorAll('#rfFieldError, #rfDateError, #rfTimeError, #rfAgreeError').forEach(el => el.classList.add('hidden'));

    if (!fieldId) { modal.querySelector('#rfFieldError').classList.remove('hidden'); hasError = true; }
    if (!date) { modal.querySelector('#rfDateError').classList.remove('hidden'); hasError = true; }
    if (!time) { modal.querySelector('#rfTimeError').classList.remove('hidden'); hasError = true; }
    if (!agree) { modal.querySelector('#rfAgreeError').classList.remove('hidden'); hasError = true; }

    if (hasError) return;

    // Confirmation modal
    const confirmModal = create('div', { className: 'fixed inset-0 z-[80] flex items-center justify-center bg-black/40 p-4' });
    confirmModal.innerHTML = `
    <div class="bg-white rounded-xl w-full max-w-md shadow-xl p-6 text-center">
        <p class="mb-4 text-[var(--cane-900)]">Once submitted, your rental request will sent to <strong>${safeText(driver.fullname)}</strong> and cannot be edited.
        </p>
        <button id="confirmOkBtn" class="px-4 py-2 bg-[var(--cane-700)] text-white rounded-md hover:bg-[var(--cane-800)]">Okay</button>
    </div>
    `;
    document.body.appendChild(confirmModal);

    confirmModal.querySelector('#confirmOkBtn').addEventListener('click', async () => {
      confirmModal.remove();
      // Prepare payload
      const scheduledStart = new Date(date + 'T' + time + ':00');
      const payload = {
        driverId: driver.id || null,
        driverName: driver.fullname || null,
        handlerId: currentUserId || null,
        fieldId,
        rentalStart: serverTimestamp(),
        rentalRequestedFor: scheduledStart.toISOString(),
        remarks: modal.querySelector('#rfRemarks').value || '',
        status: 'requested',
        createdAt: serverTimestamp()
      };
      try {
        await addDoc(collection(db, 'Drive_Rental_Details'), payload);
        modal.remove();
        showSimpleSuccess('Rental request submitted successfully.');
      } catch (err) {
        console.error('Rent save failed', err);
        alert('Failed to submit rental: ' + (err.message || 'unknown'));
      }
    });
  });
}

// small centered success
function showSimpleSuccess(msg) {
  const s = create('div', { className: 'fixed inset-0 z-[80] flex items-center justify-center p-4' });
  s.innerHTML = `<div class="bg-green-600 text-white px-6 py-4 rounded-xl shadow-lg text-center">${msg}</div>`;
  document.body.appendChild(s);
  setTimeout(()=> s.remove(), 1800);
}

// fetch handler fields (from field_applications/{handlerId}/fields)
async function fetchHandlerFields() {
  try {
    if (!currentUserId) return [];
    const path = `field_applications/${currentUserId}/fields`;
    // try to read docs in that collection path
    const q = query(collection(db, path));
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ id: d.id, ...(d.data()||{}) }));
  } catch (err) {
    console.warn('Failed to fetch handler fields:', err);
    return [];
  }
}

// fetch drivers (Drivers_Badge where open_for_rental == true; client-side filter for Ormoc)
async function fetchDrivers() {
  const out = [];
  try {
    const q = query(collection(db, 'Drivers_Badge'), where('open_for_rental', '==', true), orderBy('fullname'));
    const snap = await getDocs(q);

    console.log('Fetched drivers from Firestore:', snap.docs.map(d => d.data())); // <-- debug

    for (const d of snap.docs) {
      const data = d.data();
      const address = (data.address || '').toLowerCase();
      if (!address.includes('ormoc')) continue;
      out.push({ id: d.id, ...data });
    }
  } catch (err) {
    console.error('Failed to load drivers:', err);
  }
  return out;
}

async function renderDriversInline() {
  if (isRenderingDrivers) return; // STOP if another render is in progress
  isRenderingDrivers = true;

  let grid = document.getElementById('rentDriverGridMain');
  let empty = document.getElementById('rentDriverEmptyMain');

  if (!grid || !empty) {
    console.warn('Driver grid not found yet, retrying...');
    setTimeout(() => { isRenderingDrivers = false; renderDriversInline(); }, 100);
    return;
  }

  grid.innerHTML = '';
  empty.classList.add('hidden');

  const drivers = await fetchDrivers();

  if (!drivers.length) {
    empty.classList.remove('hidden');
    isRenderingDrivers = false;
    return;
  }

  drivers.forEach(driver => grid.appendChild(renderDriverCard(driver)));

  isRenderingDrivers = false; // allow future renders
}


document.addEventListener('DOMContentLoaded', () => {
  renderDriversInline();

  const nav = document.getElementById('navRentDriver');
  if (nav) {
    nav.addEventListener('click', (e) => {
      e.preventDefault();
      renderDriversInline();
      document.querySelectorAll('.nav-item').forEach(i => i.classList.remove('active'));
      nav.classList.add('active');
    });
  }
});

// rent-driver.js
export function initializeRentDriverSection() {
    console.log("Rent Driver section initialized!");
    
    const rentBtn = document.getElementById("rentButton");
    if (rentBtn) {
        rentBtn.addEventListener("click", () => {
            alert("Rent-a-driver clicked!");
        });
    }
}