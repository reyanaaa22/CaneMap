// Handler dashboard: show only fields registered by this user
import { db } from '../Common/firebase-config.js';
import { collection, query, where, getDocs } from 'https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js';

async function renderUserFields() {
  const userId = localStorage.getItem('userId') || localStorage.getItem('farmerName') || '';
  const fieldsList = document.getElementById('fieldsList');
  if (!fieldsList) return;
  fieldsList.innerHTML = '';
  const q = query(collection(db, 'fields'), where('userId', '==', userId));
  const snap = await getDocs(q);
  if (snap.empty) {
    fieldsList.innerHTML = '<div class="p-3 rounded-lg border border-gray-200 bg-gray-50 text-gray-700">No registered fields yet.</div>';
    return;
  }
  snap.forEach(doc => {
    const f = doc.data();
    const item = document.createElement('div');
    item.className = 'p-4 mb-2 rounded-lg border border-green-200 bg-green-50';
    item.innerHTML = `<b>${f.barangay || 'Field'}</b> <span class='text-xs text-gray-600'>${f.size || ''} ha · ${f.terrain || ''}</span>`;
    fieldsList.appendChild(item);
  });
}

document.addEventListener('DOMContentLoaded', renderUserFields);