import { auth, db } from '../Common/firebase-config.js';
import {
  collection, query, orderBy, onSnapshot, doc, updateDoc, getDoc
} from 'https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/12.1.0/firebase-auth.js';
import {
  getStorage, ref as sref, uploadBytes, uploadString, getDownloadURL, deleteObject
} from 'https://www.gstatic.com/firebasejs/12.1.0/firebase-storage.js';
import { where, limit } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js";
// Friendly relative time formatter
function formatFullDate(ts) {
  try {
    if (!ts) return '';
    const d = ts.seconds ? new Date(ts.seconds * 1000) : new Date(ts);
    const now = new Date();
    const diffMs = now - d;
    const diffSec = Math.floor(diffMs / 1000);
    const diffMin = Math.floor(diffSec / 60);
    const diffHr  = Math.floor(diffMin / 60);
    const diffDay = Math.floor(diffHr / 24);

    if (diffSec < 60) return `Last updated ${diffSec} second${diffSec !== 1 ? 's' : ''} ago`;
    if (diffMin < 60) return `Last updated ${diffMin} minute${diffMin !== 1 ? 's' : ''} ago`;
    if (diffHr < 24)  return `Last updated ${diffHr} hour${diffHr !== 1 ? 's' : ''} ago`;
    if (diffDay === 1) return 'Last updated yesterday';
    if (diffDay < 7)  return `Last updated ${d.toLocaleDateString('en-US', { weekday: 'long' })}`;
    return `Last updated ${d.toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: '2-digit' })}`;
  } catch (e) {
    console.warn('formatFullDate error:', e);
    return '';
  }
}

const container = document.getElementById('myFieldsContainer');
const fieldCount = document.getElementById('fieldCount');
const spinner = document.getElementById('loadingSpinner');

let currentUid = null;
let allFields = []; // store all fields locally for search/sort
let currentSearch = "";
let currentFilter = "all";

// 🔹 Helper: show nice alert modal
function showAlert(message, type = "info") {
  const modal = document.createElement('div');
  modal.className = 'modal-alert';
  modal.innerHTML = `
    <div class="bg-white rounded-xl p-6 max-w-sm w-[90%] text-center">
      <h3 class="text-lg font-semibold mb-2 text-[var(--cane-800)]">${type === 'error' ? '⚠️' : 'ℹ️'} Notice</h3>
      <p class="text-sm text-[var(--cane-700)] mb-4">${message}</p>
      <button class="btn-primary px-4 py-2 rounded-lg">OK</button>
    </div>`;
  modal.querySelector('button').onclick = () => modal.remove();
  document.body.appendChild(modal);
  
}

// 🔹 Helper: open fullscreen viewer
function openFullscreenViewer(src) {
  const viewer = document.createElement('div');
  viewer.className = 'fixed inset-0 bg-black/80 flex items-center justify-center z-50';
  viewer.innerHTML = `
    <button class="absolute top-4 right-6 text-white text-3xl font-bold">&times;</button>
    <img src="${src}" class="max-h-[90vh] max-w-[90vw] rounded-xl border-2 border-white shadow-lg" />
  `;
  viewer.querySelector('button').onclick = () => viewer.remove();
  document.body.appendChild(viewer);
}

// 🔹 Delete file if exists
async function deleteStorageFileIfUrl(url) {
  if (!url) return;
  try {
    const path = decodeURIComponent(new URL(url).pathname.split('/o/')[1].split('?')[0]);
    const storage = getStorage();
    await deleteObject(sref(storage, path));
  } catch {}
}

function badgeClass(status){
  if (!status) return 'bg-gray-100 text-gray-700';
  if (status === 'to edit') return 'bg-yellow-100 text-yellow-700';
  if (['reviewed','approved'].includes(status)) return 'bg-green-100 text-green-700';
  if (status === 'rejected') return 'bg-red-100 text-red-700';
  return 'bg-gray-100 text-gray-700';
}

onAuthStateChanged(auth, async (user) => {
  if (!user) {
    container.innerHTML = `<div class="p-6 text-center text-[var(--cane-700)]">Please log in.</div>`;
    spinner.style.display = 'none';
    return;
  }
  currentUid = user.uid;
  await loadFields(user.uid);
});

// Search & Sort Handlers
document.getElementById('searchFieldBtn').onclick = applyFilters;
document.getElementById('searchFieldInput').onkeypress = e => { if (e.key === 'Enter') applyFilters(); };
document.querySelectorAll('.sortOption').forEach(opt => {
  opt.onclick = (e) => {
    currentFilter = e.target.dataset.status;
    document.getElementById('sortDropdownMenu').classList.add('hidden');
    applyFilters();
  };
});

// Toggle Sort Dropdown
const sortBtn = document.getElementById('sortDropdownBtn');
const sortMenu = document.getElementById('sortDropdownMenu');

sortBtn.addEventListener('click', (e) => {
  e.stopPropagation(); // prevent accidental close
  sortMenu.classList.toggle('hidden');
});

//  Hide dropdown when clicking anywhere else
document.addEventListener('click', (e) => {
  if (!sortMenu.contains(e.target) && !sortBtn.contains(e.target)) {
    sortMenu.classList.add('hidden');
  }
});



