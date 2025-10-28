// Review.js (updated) — compatible with nested field_applications/{uid}/fields documents
// Previously: expected top-level apps and different image-field names.
// Now: uses collectionGroup('fields'), keeps DocumentReference, and tolerates multiple image field names.

import { db } from '../Common/firebase-config.js';
import {
  collection,
  collectionGroup,
  query,
  orderBy,
  where,
  getDocs,
  doc,
  updateDoc,
  addDoc,
  serverTimestamp,
  getDoc
} from 'https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js';

// small helper to create DOM nodes
function h(tag, className = '', children = []) {
  const el = document.createElement(tag);
  if (className) el.className = className;
  if (!Array.isArray(children)) children = [children];
  for (const child of children) {
    if (child == null) continue;
    if (typeof child === 'string') el.appendChild(document.createTextNode(child));
    else el.appendChild(child);
  }
  return el;
}

// ---------- Utility: safe value access with multiple aliases ----------
function pickFirst(obj, keys = []) {
  for (const k of keys) {
    if (obj && Object.prototype.hasOwnProperty.call(obj, k) && obj[k] != null && obj[k] !== '') {
      return obj[k];
    }
  }
  return null;
}

// ---------- Fetch all field_applications/{uid}/fields/{fieldId} ----------
async function fetchApplications(status = 'all') {
  let fieldSnap;
  try {
    // Fetch all "fields" subcollections across all field_applications
    const fieldQ = query(collectionGroup(db, 'fields'));
    fieldSnap = await getDocs(fieldQ);
  } catch (e) {
    console.warn('collectionGroup(fields) read failed:', e);
    fieldSnap = { docs: [] };
  }

const normalize = (d) => {
  const raw = d.data();

// ✅ Handle all possible field name variations
const validFront = pickFirst(raw, [
  'validFrontUrl', 'valid_id_front', 'valid_front', 'front_id'
]);

const validBack = pickFirst(raw, [
  'validBackUrl', 'valid_id_back', 'valid_back', 'back_id'
]);

const selfie = pickFirst(raw, [
  'selfieUrl', 'selfie_with_id', 'selfie_id'
]);

// ✅ Barangay Certificate field (supports your barangayCertUrl key)
const brgyCert = pickFirst(raw, [
  'barangay_certification',
  'barangay_certificate',
  'barangay_certification_url',
  'barangay_certificate_url',
  'barangayCertUrl',
  'brgyCertUrl',
  'brgy_certificate',
  'barangayCert'
]);

// ✅ Land Title field (supports your landTitleUrl key)
const landTitle = pickFirst(raw, [
  'land_title',
  'land_title_url',
  'landTitleUrl',
  'land_titleURL',
  'landTitle'
]);

  return {
    id: d.id,
    docRef: d.ref,
    path: d.ref.path,
    raw,
    applicantName: pickFirst(raw, ['applicantName', 'requestedBy', 'userId', 'requester']) || '—',
    barangay: pickFirst(raw, ['barangay', 'location']) || '—',
    fieldName: pickFirst(raw, ['field_name', 'fieldName']) || '—',
    terrain: pickFirst(raw, ['terrain_type', 'terrain']) || '—',
    variety: pickFirst(raw, ['sugarcane_variety', 'variety']) || '—',
    street: pickFirst(raw, ['street']) || '—',
    size: pickFirst(raw, ['field_size', 'size', 'fieldSize']) || '—',
    lat: pickFirst(raw, ['latitude', 'lat']),
    lng: pickFirst(raw, ['longitude', 'lng']),
    status: pickFirst(raw, ['status']) || 'pending',
    createdAt: pickFirst(raw, ['submittedAt', 'createdAt']),
    images: {
      validFront,
      validBack,
      selfie,
      brgyCert,
      landTitle,
    },
  };
};

// Convert to normalized apps
// Convert to normalized apps
let allFields = fieldSnap.docs.map(normalize);

// 🔹 Enrich each with applicant name from users collection if only UID is present
const userCache = {};

for (const app of allFields) {
  // 1️⃣ Extract UID directly from Firestore path
  // Example path: field_applications/abc123/fields/xyz789
  const pathParts = app.path.split('/');
  const userIdFromPath = pathParts.length >= 2 ? pathParts[1] : null;

  let possibleUid = null;
  // Prefer data first (if applicantName looks like UID)
  if (
    app.applicantName &&
    app.applicantName.length < 25 &&
    !app.applicantName.includes(' ')
  ) {
    possibleUid = app.applicantName;
  } else if (userIdFromPath) {
    possibleUid = userIdFromPath;
  }

  if (possibleUid) {
    // 2️⃣ Use cached name if available
    if (userCache[possibleUid]) {
      app.applicantName = userCache[possibleUid];
      continue;
    }

    // 3️⃣ Lookup Firestore /users/{uid}
    try {
      const userRef = doc(db, 'users', possibleUid);
      const userSnap = await getDoc(userRef);
      if (userSnap.exists()) {
        const userData = userSnap.data();
        const displayName =
          userData.name ||
          userData.fullName ||
          userData.displayName ||
          userData.email ||
          possibleUid;
        app.applicantName = displayName;
        userCache[possibleUid] = displayName;
      }
    } catch (err) {
      console.warn('User lookup failed for', possibleUid, err);
    }
  }
}

  // Optional: filter by status
  let filtered = allFields;
    if (status === 'pending') filtered = allFields.filter((a) => a.status === 'pending');
    if (status === 'to edit') filtered = allFields.filter((a) => a.status === 'to edit');
    if (status === 'reviewed') filtered = allFields.filter((a) => a.status === 'reviewed');

  // Sort newest first
  filtered.sort((a, b) => {
    const t1 = a.createdAt?.seconds || 0;
    const t2 = b.createdAt?.seconds || 0;
    return t2 - t1;
  });

  return filtered;
}


