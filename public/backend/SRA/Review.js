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
  let q = query(baseRef, orderBy('createdAt', 'desc'));
  if (status !== 'all') {
    q = query(baseRef, where('status', '==', status), orderBy('createdAt', 'desc'));
  }
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
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

  const row = h('div', 'flex items-start justify-between px-4 py-3');
  row.appendChild(left);

  const actions = h('div', 'flex items-center space-x-2');
  const viewBtn = h('button', 'px-3 py-1 rounded bg-white border border-[var(--cane-200)] text-[var(--cane-800)] text-xs hover:bg-[var(--cane-50)]', 'View');
  const pendBtn = h('button', 'px-3 py-1 rounded bg-gray-100 text-gray-700 text-xs hover:bg-gray-200', 'Pending');
  const revBtn = h('button', 'px-3 py-1 rounded bg-green-100 text-green-700 text-xs hover:bg-green-200', 'Reviewed');
  actions.append(statusBadge, viewBtn, pendBtn, revBtn);
  row.appendChild(actions);

  viewBtn.addEventListener('click', () => openModal(app));
  pendBtn.addEventListener('click', () => updateStatus(app.id, 'pending'));
  revBtn.addEventListener('click', () => updateStatus(app.id, 'reviewed'));

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
    await render();
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

function openModal(app) {
  let modal = document.getElementById('sraReviewModal');
  if (!modal) {
    modal = document.body.appendChild(h('div', 'fixed inset-0 bg-black/40 hidden items-center justify-center z-50', []));
    modal.id = 'sraReviewModal';
  }
  modal.innerHTML = '';
  const card = h('div', 'bg-white rounded-xl w-[92%] max-w-2xl p-6 shadow-2xl relative space-y-4');
  const close = h('button', 'absolute top-3 right-4 text-xl', '×');
  close.addEventListener('click', () => { modal.classList.add('hidden'); });
  card.appendChild(close);
  card.appendChild(h('h3', 'text-xl font-semibold', 'Field Application'));
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
  for (const [k, v] of info) {
    grid.appendChild(h('div', 'text-sm', [h('div', 'text-gray-500', k), h('div', 'font-medium', v)]));
  }
  card.appendChild(grid);
  const actions = h('div', 'pt-2 flex justify-end space-x-2');
  const toPending = h('button', 'px-4 py-2 rounded bg-gray-100 hover:bg-gray-200 text-sm', 'Mark Pending');
  const toReviewed = h('button', 'px-4 py-2 rounded bg-green-600 hover:bg-green-700 text-white text-sm', 'Mark Reviewed');
  // Remarks UI
  const remarksBox = h('textarea', 'w-full border border-[var(--cane-200)] rounded-lg p-2 text-sm', []);
  remarksBox.placeholder = 'Add remarks for the applicant (optional)';
  const sendRemarksBtn = h('button', 'px-3 py-2 rounded bg-[var(--cane-100)] text-[var(--cane-800)] hover:bg-[var(--cane-200)] text-sm', 'Send Remarks');
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
  const remarksWrap = h('div', 'space-y-2', [h('label', 'text-sm text-[var(--cane-700)]', 'Remarks (optional)'), remarksBox, sendRemarksBtn]);
  card.appendChild(remarksWrap);
  toPending.addEventListener('click', async () => { await updateStatus(app.id, 'pending'); modal.classList.add('hidden'); });
  toReviewed.addEventListener('click', async () => { await updateStatus(app.id, 'reviewed'); modal.classList.add('hidden'); });
  actions.append(toPending, toReviewed);
  card.appendChild(actions);
  modal.appendChild(card);
  modal.classList.remove('hidden');
  modal.classList.add('flex');
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