// 🔸 Filter and render based on search and sort
function applyFilters() {
  const searchVal = document.getElementById('searchFieldInput').value.trim().toLowerCase();
  currentSearch = searchVal;

  let filtered = allFields.filter(f => {
    const matchesSearch = 
      f.field_name?.toLowerCase().includes(searchVal) ||
      f.barangay?.toLowerCase().includes(searchVal) ||
      f.street?.toLowerCase().includes(searchVal) ||
      f.status?.toLowerCase().includes(searchVal);

    const matchesFilter = currentFilter === "all" ? true : (f.status?.toLowerCase() === currentFilter);
    return matchesSearch && matchesFilter;
  });

  // Sort descending by submittedAt by default
  filtered.sort((a,b) => (b.submittedAt?.seconds||0) - (a.submittedAt?.seconds||0));

  renderFields(filtered);
}

function renderFields(list) {
  container.innerHTML = '';

  if (!list.length) {
    container.innerHTML = `<div class="p-6 text-center text-[var(--cane-700)]">No fields found.</div>`;
    fieldCount.textContent = '0 fields';
    return;
  }

  fieldCount.textContent = `${list.length} field${list.length > 1 ? 's' : ''}`;

  list.forEach(data => {
    const card = document.createElement('div');
    card.className =
      `p-5 rounded-xl shadow-sm mb-3 hover:shadow-md transition border border-[rgba(0,0,0,0.06)] cursor-pointer ${
        data.isNew ? 'bg-green-50' : 'bg-white'
      }`;

    const timestamp = data.updatedAt || data.submittedAt;
    const lastUpdated = timestamp
      ? `<p class="text-xs text-gray-500 font-medium mt-1">${formatFullDate(timestamp)}</p>`
      : '';

    const statusBadge = `
      <span class="px-3 py-1 rounded-full text-xs font-semibold ${badgeClass(data.status)}">
        ${data.status || 'pending'}
      </span>
    `;

    //  status badge
    card.innerHTML = `
      <div class="flex flex-col sm:flex-row justify-between items-start">
        <div>
          <h3 class="text-lg font-bold text-[var(--cane-800)]">
            ${data.field_name || 'Unnamed Field'}
          </h3>
          <p class="text-sm text-[var(--cane-700)] leading-snug break-words">
            ${data.street || '—'}, Brgy. ${data.barangay || '—'}, 
            <span class="block sm:inline">Ormoc City, Leyte, Philippines</span>
          </p>
          ${lastUpdated}
        </div>
        <div class="text-right mt-2 sm:mt-0">
          ${statusBadge}
        </div>
      </div>
    `;

card.onclick = () => {
  // Store selected field info
  localStorage.setItem("selectedFieldId", data.id);
  localStorage.setItem("selectedFieldData", JSON.stringify(data));

  // Navigate to MyField.html inside dashboard
  window.location.href = "MyField.html";
};


    container.appendChild(card);
  });
}


function loadFields(uid) {
  container.innerHTML = '';
  spinner.style.display = 'flex';
  allFields = [];

const ref = collection(db, 'field_applications', uid, 'fields');
const q = query(ref, where('status', '==', 'reviewed'), orderBy('submittedAt', 'desc'));

  // Real-time updates (no try/catch needed)
  onSnapshot(q, (snap) => {
    spinner.style.display = 'none';
    allFields = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    applyFilters(); // auto re-render when data changes
  }, (err) => {
    console.error('Error listening to snapshot:', err);
    spinner.style.display = 'none';
  });
}


// fetch varieties by matching your Firestore field names
async function loadVarieties(selectEl){
  try {
    const vSnap = await getDocs(collection(db, 'sugarcane_varieties'));
    if (vSnap.empty) throw "empty";

    selectEl.innerHTML = '<option value="">Select variety...</option>';
    vSnap.forEach(v => {
      const data = v.data();
      const varietyName = data.variety_name || data.name || data.sugarcane_variety || ""; // 🔹 auto-detect correct key
      if (varietyName) {
        const opt = document.createElement('option');
        opt.value = varietyName;
        opt.textContent = varietyName;
        selectEl.appendChild(opt);
      }
    });
  } catch {
    // fallback options
    selectEl.innerHTML = `
      <option value="">Select variety...</option>
      <option>LCP 85-384</option>
      <option>PSR 07-195</option>
      <option>PSR 03-171</option>
      <option>Phil 93-1601</option>
      <option>Phil 94-0913</option>
      <option>Phil 92-0577</option>`;
  }
}