// date formatting helper
function formatDate(ts) {
  try {
    if (!ts) return '';
    const d = ts.seconds ? new Date(ts.seconds * 1000) : new Date(ts);
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  } catch { return ''; }
}

// ✅ CLEAN, FIXED MODAL — 1 confirmation only + working Send Remarks
async function openModal(app) {
  let modal = document.getElementById('sraReviewModal');
  if (!modal) {
    modal = document.body.appendChild(
      h('div', 'fixed inset-0 bg-black/40 hidden items-center justify-center z-50', [])
    );
    modal.id = 'sraReviewModal';
  }
  modal.innerHTML = '';

  const card = h('div', 'bg-white rounded-xl w-[92%] max-w-3xl p-0 shadow-2xl relative');
  const header = h('div', 'px-6 pt-5 pb-3 border-b flex items-center justify-between');
  const close = h('button', 'absolute top-3 right-4 text-xl', '×');
  close.addEventListener('click', () => modal.classList.add('hidden'));
  header.appendChild(h('h3', 'text-lg font-semibold', 'Field Application'));
  card.appendChild(header);
  card.appendChild(close);

  const content = h('div', 'max-h-[70vh] overflow-y-auto p-6 space-y-6');

  // Field Info
  const infoWrap = h('div', 'space-y-3');
  const grid = h('div', 'grid grid-cols-1 md:grid-cols-2 gap-3');
  const info = [
    ['Applicant', app.applicantName || '—'],
    ['Field Name', app.fieldName || '—'],
    ['Sugarcane Variety', app.variety || '—'],
    ['Barangay', app.barangay || '—'],
    ['Street', app.street || '—'],
    ['Terrain', app.terrain || '—'],
    ['Size (ha)', String(app.size || '—')],
    ['Latitude', app.lat != null ? String(app.lat) : '—'],
    ['Longitude', app.lng != null ? String(app.lng) : '—'],
    ['Status', app.status || 'pending'],
    ['Submitted', formatDate(app.createdAt)]
  ];
  for (const [k, v] of info)
    grid.appendChild(
      h('div', 'text-sm', [h('div', 'text-gray-500', k), h('div', 'font-medium', v)])
    );
  infoWrap.appendChild(h('div', 'font-semibold', 'Field Information'));
  infoWrap.appendChild(grid);
  content.appendChild(infoWrap);

  // Map
  const mapWrap = h('div', 'space-y-2');
  mapWrap.appendChild(h('div', 'font-semibold', 'Location Mapping'));
  const mapBox = h('div', 'w-full h-52 rounded-lg border');
  mapWrap.appendChild(mapBox);
  content.appendChild(mapWrap);

  // Documents
  const docsWrap = h('div', 'space-y-3');
  docsWrap.appendChild(h('div', 'font-semibold', 'Required Documents'));
  const docsGrid = h('div', 'grid grid-cols-1 md:grid-cols-2 gap-3');
  const imgStyle = 'w-full max-h-40 object-contain rounded border bg-white';
  const makeImg = (src) => {
    if (!src) return h('div', 'text-xs text-gray-600', 'No file');

    const img = document.createElement('img');
    img.src = src;
    img.className = imgStyle;
    img.alt = 'document';

    // 🖼️ Click to view fullscreen
    img.addEventListener('click', () => openFullscreenImage(src));

    return img;
  };
  const addDocRow = (label, src) => {
    const wrap = h('div', 'space-y-1');
    wrap.appendChild(h('div', 'text-sm font-medium', label));
    wrap.appendChild(makeImg(src));
    docsGrid.appendChild(wrap);
  };
  addDocRow('Barangay Certificate', app.images.brgyCert);
  addDocRow('Land Title', app.images.landTitle);
  addDocRow('Valid ID - Front', app.images.validFront);
  addDocRow('Valid ID - Back', app.images.validBack);
  addDocRow('Selfie with ID', app.images.selfie);
  docsWrap.appendChild(docsGrid);
  content.appendChild(docsWrap);

  // === Actions ===
  const actions = h('div', 'pt-2 space-y-4');

  // Remarks box
  const remarksBox = h('textarea', 'w-full border rounded-lg p-2 text-sm', []);
  remarksBox.placeholder = 'Add remarks for the applicant (optional)';

  // 🟢 Load last remark if it exists
  remarksBox.value = app.status === 'reviewed' ? '' : (app.raw.latestRemark || '');

  const sendRemarksBtn = h(
    'button',
    'px-4 py-2 rounded bg-yellow-600 hover:bg-yellow-700 text-white text-sm',
    'Send Remarks'
  );

sendRemarksBtn.addEventListener('click', async () => {
  const text = (remarksBox.value || '').trim();
  if (!text) return showErrorPopup('Please enter remarks before sending.');

  const confirm = makeConfirmModal(
    'Send Remarks?',
    'The remarks will be submitted, and this field will be updated as "To Edit".',
    async () => {
      try {
        // ✅ FIXED: Correct path for subcollection
        await addDoc(collection(app.docRef, 'remarks'), {
          message: text,
          createdAt: serverTimestamp()
        });

        await updateDoc(app.docRef, {
          latestRemark: text,
          latestRemarkAt: serverTimestamp(),
          status: 'to edit'
        });

      await addDoc(collection(db, 'notifications'), {
        userId: app.raw.requestedBy || app.raw.userId || app.applicantName,
        title: 'Remarks from Ormoc Mill District SRA Officer',
        message: 'Change the document. <a href="../../frontend/Handler/Field Form.html" target="_blank" class="notif-link">Open Form</a>',
        status: 'unread',
        timestamp: serverTimestamp()
      });

        confirm.remove();
        showSuccessPopup('Remarks Sent', 'Status updated to "To Edit".');
        await render();
      } catch (err) {
        console.error('Send remark failed:', err);
        showErrorPopup('Failed to send remarks. Please check your connection or permissions.');
      }
    }
  );
  document.body.appendChild(confirm);
});


  // Buttons section
  const buttonsRow = h('div', 'flex justify-end gap-2 pt-1');
  const markReviewedBtn = h(
    'button',
    `px-4 py-2 rounded text-sm ${
      app.status === 'reviewed'
        ? 'bg-gray-300 text-gray-600 cursor-not-allowed'
        : 'bg-green-600 hover:bg-green-700 text-white'
    }`,
    'Mark as Reviewed'
  );

  // Always visible, but disabled if already reviewed
  markReviewedBtn.disabled = app.status === 'reviewed';
  markReviewedBtn.addEventListener('click', () => {
    if (markReviewedBtn.disabled) return;
    const confirm = makeConfirmModal(
      'Confirm Review?',
      'Are you sure all information is correct and complete?',
      async () => {
        try {
          await updateStatus(app, 'reviewed');
          remarksBox.value = '';
          confirm.remove();
          showSuccessPopup('Marked as Reviewed', 'Field status updated to "Reviewed".');
        } catch (err) {
          console.error(err);
          showErrorPopup('Failed to update status.');
        }
      }
    );
    document.body.appendChild(confirm);
  });

  actions.append(remarksBox, sendRemarksBtn, buttonsRow);
  buttonsRow.append(markReviewedBtn);
  content.appendChild(actions);

  card.appendChild(content);
  modal.appendChild(card);
  modal.classList.remove('hidden');
  modal.classList.add('flex');

  // Initialize map
  try {
    if (typeof app.lat === 'number' && typeof app.lng === 'number') {
      await ensureLeafletLoaded();
      const map = L.map(mapBox).setView([app.lat, app.lng], 14);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors'
      }).addTo(map);
      const caneIcon = L.icon({
        iconUrl: '../img/PIN.png',
        iconSize: [32, 32],
        iconAnchor: [16, 30],
        popupAnchor: [0, -28]
      });

    // ✅ Build professional dynamic popup text (Field Name first, then Barangay)
    const fieldNameText = app.fieldName && app.fieldName !== '—' ? app.fieldName : 'Registered Field';
    const barangayText = app.barangay && app.barangay !== '—' ? ` (${app.barangay})` : '';
    const streetText = app.street && app.street !== '—' ? `<br>🏠︎ <i>${app.street}</i>` : '';
    const coordText =
      typeof app.lat === 'number' && typeof app.lng === 'number'
        ? `<br>⟟ <i>Lat: ${app.lat.toFixed(5)}, Lng: ${app.lng.toFixed(5)}</i>`
        : '';

    const popupText = `
      <div style="font-size:13px; line-height:1.4">
        <b>${fieldNameText}${barangayText}</b>
        ${streetText}
        ${coordText}
      </div>
    `;

    L.marker([app.lat, app.lng], { icon: caneIcon })
      .addTo(map)
      .bindPopup(popupText)
      .openPopup();


      setTimeout(() => map.invalidateSize(), 100);
    } else {
      mapBox.innerHTML =
        '<div class="w-full h-full flex items-center justify-center text-gray-600 text-sm">No coordinates provided</div>';
    }
  } catch (err) {
    console.warn('Map init error:', err);
    mapBox.innerHTML =
      '<div class="w-full h-full flex items-center justify-center text-gray-600 text-sm">Map failed to load</div>';
  }
}

