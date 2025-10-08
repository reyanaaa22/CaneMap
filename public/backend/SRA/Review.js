// Review Applications module for SRA Officer
// Renders list of field applications from Firestore and allows status updates

import { db } from '../Common/firebase-config.js';
import {
  collection,
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

async function fetchApplications(status = 'all') {
  const baseRef = collection(db, 'field_applications');
  // Base query: order by createdAt desc
  let q = query(baseRef, orderBy('createdAt', 'desc'));
  // For reviewed, we can filter server-side. For pending, include docs with missing status as pending.
  if (status === 'reviewed') {
    q = query(baseRef, where('status', '==', 'reviewed'), orderBy('createdAt', 'desc'));
    const reviewedSnap = await getDocs(q);
    return reviewedSnap.docs.map(d => ({ id: d.id, ...d.data() }));
  }
  // For 'all' and 'pending' we fetch then filter client-side to include missing statuses as pending.
  const snap = await getDocs(q);
  const apps = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  if (status === 'pending') {
    return apps.filter(a => (a.status == null) || String(a.status).toLowerCase() === 'pending');
  }
  return apps;
}

function formatDate(ts) {
  try {
    if (!ts) return '';
    const d = ts.seconds ? new Date(ts.seconds * 1000) : new Date(ts);
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  } catch { return ''; }
}

function buildItem(app) {
  const statusBadge = h('span', `text-xs px-2 py-1 rounded ${app.status === 'reviewed' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-700'}`, app.status === 'reviewed' ? 'Reviewed' : 'Pending Review');

  const left = h('div', 'flex items-start space-x-3', [
    h('div', 'w-9 h-9 bg-gradient-to-br from-[var(--cane-500)] to-[var(--cane-600)] rounded-full flex items-center justify-center text-white', [h('i', 'fas fa-user')]),
    h('div', '', [
      h('p', 'text-[var(--cane-900)] font-semibold leading-tight', app.applicantName || 'Unknown Applicant'),
      h('p', 'text-sm text-[var(--cane-700)]', `Field Registration - ${app.barangay || 'N/A'}`),
      h('p', 'text-xs text-[var(--cane-600)]', `${formatDate(app.createdAt)}  ·  ${app.barangay || ''}`)
    ])
  ]);

  // Whole row clickable, keep status actions on the right
  const row = h('div', 'flex items-start justify-between px-4 py-3 cursor-pointer hover:bg-[var(--cane-50)]');
  row.appendChild(left);

  const actions = h('div', 'flex items-center space-x-2');
  const pendBtn = h('button', 'px-3 py-1 rounded bg-gray-100 text-gray-700 text-xs hover:bg-gray-200', 'Pending');
  const revBtn = h('button', 'px-3 py-1 rounded bg-green-100 text-green-700 text-xs hover:bg-green-200', 'Reviewed');
  actions.append(statusBadge, pendBtn, revBtn);
  row.appendChild(actions);

  // Open modal when clicking the row (not the status buttons)
  row.addEventListener('click', () => openModal(app));
  pendBtn.addEventListener('click', (e) => { e.stopPropagation(); updateStatus(app.id, 'pending'); });
  revBtn.addEventListener('click', (e) => { e.stopPropagation(); updateStatus(app.id, 'reviewed'); });

  return row;
}

async function updateStatus(id, status) {
  try {
    await updateDoc(doc(db, 'field_applications', id), { status, statusUpdatedAt: serverTimestamp() });
    // If approved, also add to 'fields' collection and notify farmer
    if (status === 'reviewed') {
      const appSnap = await getDoc(doc(db, 'field_applications', id));
      const app = appSnap.data();
      if (app) {
        // Save to 'fields' collection for map display
        await addDoc(collection(db, 'fields'), {
          userId: app.userId,
          barangay: app.barangay,
          size: app.size,
          terrain: app.terrain,
          lat: app.lat,
          lng: app.lng,
          registeredAt: serverTimestamp(),
          applicantName: app.applicantName
        });
        // Send notification to farmer (Firestore or localStorage)
        try {
          // Write user-scoped notification in Firestore so the lobby can read it cross-device
          try {
            await addDoc(collection(db, 'notifications'), {
              userId: app.userId || app.applicantName,
              type: 'approved',
              title: 'Field Approved!\n',
              message: 'Your field has been reviewed and is now officially registered in CaneMap. You can now access the Handler Dashboard.',
              createdAt: serverTimestamp()
            });
          } catch(_) {}
          // Use localStorage for demo, but ideally use Firestore notifications
          const notifications = JSON.parse(localStorage.getItem('notifications') || '{}');
          const userId = app.userId || app.applicantName;
          if (!notifications[userId]) notifications[userId] = [];
          notifications[userId].push({
            type: 'approved',
            title: 'Field Approved!',
            message: 'Your field has been reviewed and is now officially registered in CaneMap. You can now access the Handler Dashboard.',
            at: new Date().toISOString()
          });
          localStorage.setItem('notifications', JSON.stringify(notifications));
        } catch(e) { /* fallback: no notification */ }
      }
      // Custom confirmation popup
      const popup = document.createElement('div');
      popup.className = 'fixed inset-0 bg-black/40 flex items-center justify-center z-50';
      popup.innerHTML = `<div class='bg-white rounded-xl p-6 shadow-xl text-center max-w-sm mx-auto'><h2 class='text-xl font-bold mb-2 text-green-700'>Field Approved</h2><p class='mb-4 text-gray-700'>The field is now registered and visible on the map. The farmer has been notified.</p><button id='closeSraPopupBtn' class='px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700'>OK</button></div>`;
      document.body.appendChild(popup);
      document.getElementById('closeSraPopupBtn').onclick = function(){ popup.remove(); };
    }
    // Notify SRA that status changed
    try {
      await addDoc(collection(db, 'notifications'), {
        type: 'application_status',
        role: 'sra_officer',
        title: `Application ${status === 'reviewed' ? 'Reviewed' : 'Pending'}`,
        message: `An application status was set to ${status}.`,
        appId: id,
        createdAt: serverTimestamp()
      });
    } catch(_) {}
    const statusSelect = document.getElementById('fieldDocsStatus');
    const current = statusSelect && statusSelect.value ? statusSelect.value : 'all';
    await render(current);
  } catch (e) {
    const errPopup = document.createElement('div');
    errPopup.className = 'fixed inset-0 bg-black/40 flex items-center justify-center z-50';
    errPopup.innerHTML = `<div class='bg-white rounded-xl p-6 shadow-xl text-center max-w-sm mx-auto'>
      <h2 class='text-xl font-bold mb-2 text-red-700'>Update Failed</h2>
      <p class='mb-4 text-gray-700'>There was an error updating the field status. Please try again.<br>
      <span class='text-xs text-red-500'>${e.message || e}</span></p>
      <pre class='bg-gray-100 text-xs text-left p-2 rounded border border-gray-300 max-w-xs mx-auto mb-2'>${JSON.stringify(e, null, 2)}</pre>
      <button id='closeErrSraPopupBtn' class='px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700'>Close</button>
    </div>`;
    document.body.appendChild(errPopup);
    document.getElementById('closeErrSraPopupBtn').onclick = function(){ errPopup.remove(); };
    // eslint-disable-next-line no-console
    console.error(e);
  }
}

async function ensureLeafletLoaded() {
  if (window.L) return;
  // Load Leaflet CSS
  const link = document.createElement('link');
  link.rel = 'stylesheet'; link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
  document.head.appendChild(link);
  // Load Leaflet JS
  await new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
    s.onload = resolve; s.onerror = reject; document.body.appendChild(s);
  });
}