// 🔹 Modal open
async function openEditModal(uid, fieldId, data){
  if (!window.L) await loadLeaflet();

  const modal = document.createElement('div');
  modal.className = 'fixed inset-0 bg-black/60 flex items-center justify-center z-50';
  modal.innerHTML = `
  <div class="bg-white rounded-2xl w-[95%] max-w-4xl overflow-hidden max-h-[92vh]">
  <div class="flex justify-between items-center px-6 py-2 border-b">
    <h3 class="font-semibold text-lg">Field Forms</h3>
    <button id="closeModalBtn" class="text-2xl">&times;</button>
  </div>

  <div class="p-5 pt-3 overflow-y-auto space-y-4 max-h-[80vh]">

        <div class="flex justify-end gap-3 pt-3" id="actionButtons"></div>
        <div id="sraRemarkBox" class="hidden border border-[var(--cane-600)] bg-[var(--cane-50)] rounded-xl p-4 mt-4">
          <h4 class="font-semibold text-[var(--cane-800)] mb-2">SRA Remarks</h4>
          <p id="sraRemarkText" class="text-sm text-[var(--cane-700)] leading-relaxed"></p>
        </div>
    <div class="grid md:grid-cols-2 gap-6">
      <div>
        <label>Field Name *</label>
        <input id="m_field_name" class="w-full border px-3 py-2 rounded" required>
      </div>

      <div>
        <label>Street *</label>
        <input id="m_street" class="w-full border px-3 py-2 rounded" required>
      </div>

      <div>
        <label>Barangay *</label>
        <input id="m_barangay" 
          class="w-full border px-3 py-2 rounded bg-gray-100 text-gray-700 font-medium" 
          readonly>
      </div>

      <div>
        <label>City / Municipality *</label>
        <input id="m_city"
          value="Ormoc City"
          readonly
          class="w-full border px-3 py-2 rounded bg-gray-100 text-gray-700 font-medium">
      </div>

      <div>
        <label>Terrain *</label>
        <select id="m_terrain_type" class="w-full border px-3 py-2 rounded" required>
          <option value="">Select terrain...</option>
          <option>Flat</option>
          <option>Rolling</option>
          <option>Hilly</option>
        </select>
      </div>

      <div>
        <label>Variety *</label>
        <select id="m_sugarcane_variety" class="w-full border px-3 py-2 rounded" required></select>
      </div>

      <div class="md:col-span-2">
        <label>Size (ha)</label>
        <input id="m_field_size" type="number" step="0.01" class="w-full border px-3 py-2 rounded">
      </div>
    </div>

        <div class="space-y-3">
          <div id="m_map" class="w-full h-64 rounded-xl border"></div>
          <div class="grid grid-cols-2 gap-4">
            <div><label>Latitude *</label><input id="m_lat" type="number" step="any" class="w-full border px-3 py-2 rounded"></div>
            <div><label>Longitude *</label><input id="m_lng" type="number" step="any" class="w-full border px-3 py-2 rounded"></div>
          </div>
        </div>

        <div id="docSection" class="grid md:grid-cols-2 gap-4"></div>

        <!-- Policy agreement text (only visible when "to edit") -->
          <div id="policyNotice" class="hidden mt-3 text-sm text-gray-700">
            <label class="flex items-start gap-2">
              <input id="policyCheck" type="checkbox" class="mt-1">
              <span>
                I agree to the 
                <a href="#" id="openTerms" class="underline text-[var(--cane-700)] hover:text-[var(--cane-800)]">Terms and Conditions</a> 
                and 
                <a href="#" id="openPrivacy" class="underline text-[var(--cane-700)] hover:text-[var(--cane-800)]">Privacy Policy</a> 
                of CaneMap.
              </span>
            </label>
          </div>

      <div class="flex justify-end gap-3 mt-6">
        <button type="button" id="m_cancel" 
          class="px-5 py-2 bg-gray-300 text-[var(--cane-800)] rounded-lg font-medium hover:bg-gray-400 transition">
          Cancel
        </button>
        <button type="button" id="m_save" 
          class="px-5 py-2 bg-[var(--cane-700)] text-white rounded-lg font-medium hover:bg-[var(--cane-800)] transition">
          Save Changes
        </button>
      </div>

      </form>
    </div>
  </div>`;

  document.body.appendChild(modal);
  modal.querySelector('#closeModalBtn').onclick = ()=>modal.remove();
  modal.querySelector('#m_cancel').onclick = ()=>modal.remove();
  
    // 🔸 Hide Cancel if not editable
    if (data.status !== 'to edit') {
    modal.querySelector('#m_cancel').style.display = 'none';
    // make X button background transparent
    const closeBtn = modal.querySelector('#closeModalBtn');
    closeBtn.classList.add('bg-transparent', 'hover:bg-black/10', 'rounded-full', 'transition');
    }

  // populate
  const editable = data.status === 'to edit';
  // Show policy agreement only if editable
  const policyNotice = modal.querySelector('#policyNotice');
  const policyCheck = modal.querySelector('#policyCheck');

  if (editable) {
    policyNotice.classList.remove('hidden');
  } else {
    policyNotice.classList.add('hidden');
  }

  setTimeout(() => {
  initLegalModal();
}, 300);

  const f = id => modal.querySelector(id);
  f('#m_field_name').value = data.field_name || '';
  f('#m_street').value = data.street || '';
  f('#m_barangay').value = data.barangay || '';
  f('#m_city').value = "Ormoc City";
  f('#m_terrain_type').value = data.terrain_type || '';
  f('#m_field_size').value = data.field_size || '';
  f('#m_lat').value = data.latitude || '';
  f('#m_lng').value = data.longitude || '';
  await loadVarieties(f('#m_sugarcane_variety'));
  f('#m_sugarcane_variety').value = data.sugarcane_variety || '';

// 🔹 Document Section — perfectly aligned 2-column, centered in modal
docSection.innerHTML = `
  <div class="w-full max-w-5xl mx-auto">
    <div class="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-5">

      <!-- Barangay Certificate -->
      <div>
        <label class="block text-sm font-medium mb-1">Barangay Certificate</label>
        <div class="w-full border px-3 py-2 rounded bg-white flex flex-col gap-2">
          <div id="prev_barangayCertUrl" class="text-sm text-gray-700"></div>
          ${editable ? `
            <button type="button" data-doc="barangayCertUrl"
              class="change-btn w-fit px-3 py-2 rounded bg-[var(--cane-700)] hover:bg-[var(--cane-800)] text-white text-sm font-medium transition">
              <i class="fa-solid fa-camera mr-1"></i> Change Photo
            </button>` : ''}
          <input type="file" id="file_barangayCertUrl" accept="image/*" style="display:none">
          <input type="hidden" id="b64_barangayCertUrl">
        </div>
      </div>

      <!-- Land Title -->
      <div>
        <label class="block text-sm font-medium mb-1">Land Title</label>
        <div class="w-full border px-3 py-2 rounded bg-white flex flex-col gap-2">
          <div id="prev_landTitleUrl" class="text-sm text-gray-700"></div>
          ${editable ? `
            <button type="button" data-doc="landTitleUrl"
              class="change-btn w-fit px-3 py-2 rounded bg-[var(--cane-700)] hover:bg-[var(--cane-800)] text-white text-sm font-medium transition">
              <i class="fa-solid fa-camera mr-1"></i> Change Photo
            </button>` : ''}
          <input type="file" id="file_landTitleUrl" accept="image/*" style="display:none">
          <input type="hidden" id="b64_landTitleUrl">
        </div>
      </div>

      <!-- Valid ID (Front) -->
      <div>
        <label class="block text-sm font-medium mb-1">Valid ID (Front)</label>
        <div class="w-full border px-3 py-2 rounded bg-white flex flex-col gap-2">
          <div id="prev_validFrontUrl" class="text-sm text-gray-700"></div>
          ${editable ? `
            <button type="button" data-doc="validFrontUrl"
              class="change-btn w-fit px-3 py-2 rounded bg-[var(--cane-700)] hover:bg-[var(--cane-800)] text-white text-sm font-medium transition">
              <i class="fa-solid fa-camera mr-1"></i> Change Photo
            </button>` : ''}
          <input type="file" id="file_validFrontUrl" accept="image/*" style="display:none">
          <input type="hidden" id="b64_validFrontUrl">
        </div>
      </div>

      <!-- Valid ID (Back) -->
      <div>
        <label class="block text-sm font-medium mb-1">Valid ID (Back)</label>
        <div class="w-full border px-3 py-2 rounded bg-white flex flex-col gap-2">
          <div id="prev_validBackUrl" class="text-sm text-gray-700"></div>
          ${editable ? `
            <button type="button" data-doc="validBackUrl"
              class="change-btn w-fit px-3 py-2 rounded bg-[var(--cane-700)] hover:bg-[var(--cane-800)] text-white text-sm font-medium transition">
              <i class="fa-solid fa-camera mr-1"></i> Change Photo
            </button>` : ''}
          <input type="file" id="file_validBackUrl" accept="image/*" style="display:none">
          <input type="hidden" id="b64_validBackUrl">
        </div>
      </div>

      <!-- Selfie with ID (full width) -->
      <div class="md:col-span-2">
        <label class="block text-sm font-medium mb-1">Selfie with ID</label>
        <div class="w-full border px-3 py-2 rounded bg-white flex flex-col gap-2">
          <div id="prev_selfieUrl" class="text-sm text-gray-700"></div>
          ${editable ? `
            <button type="button" data-doc="selfieUrl"
              class="change-btn w-fit px-3 py-2 rounded bg-[var(--cane-700)] hover:bg-[var(--cane-800)] text-white text-sm font-medium transition">
              <i class="fa-solid fa-camera mr-1"></i> Change Photo
            </button>` : ''}
          <input type="file" id="file_selfieUrl" accept="image/*" style="display:none">
          <input type="hidden" id="b64_selfieUrl">
        </div>
      </div>

    </div>
  </div>
`;


function makeDocInput(key, label) {
  return `
    <div>
      <label class="block text-sm font-medium mb-1">${label}</label>
      <div class="w-full border px-3 py-2 rounded flex flex-col gap-2 bg-white">
        <div id="prev_${key}" class="text-sm text-gray-700"></div>
        ${editable ? `
          <button type="button" data-doc="${key}"
            class="change-btn w-fit px-3 py-2 rounded bg-[var(--cane-700)] hover:bg-[var(--cane-800)] text-white text-sm font-medium transition">
            <i class="fa-solid fa-camera mr-1"></i> Change Photo
          </button>
        ` : ''}
        <input type="file" id="file_${key}" accept="image/*" style="display:none">
        <input type="hidden" id="b64_${key}">
      </div>
    </div>
  `;
}

  // Each document box styled
  function makeDocBox(key, label) {
    return `
      <div class="border-2 border-[var(--cane-600)] rounded-xl p-4 bg-[var(--cane-50)] shadow-sm">
        <p class="text-sm font-semibold text-[var(--cane-800)] mb-2">${label}</p>
        <div id="prev_${key}" class="mb-2"></div>
        ${editable ? `
          <button type="button" data-doc="${key}" 
            class="change-btn bg-[var(--cane-700)] hover:bg-[var(--cane-800)] text-white text-sm font-medium px-3 py-2 rounded transition">
            <i class="fa-solid fa-camera mr-1"></i> Change Photo
          </button>` : ''}
        <input type="file" id="file_${key}" accept="image/*" style="display:none">
        <input type="hidden" id="b64_${key}">
      </div>
    `;
  }


  function makeDocBlock(key, label) {
    return `
      <div>
        <p class="text-sm font-medium mb-1">${label}</p>
        <div id="prev_${key}" class="mb-2"></div>
        ${editable ? `
          <button type="button" data-doc="${key}" 
            class="change-btn bg-[var(--cane-700)] hover:bg-[var(--cane-800)] text-white text-sm font-medium px-3 py-2 rounded transition">
            <i class="fa-solid fa-camera mr-1"></i> Change Photo
          </button>` : ''}
        <input type="file" id="file_${key}" accept="image/*" style="display:none">
        <input type="hidden" id="b64_${key}">
      </div>
    `;
  }

  // After appending HTML, set previews
  ['barangayCertUrl','landTitleUrl','validFrontUrl','validBackUrl','selfieUrl'].forEach(key=>{
    setPreview(modal.querySelector(`#prev_${key}`), data[key]);
  });


  // disable inputs if not editable
  if(!editable){
    modal.querySelectorAll('input,select,button').forEach(e=>{
      // Disable everything except the close (X) button
      if(!e.id?.includes('closeModalBtn')) e.disabled = true;
    });
    f('#m_save').disabled = true;
    f('#m_save').classList.add('btn-disabled');
  }


  // map
  const map = L.map(f('#m_map')).setView([data.latitude||11.0,data.longitude||124.6],14);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(map);
  const icon = L.icon({iconUrl:'../../frontend/img/PIN.png',iconSize:[36,36],iconAnchor:[18,34]});
  const marker = L.marker([data.latitude||11.0,data.longitude||124.6],{icon,draggable:editable}).addTo(map);
  if(editable){
    map.on('click',e=>{
      marker.setLatLng(e.latlng);
      f('#m_lat').value=e.latlng.lat.toFixed(6);
      f('#m_lng').value=e.latlng.lng.toFixed(6);
    });
  }

  setTimeout(()=>map.invalidateSize(),200);

//(Live Photo / Upload)
modal.querySelectorAll('.change-btn').forEach(btn => {
  btn.onclick = () => {
    const key = btn.dataset.doc;
    const fileEl = modal.querySelector(`#file_${key}`);

    //  Create choice modal (styled)
    const choiceBox = document.createElement("div");
    choiceBox.className = "fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-[100]";
    choiceBox.innerHTML = `
      <div class="bg-white rounded-2xl shadow-2xl w-[90%] max-w-sm p-6 text-center animate-fadeIn">
        <h3 class="text-lg font-semibold text-[var(--cane-800)] mb-4">
          Change ${key.replace("Url", "").replace(/([A-Z])/g, " $1")}
        </h3>
        <div class="flex flex-col gap-3">
          <button id="livePhotoBtn" class="py-3 rounded-lg bg-[var(--cane-700)] text-white font-semibold hover:bg-[var(--cane-800)] transition">Take Live Photo</button>
          <button id="uploadBtn" class="py-3 rounded-lg bg-[var(--cane-600)] text-white font-semibold hover:bg-[var(--cane-700)] transition">Upload from Files</button>
          <button id="cancelChoiceBtn" class="py-3 rounded-lg bg-gray-300 text-[var(--cane-800)] font-semibold hover:bg-gray-400 transition">Cancel</button>
        </div>
      </div>
    `;
    choiceBox.style.animation = "fadeInModal 0.25s ease";
    document.body.appendChild(choiceBox);

    const closeChoice = () => {
    choiceBox.style.opacity = "0";
    choiceBox.style.transition = "opacity 0.25s ease";
    setTimeout(() => {
        if (choiceBox && choiceBox.parentNode) choiceBox.remove();
    }, 250);
    };


    // 🌿 Live Photo
    choiceBox.querySelector("#livePhotoBtn").onclick = () => {
      closeChoice();
      openCamera(key);
    };

    // 🌿 Upload File
    choiceBox.querySelector("#uploadBtn").onclick = () => {
      closeChoice();
      fileEl.click();
    fileEl.onchange = e => {
    const file = e.target.files[0];
    if (!file) return;

    // ✅ Show new file name immediately + green text
    const tempUrl = URL.createObjectURL(file);
    modal.querySelector(`#b64_${key}`).value = tempUrl; // store temporary preview
    const fileName = file.name;

    // show clickable preview with name
    const prevEl = modal.querySelector(`#prev_${key}`);
    prevEl.innerHTML = "";
    const p = document.createElement("p");
    p.textContent = `${fileName} (not saved yet)`;
    p.className =
        "text-sm font-medium text-[var(--cane-700)] underline cursor-pointer hover:text-[var(--cane-800)]";
    p.onclick = () => openFullscreenViewer(tempUrl);
    prevEl.appendChild(p);
    };
    };

    // 🌿 Cancel
    choiceBox.querySelector("#cancelChoiceBtn").onclick = closeChoice;

    // 📸 Camera overlay function
    function openCamera(key) {
      const cameraDiv = document.createElement("div");
      cameraDiv.className = "fixed inset-0 bg-black/90 flex flex-col items-center justify-center z-[120]";
      document.body.appendChild(cameraDiv);

      const video = document.createElement("video");
      video.autoplay = true;
      video.playsInline = true;
      video.className = "w-full h-full object-contain";
      cameraDiv.appendChild(video);

      const controls = document.createElement("div");
      controls.className = "absolute bottom-10 flex gap-4";
      cameraDiv.appendChild(controls);

      const captureBtn = document.createElement("button");
      captureBtn.textContent = "Capture";
      captureBtn.className = "px-6 py-3 bg-[var(--cane-700)] text-white rounded-full font-semibold hover:bg-[var(--cane-800)] transition";
      controls.appendChild(captureBtn);

      const cancelBtn = document.createElement("button");
      cancelBtn.textContent = "Cancel";
      cancelBtn.className = "px-6 py-3 bg-gray-400 text-white rounded-full font-semibold hover:bg-gray-500 transition";
      controls.appendChild(cancelBtn);

      let stream = null;
      navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } })
        .then(s => {
          stream = s;
          video.srcObject = s;
        })
        .catch(() => {
          showAlert("Camera not accessible. Please allow camera permissions or upload manually.", "error");
          cameraDiv.remove();
        });

      captureBtn.onclick = () => {
        const canvas = document.createElement("canvas");
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(video, 0, 0);
        const dataUrl = canvas.toDataURL("image/png");

        modal.querySelector(`#b64_${key}`).value = dataUrl;
        setPreview(modal.querySelector(`#prev_${key}`), `📸 ${key.replace("Url", "").replace(/([A-Z])/g, " $1")}.png`);

        stream.getTracks().forEach(t => t.stop());
        cameraDiv.remove();
      };

      cancelBtn.onclick = () => {
        if (stream) stream.getTracks().forEach(t => t.stop());
        cameraDiv.remove();
      };
    }
  };
});