// Ensure Leaflet loading helper (kept same as your original)
async function ensureLeafletLoaded() {
  if (window.L) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet'; link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
  document.head.appendChild(link);
  await new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
    s.onload = resolve; s.onerror = reject; document.body.appendChild(s);
  });
}

// ---------- Update status (now supports nested doc updates using the DocumentReference kept earlier) ----------
async function updateStatus(appOrId, status) {
  // appOrId can be either the whole app object (preferred) or an id string (legacy)
  try {
    let docRefToUpdate = null;
    if (typeof appOrId === 'object' && appOrId.docRef) {
      docRefToUpdate = appOrId.docRef;
    } else if (typeof appOrId === 'string') {
      // try to update top-level doc first
      try { docRefToUpdate = doc(db, 'field_applications', appOrId); } catch (_) { docRefToUpdate = null; }
    }

    // If we couldn't find a docRef, try to find the doc by id in the collectionGroup (last resort)
    if (!docRefToUpdate) {
      // search for doc with matching id in collectionGroup
      const groupSnap = await getDocs(query(collectionGroup(db, 'fields'), where('__name__', '==', appOrId)));
      if (groupSnap.docs.length) docRefToUpdate = groupSnap.docs[0].ref;
    }

    // If we still don't have docRef, and we were given an object with path, create one
    if (!docRefToUpdate && typeof appOrId === 'object' && appOrId.path) {
      const pathParts = appOrId.path.split('/'); // path like 'field_applications/{uid}/fields/{fieldId}'
      docRefToUpdate = doc(db, ...pathParts);
    }

    // If we have a docRef — perform the update
    if (docRefToUpdate) {
      await updateDoc(docRefToUpdate, {
        status,
        statusUpdatedAt: serverTimestamp()
      });
    } else {
      // fallback: try update top-level doc by id (legacy)
      if (typeof appOrId === 'string') {
        try {
          await updateDoc(doc(db, 'field_applications', appOrId), { status, statusUpdatedAt: serverTimestamp() });
        } catch (e) {
          throw new Error('Could not locate document to update: ' + (e.message || e));
        }
      } else {
        throw new Error('No document reference provided for update.');
      }
    }

    // If we changed to 'reviewed', do the same side effects you already had:
    if (status === 'reviewed') {
      let appData = null;
      try {
        const snap = await getDoc(docRefToUpdate);
        if (snap.exists()) appData = snap.data();
      } catch (e) { appData = null; }

      if (appData) {
        const applicantUid =
          appData.requestedBy || appData.userId || appData.requester || appData.applicantName;

        // 🟢 Add to top-level "fields" collection
        try {
          await addDoc(collection(db, 'fields'), {
            userId: applicantUid,
            barangay: appData.barangay || appData.location,
            size: appData.field_size || appData.size || appData.fieldSize,
            terrain: appData.terrain_type || appData.terrain,
            lat: appData.latitude || appData.lat,
            lng: appData.longitude || appData.lng,
            registeredAt: serverTimestamp(),
            applicantName: appData.applicantName || 'Unknown'
          });
        } catch (e) {
          console.warn('Adding to top-level fields collection failed:', e);
        }

        // 🟢 Update applicant’s role → "handler"
        try {
          if (applicantUid) {
            const userRef = doc(db, 'users', applicantUid);
            await updateDoc(userRef, { role: 'handler' });
            console.log(`✅ User ${applicantUid} role updated to handler`);
          }
        } catch (err) {
          console.warn('Failed to update user role:', err);
        }

        // 🟢 Notify applicant
        try {
        await addDoc(collection(db, 'notifications'), {
          userId: applicantUid,
          title: 'Field Registration Approved!',
          message: 'Your field has been reviewed by the Ormoc Mill District SRA Officer. You can now check your dashboard <a href="../../frontend/Handler/dashboard.html" target="_blank" class="notif-link">here</a>.',
          status: 'unread',
          timestamp: serverTimestamp()
        });
        } catch (e) {
          console.warn('Notification creation failed:', e);
        }
      }
    }

    // Re-render list with current filter (if present)
    const statusSelect = document.getElementById('fieldDocsStatus');
    const current = statusSelect && statusSelect.value ? statusSelect.value : 'all';
    await render(current);

  } catch (e) {
    console.error(e);
    const errPopup = document.createElement('div');
    errPopup.className = 'fixed inset-0 bg-black/40 flex items-center justify-center z-50';
    errPopup.innerHTML = `<div class='bg-white rounded-xl p-6 shadow-xl text-center max-w-sm mx-auto'><h2 class='text-xl font-bold mb-2 text-red-700'>Update Failed</h2><p class='mb-4 text-gray-700'>There was an error updating the field status. Please try again.<br><span class='text-xs text-red-500'>${e.message || e}</span></p><button id='closeErrSraPopupBtn' class='px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700'>Close</button></div>`;
    document.body.appendChild(errPopup);
    document.getElementById('closeErrSraPopupBtn').onclick = function(){ errPopup.remove(); };
  }
}