function openDocRow(label, value) {
  const wrap = h('div', 'space-y-1');
  wrap.appendChild(h('div', 'text-xs text-gray-500', label));
  wrap.appendChild(h('div', 'text-sm font-medium break-words', value || '—'));
  return wrap;
}

async function openModal(app) {
  let modal = document.getElementById('sraReviewModal');
  if (!modal) {
    modal = document.body.appendChild(h('div', 'fixed inset-0 bg-black/40 hidden items-center justify-center z-50', []));
    modal.id = 'sraReviewModal';
  }
  modal.innerHTML = '';
  // Fixed-size card with scrollable content inside
  const card = h('div', 'bg-white rounded-xl w-[92%] max-w-3xl p-0 shadow-2xl relative');
  const header = h('div', 'px-6 pt-5 pb-3 border-b border-[var(--cane-200)] flex items-center justify-between');
  const close = h('button', 'absolute top-3 right-4 text-xl', '×');
  close.addEventListener('click', () => { modal.classList.add('hidden'); });
  header.appendChild(h('h3', 'text-lg font-semibold', 'Field Application'));
  card.appendChild(header);
  card.appendChild(close);

  // Scrollable content region
  const content = h('div', 'max-h-[70vh] overflow-y-auto p-6 space-y-6');

  // Field Information
  const infoWrap = h('div', 'space-y-3');
  const grid = h('div', 'grid grid-cols-1 md:grid-cols-2 gap-3');
  const info = [
    ['Applicant', app.applicantName || '—'],
    ['Barangay', app.barangay || '—'],
    ['Terrain', app.terrain || '—'],
    ['Size (ha)', String(app.size || '—')],
    ['Latitude', String(app.lat || '—')],
    ['Longitude', String(app.lng || '—')],
    ['Status', app.status || 'pending'],
    ['Submitted', formatDate(app.createdAt)]
  ];
  for (const [k, v] of info) grid.appendChild(h('div', 'text-sm', [h('div', 'text-gray-500', k), h('div', 'font-medium', v)]));
  infoWrap.appendChild(h('div', 'text-[var(--cane-900)] font-semibold', 'Field Information'));
  infoWrap.appendChild(grid);
  content.appendChild(infoWrap);

  // Map section
  const mapWrap = h('div', 'space-y-2');
  mapWrap.appendChild(h('div', 'text-[var(--cane-900)] font-semibold', 'Location Mapping'));
  const mapBox = h('div', 'w-full h-52 rounded-lg border border-[var(--cane-200)]');
  mapWrap.appendChild(mapBox);
  content.appendChild(mapWrap);

  // Required Documents
  const docsWrap = h('div', 'space-y-3');
  docsWrap.appendChild(h('div', 'text-[var(--cane-900)] font-semibold', 'Required Documents'));
  const docsGrid = h('div', 'grid grid-cols-1 md:grid-cols-2 gap-3');
  const imgStyle = 'w-full max-h-40 object-contain rounded border border-[var(--cane-200)] bg-white';
  const makeImg = (src) => {
    if (!src) return h('div', 'text-xs text-[var(--cane-700)]', 'No file');
    const img = document.createElement('img');
    img.src = src; img.className = imgStyle; img.alt = 'document';
    return img;
  };
  const brgy = h('div', 'space-y-1');
  brgy.appendChild(h('div', 'text-sm font-medium', 'Barangay Certificate'));
  brgy.appendChild(makeImg(app.barangay_certification));
  const land = h('div', 'space-y-1');
  land.appendChild(h('div', 'text-sm font-medium', 'Land Title'));
  land.appendChild(makeImg(app.land_title));
  const idFront = h('div', 'space-y-1');
  idFront.appendChild(h('div', 'text-sm font-medium', 'Valid ID - Front'));
  idFront.appendChild(makeImg(app.valid_id_front));
  const idBack = h('div', 'space-y-1');
  idBack.appendChild(h('div', 'text-sm font-medium', 'Valid ID - Back'));
  idBack.appendChild(makeImg(app.valid_id_back));
  const selfie = h('div', 'space-y-1');
  selfie.appendChild(h('div', 'text-sm font-medium', 'Selfie with ID'));
  selfie.appendChild(makeImg(app.selfie_with_id));
  docsGrid.appendChild(brgy);
  docsGrid.appendChild(land);
  docsGrid.appendChild(idFront);
  docsGrid.appendChild(idBack);
  docsGrid.appendChild(selfie);
  docsWrap.appendChild(docsGrid);
  content.appendChild(docsWrap);

  // Remarks & actions
  const actions = h('div', 'pt-2 space-y-3');
  const toPending = h('button', 'px-4 py-2 rounded bg-gray-100 hover:bg-gray-200 text-sm', 'Mark Pending');
  const toReviewed = h('button', 'px-4 py-2 rounded bg-green-600 hover:bg-green-700 text-white text-sm', 'Mark Reviewed');
  const remarksBox = h('textarea', 'w-full border border-[var(--cane-200)] rounded-lg p-2 text-sm', []);
  remarksBox.placeholder = 'Add remarks for the applicant (optional)';
  const sendRemarksBtn = h('button', 'px-3 py-2 rounded bg-[var(--cane-100)] text-[var(--cane-800)] hover:bg-[var(--cane-200)] text-sm whitespace-nowrap', 'Send Remarks');
  sendRemarksBtn.addEventListener('click', async () => {
    const text = (remarksBox.value || '').trim();
    if (!text) { return; }
    try {
      // Save remark in a subcollection and stamp on the application for quick view
      await addDoc(collection(db, 'field_applications', app.id, 'remarks'), {
        message: text,
        createdAt: serverTimestamp()
      });
      await updateDoc(doc(db, 'field_applications', app.id), { latestRemark: text, latestRemarkAt: serverTimestamp() });
      // Also notify the applicant
      try {
        await addDoc(collection(db, 'notifications'), {
          userId: app.userId || app.applicantName,
          type: 'remark',
          title: 'New remarks from SRA',
          message: text,
          createdAt: serverTimestamp()
        });
      } catch(_) {}
      try {
        const notifications = JSON.parse(localStorage.getItem('notifications') || '{}');
        const userId = app.userId || app.applicantName;
        if (!notifications[userId]) notifications[userId] = [];
        notifications[userId].push({ type: 'remark', title: 'SRA Remarks', message: text, at: new Date().toISOString() });
        localStorage.setItem('notifications', JSON.stringify(notifications));
      } catch(_) {}
      // Lightweight toast
      sendRemarksBtn.textContent = 'Sent';
      sendRemarksBtn.className = 'px-3 py-2 rounded bg-green-100 text-green-700';
      setTimeout(()=>{ sendRemarksBtn.textContent = 'Send Remarks'; sendRemarksBtn.className = 'px-3 py-2 rounded bg-[var(--cane-100)] text-[var(--cane-800)] hover:bg-[var(--cane-200)] text-sm'; }, 1500);
    } catch(e) {
      // eslint-disable-next-line no-console
      console.error('Failed to send remarks', e);
      alert('Failed to send remarks. Please try again.');
    }
  });
  const remarksWrap = h('div', 'space-y-2');
  remarksWrap.appendChild(h('label', 'text-sm text-[var(--cane-700)]', 'Remarks (optional)'));
  const remarkRow = h('div', 'flex items-start gap-2');
  const remarksBoxWrap = h('div', 'flex-1');
  remarksBoxWrap.appendChild(remarksBox);
  remarkRow.appendChild(remarksBoxWrap);
  remarkRow.appendChild(sendRemarksBtn);
  remarksWrap.appendChild(remarkRow);
  actions.appendChild(remarksWrap);
  const buttonsRow = h('div', 'flex justify-end gap-2 pt-1');
  buttonsRow.appendChild(toPending);
  buttonsRow.appendChild(toReviewed);
  actions.appendChild(buttonsRow);

  content.appendChild(actions);
  card.appendChild(content);
  modal.appendChild(card);
  modal.classList.remove('hidden');
  modal.classList.add('flex');

  // Initialize map if we have coordinates
  try {
    if (typeof app.lat === 'number' && typeof app.lng === 'number' && !isNaN(app.lat) && !isNaN(app.lng)) {
      await ensureLeafletLoaded();
      const map = L.map(mapBox).setView([app.lat, app.lng], 14);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '© OpenStreetMap contributors' }).addTo(map);
      const caneIcon = L.icon({ iconUrl: '../img/PIN.png', iconSize: [32,32], iconAnchor: [16,30], popupAnchor: [0,-28] });
      L.marker([app.lat, app.lng], { icon: caneIcon }).addTo(map).bindPopup('Registered Field').openPopup();
      setTimeout(()=>{ map.invalidateSize(); }, 100);
    } else {
      mapBox.innerHTML = '<div class="w-full h-full flex items-center justify-center text-[var(--cane-700)] text-sm">No coordinates provided</div>';
    }
  } catch(_) {
    mapBox.innerHTML = '<div class="w-full h-full flex items-center justify-center text-[var(--cane-700)] text-sm">Map failed to load</div>';
  }

  // Wire status buttons
  toPending.addEventListener('click', async () => { await updateStatus(app.id, 'pending'); modal.classList.add('hidden'); });
  toReviewed.addEventListener('click', async () => { await updateStatus(app.id, 'reviewed'); modal.classList.add('hidden'); });
}

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

export const SRAReview = {
  async init() {
    const statusSelect = document.getElementById('fieldDocsStatus');
    if (statusSelect) {
      statusSelect.addEventListener('change', () => render(statusSelect.value));
    }
    await render('all');
  }
};

// expose for non-module invocation if needed
// eslint-disable-next-line no-undef
window.SRAReview = SRAReview;