// save changes (with confirmation modal)
  f('#m_save').onclick = async()=>{
    //  Require agreement when editable
    if (editable && !policyCheck.checked) {
      showAlert("You must agree to the Terms and Privacy Policy before saving.", "error");
      return;
    }

  const newData = {
    field_name:f('#m_field_name').value.trim(),
    street:f('#m_street').value.trim(),
    barangay: f('#m_barangay').value,
    city: f('#m_city').value,
    terrain_type:f('#m_terrain_type').value,
    sugarcane_variety:f('#m_sugarcane_variety').value,
    field_size:f('#m_field_size').value,
    latitude:parseFloat(f('#m_lat').value),
    longitude:parseFloat(f('#m_lng').value)
  };

  // check if no changes
  if(JSON.stringify(newData)===JSON.stringify({
    field_name:data.field_name,street:data.street,terrain_type:data.terrain_type,
    sugarcane_variety:data.sugarcane_variety,field_size:data.field_size,
    latitude:data.latitude,longitude:data.longitude
  })){
    showAlert("No changes detected — nothing to save.");
    return;
  }

  // ✅ Show confirmation modal
  const confirmBox = document.createElement("div");
  confirmBox.className = "fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-[200]";
  confirmBox.innerHTML = `
    <div class="bg-white rounded-2xl shadow-xl w-[90%] max-w-sm p-6 text-center">
      <h3 class="text-lg font-semibold text-[var(--cane-800)] mb-3">Confirm Save</h3>
      <p class="text-sm text-[var(--cane-700)] mb-6">
        Are you sure you want to save your updates? The field will be set to <b class="text-[var(--cane-700)]">Pending</b> for review.
      </p>
      <div class="flex justify-center gap-3">
        <button id="cancelConfirm" class="px-4 py-2 bg-gray-300 text-[var(--cane-800)] rounded-lg hover:bg-gray-400 transition">Cancel</button>
        <button id="confirmSave" class="px-4 py-2 bg-[var(--cane-700)] text-white rounded-lg hover:bg-[var(--cane-800)] transition">Yes, Save</button>
      </div>
    </div>
  `;
  document.body.appendChild(confirmBox);

  confirmBox.querySelector("#cancelConfirm").onclick = () => confirmBox.remove();
  confirmBox.querySelector("#confirmSave").onclick = async () => {
      confirmBox.remove();
      await saveChanges(uid, fieldId, data, modal, newData);
    };
  };

  // Fetch & Watch SRA remarks