function buildItem(app) {
  // --- Single Status Badge ---
  const statusColor =
    app.status === 'reviewed'
      ? 'bg-green-100 text-green-700'
      : app.status === 'to edit'
      ? 'bg-yellow-100 text-yellow-700'
      : 'bg-gray-100 text-gray-700';

  const statusText =
    app.status === 'reviewed'
      ? 'Reviewed'
      : app.status === 'to edit'
      ? 'To Edit'
      : 'Pending Review';

  const statusBadge = h('span', `text-xs px-2 py-1 rounded ${statusColor}`, statusText);

  // --- Left Info ---
  const left = h('div', 'flex items-start space-x-3', [
    h(
      'div',
      'w-9 h-9 bg-gradient-to-br from-green-600 to-green-700 rounded-full flex items-center justify-center text-white',
      [h('i', 'fas fa-user')]
    ),
    h('div', '', [
      h('p', 'text-[var(--cane-900)] font-semibold leading-tight', app.applicantName || 'Unknown Applicant'),
      h('p', 'text-sm text-[var(--cane-700)]', `Field Registration - ${app.barangay || 'N/A'}`),
      h('p', 'text-xs text-[var(--cane-600)]', `${formatDate(app.createdAt)} · ${app.barangay || ''}`)
    ])
  ]);

  // --- Right: just status badge ---
  const right = h('div', 'flex items-center space-x-2', [statusBadge]);

  // --- Row Wrapper ---
  const row = h('div', 'flex items-start justify-between px-4 py-3 cursor-pointer hover:bg-[var(--cane-50)]');
  row.append(left, right);

  // --- Open modal when clicked ---
  row.addEventListener('click', () => openModal(app));

  return row;
}