const remarkBox = modal.querySelector("#sraRemarkBox");
const remarkText = modal.querySelector("#sraRemarkText");

const fieldRef = doc(db, "field_applications", uid, "fields", fieldId);

onSnapshot(fieldRef, (docSnap) => {
  if (!docSnap.exists()) return;

  const fieldData = docSnap.data();
  const remark = fieldData.latestRemark;
  const remarkAt = fieldData.latestRemarkAt;
  const status = fieldData.status;

  // Hide box if field is reviewed or no remarks exist
  if (!remark || status === "reviewed") {
    remarkBox.classList.add("hidden");
    return;
  }

  // Otherwise, show remark box
  remarkBox.classList.remove("hidden");
  remarkText.innerHTML = `
    <span class="block text-sm">${remark}</span>
    ${remarkAt ? `<p class="text-xs text-gray-500 mt-1">${formatFullDate(remarkAt)}</p>` : ""}
  `;

  // Optional visual cue when remark changes
  remarkBox.classList.add("animate-pulse");
  setTimeout(() => remarkBox.classList.remove("animate-pulse"), 1200);
});


}

// 🔹 Save handler
async function saveChanges(uid,fieldId,origData,modal,newData){
const savingOverlay = document.createElement('div');
savingOverlay.className = 'fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-[300]';
savingOverlay.innerHTML = `
  <div class="bg-white rounded-xl p-6 shadow-lg text-center">
    <div class="w-8 h-8 border-4 border-[var(--cane-100)] border-t-[var(--cane-700)] rounded-full animate-spin mx-auto mb-3"></div>
    <p class="text-sm text-[var(--cane-700)] font-medium">Saving updates...</p>
  </div>`;
document.body.appendChild(savingOverlay);

  try{
    const updates = {
      ...newData,
      status: 'pending',
      updatedAt: serverTimestamp(),
      isNew: true
    };

    const storage=getStorage();
    for(const key of ['barangayCertUrl','landTitleUrl','validFrontUrl','validBackUrl','selfieUrl']){
      const fileEl=modal.querySelector(`#file_${key}`);
      const b64=modal.querySelector(`#b64_${key}`).value;
      if(fileEl?.files?.length||b64.startsWith('data:')){
        const refPath=`field_applications/${uid}/${fieldId}/${key}_${Date.now()}.png`;
        const refObj=sref(storage,refPath);
        const uploadTask=b64.startsWith('data:')?uploadString(refObj,b64,'data_url'):uploadBytes(refObj,fileEl.files[0]);
        await uploadTask;
        const url=await getDownloadURL(refObj);
        if(origData[key]) await deleteStorageFileIfUrl(origData[key]);
        updates[key]=url;
      }
    }

    await updateDoc(doc(db,'field_applications',uid,'fields',fieldId),updates);
    savingOverlay.remove();

    //  Success modal with smooth fade
    const successModal = document.createElement('div');
    successModal.className = 'fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-[400] animate-fadeIn';
    successModal.innerHTML = `
    <div class="bg-white rounded-2xl p-6 text-center shadow-xl max-w-sm w-[90%]">
        <div class="text-5xl text-[var(--cane-700)] mb-2">✅</div>
        <h3 class="text-lg font-semibold text-[var(--cane-800)] mb-2">Saved Successfully</h3>
        <p class="text-sm text-[var(--cane-700)] mb-4">Your field has been updated and set to <b>Pending</b> for review.</p>
        <button id="okBtn" class="btn-primary px-5 py-2 rounded-lg">OK</button>
    </div>
    `;
    successModal.querySelector('#okBtn').onclick = () => {
    successModal.remove();
    modal.remove();
    loadFields(uid);
    };
    document.body.appendChild(successModal);

  }catch(err){console.error(err);showAlert("Failed to save changes.","error");}
}