// Render the list into container #fieldDocsDynamic
async function render(status = 'all') {
  const container = document.getElementById('fieldDocsDynamic');
  if (!container) return;
  container.innerHTML = '';
  const list = h('div', 'divide-y divide-[var(--cane-200)]');
  const apps = await fetchApplications(status);
  if (apps.length === 0) {
    container.appendChild(h('div', 'px-4 py-6 text-[var(--cane-700)] text-sm', 'No applications yet.'));
    return;
  }
  for (const app of apps) list.appendChild(buildItem(app));
  container.appendChild(list);
}

// --- Reusable confirmation modal ---
function makeConfirmModal(title, message, onConfirm) {
  const modal = document.createElement('div');
  modal.className = 'fixed inset-0 bg-black/40 flex items-center justify-center z-50';
  modal.innerHTML = `
    <div class="bg-white rounded-xl p-6 shadow-xl text-center max-w-sm mx-auto">
      <h2 class="text-xl font-bold mb-2 text-[var(--cane-800)]">${title}</h2>
      <p class="mb-5 text-[var(--cane-700)]">${message}</p>
      <div class="flex justify-center gap-3">
        <button id="cancelConfirm" class="px-4 py-2 bg-gray-200 text-gray-700 rounded hover:bg-gray-300">Cancel</button>
        <button id="okConfirm" class="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700">OK</button>
      </div>
    </div>`;
  modal.querySelector('#cancelConfirm').onclick = () => modal.remove();
  modal.querySelector('#okConfirm').onclick = async () => {
    await onConfirm();
    modal.remove();
  };
  return modal;
}