// "Open document"
function setPreview(el, urls) {
  el.innerHTML = '';

  // Allow single string or array
  const list = Array.isArray(urls) ? urls : [urls].filter(Boolean);
  if (list.length === 0) {
    el.innerHTML = '<p class="text-xs text-gray-500 italic">No file</p>';
    return;
  }

  // render all urls
  list.forEach((url, i) => {
    const isImage = url.startsWith('data:image') || /\.(png|jpg|jpeg)$/i.test(url);
    const fileName = isImage ? `Image_${i + 1}.png` : `Document_${i + 1}`;
    const link = document.createElement('p');
    link.textContent = fileName;
    link.className = 'text-sm text-[var(--cane-700)] underline cursor-pointer font-medium hover:text-[var(--cane-800)]';
    link.onclick = () => openFullscreenViewer(url);
    el.appendChild(link);
  });
}


// 🌿 Simple animation for smooth modal fade
const style = document.createElement("style");
style.textContent = `
@keyframes fadeInModal {
  from { opacity: 0; transform: scale(0.95); }
  to { opacity: 1; transform: scale(1); }
}
.animate-fadeIn {
  animation: fadeInModal 0.25s ease forwards;
}
`;
document.head.appendChild(style);

function loadLeaflet(){return new Promise(res=>{if(window.L)return res();const l=document.createElement('link');l.rel='stylesheet';l.href='https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';document.head.appendChild(l);const s=document.createElement('script');s.src='https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';s.onload=res;document.body.appendChild(s);});}

// -------------------------------------------------------------
//  Unified Terms & Privacy Modal (fixed for ES modules + fade animation)
// -------------------------------------------------------------
function initLegalModal() {
  const overlay = document.getElementById("legalOverlay");
  const modal = document.getElementById("legalModal");
  const content = document.getElementById("legalContent");
  const closeBtn = document.getElementById("closeLegal");
  const acceptBtn = document.getElementById("legalAccept");
  const openTerms = document.getElementById("openTerms");
  const openPrivacy = document.getElementById("openPrivacy");
  const agreeCheckbox = document.getElementById("policyCheck");

  if (!overlay || !modal || !openTerms || !openPrivacy) return; // wait if not yet in DOM

  //  Fill in full content once
  const html = `
  <article id="terms" class="space-y-3">
    <h3 class="text-lg font-bold text-[var(--cane-800)]">TERMS AND CONDITIONS</h3>
    <p>CaneMap is an official digital system for sugarcane field registration and monitoring. By registering, you acknowledge and agree to the policies outlined below.</p>
    <h4 class="font-semibold">1. Purpose</h4>
    <p>This service allows landowners and handlers to register their sugarcane fields for SRA validation, including land location, area, terrain, and supporting documents.</p>
    <h4 class="font-semibold">2. User Obligations</h4>
    <p>Users must provide accurate information and valid supporting documents. Submitting false or misleading data may result in account suspension or legal action.</p>
    <h4 class="font-semibold">3. Submitted Data</h4>
    <p>All fields submitted, including coordinates and uploaded images, are used solely for official verification under the Sugar Regulatory Administration (SRA).</p>
    <h4 class="font-semibold">4. System Use</h4>
    <p>Users shall not misuse or modify CaneMap systems. Unauthorized access or tampering is prohibited under RA 10173 (Data Privacy Act) and RA 8792 (E-Commerce Act).</p>
    <h4 class="font-semibold">5. Verification & Approval</h4>
    <p>Submissions will be validated by SRA or mill district officers. Review may include land inspection and documentation checks.</p>
    <h4 class="font-semibold">6. Limitation of Liability</h4>
    <p>CaneMap is provided “as is”. CaneMap is not liable for losses due to user error, rejected submissions, or connection issues.</p>
    <h4 class="font-semibold">7. Amendments</h4>
    <p>Terms may be updated periodically to comply with new policies.</p>
  </article>

  <hr class="my-4 border-gray-300/70">

  <article id="privacy" class="space-y-3">
    <h3 class="text-lg font-bold text-[var(--cane-800)]">PRIVACY POLICY</h3>
    <p>CaneMap values your privacy under the Data Privacy Act of 2012.</p>
    <h4 class="font-semibold">1. Information Collected</h4>
    <p>We collect your name, contact info, field details, and verification photos (ID and selfie).</p>
    <h4 class="font-semibold">2. Purpose</h4>
    <p>Used to verify land ownership and support SRA monitoring.</p>
    <h4 class="font-semibold">3. Storage & Retention</h4>
    <p>Data is securely stored in Firebase under <code>field_applications/{userUid}</code>.</p>
    <h4 class="font-semibold">4. Sharing</h4>
    <p>Shared only with authorized SRA staff and agencies for official purposes.</p>
    <h4 class="font-semibold">5. Protection</h4>
    <p>Secured through HTTPS, Authentication, and Firebase encryption.</p>
    <h4 class="font-semibold">6. User Rights</h4>
    <p>You may request correction or deletion via <code>support@canemap.ph</code>.</p>
    <h4 class="font-semibold">7. Updates</h4>
    <p>Policy updates will be posted on the app.</p>
  </article>

  <p class="text-xs text-gray-500 mt-4">Last updated ${new Date().toLocaleDateString()}</p>
  `;
  content.innerHTML = html;

  //  open + fade-in animation
  function openModal(scrollToId) {
    overlay.classList.remove("hidden");
    modal.classList.add("animate-fadeIn");
    document.body.style.overflow = "hidden";
    setTimeout(() => {
      const target = document.getElementById(scrollToId);
      if (target) target.scrollIntoView({ behavior: "smooth" });
    }, 120);
  }

  //  close modal
  function closeModal() {
    modal.classList.remove("animate-fadeIn");
    overlay.classList.add("hidden");
    document.body.style.overflow = "";
  }

  // Attach listeners
  openTerms.onclick = e => { e.preventDefault(); openModal("terms"); };
  openPrivacy.onclick = e => { e.preventDefault(); openModal("privacy"); };
  closeBtn.onclick = closeModal;
  overlay.onclick = e => { if (e.target === overlay) closeModal(); };
  acceptBtn.onclick = () => {
    closeModal();
    if (agreeCheckbox) agreeCheckbox.checked = true;
  };
  document.addEventListener("keydown", e => {
    if (e.key === "Escape" && !overlay.classList.contains("hidden")) closeModal();
  });
}