// --- Simple success popup ---
function showSuccessPopup(title, msg) {
  const popup = document.createElement('div');
  popup.className = 'fixed inset-0 bg-black/40 flex items-center justify-center z-50';
  popup.innerHTML = `
    <div class="bg-white rounded-xl p-6 shadow-xl text-center max-w-sm mx-auto">
      <h2 class="text-xl font-bold mb-2 text-green-700">${title}</h2>
      <p class="mb-4 text-gray-700">${msg}</p>
      <button class="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700">OK</button>
    </div>`;
  
  const okBtn = popup.querySelector('button');
  okBtn.onclick = () => {
    popup.remove();

    // 🔹 Close the main review modal if it's open
    const reviewModal = document.getElementById('sraReviewModal');
    if (reviewModal) reviewModal.classList.add('hidden');
  };

  document.body.appendChild(popup);
}


// --- Error popup ---
function showErrorPopup(msg) {
  const popup = document.createElement('div');
  popup.className = 'fixed inset-0 bg-black/40 flex items-center justify-center z-50';
  popup.innerHTML = `
    <div class="bg-white rounded-xl p-6 shadow-xl text-center max-w-sm mx-auto">
      <h2 class="text-xl font-bold mb-2 text-red-700">Error</h2>
      <p class="mb-4 text-gray-700">${msg}</p>
      <button class="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700">Close</button>
    </div>`;
  popup.querySelector('button').onclick = () => popup.remove();
  document.body.appendChild(popup);
}

// --- Fullscreen Image Viewer ---
function openFullscreenImage(src) {
  const overlay = document.createElement('div');
  overlay.className = 'fixed inset-0 bg-black/80 flex items-center justify-center z-50';
  overlay.innerHTML = `
    <div class="relative max-w-5xl max-h-[90vh]">
      <button id="closeImageFullscreen"
        class="absolute top-2 right-2 text-white text-2xl bg-black/40 hover:bg-black/60 rounded-full w-10 h-10 flex items-center justify-center">×</button>
      <img src="${src}" class="max-w-full max-h-[90vh] rounded-lg shadow-2xl border border-white/20 object-contain" />
    </div>
  `;

  overlay.querySelector('#closeImageFullscreen').onclick = () => overlay.remove();
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) overlay.remove();
  });

  document.body.appendChild(overlay);
}

// Public init
export const SRAReview = {
  async init() {
    const statusSelect = document.getElementById('fieldDocsStatus');
    if (statusSelect) {
      statusSelect.addEventListener('change', () => render(statusSelect.value));
    }
    await render('all');
  }
};

// Allow global access if not using modules
// eslint-disable-next-line no-undef
window.SRAReview = SRAReview; 