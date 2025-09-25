// Handles Add User modal variations for Farmers vs SRA Officers
// Splits logic out of dashboard.html

import { db } from '../Common/firebase-config.js';
import { addDoc, collection, serverTimestamp } from 'https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js';

function generateTempPassword(){
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789@#$%';
  let out = '';
  for (let i=0;i<10;i++) out += chars[Math.floor(Math.random()*chars.length)];
  return out;
}

export function openAddFarmerModal(){
  if (!document.getElementById('addUserModal')) return;
  window.openAddUserModal();
  const roleSel = document.getElementById('userRole');
  if (roleSel) roleSel.value = 'farmer';
  // Hide SRA-specific rows
  toggleSRAFields(false);
}

export function openAddSRAModal(){
  if (!document.getElementById('addUserModal')) return;
  window.openAddUserModal();
  const roleSel = document.getElementById('userRole');
  if (roleSel) roleSel.value = 'sra';
  toggleSRAFields(true);
  const pw = document.getElementById('userTempPassword');
  if (pw && !pw.value) pw.value = generateTempPassword();

  // Wire success popup + save
  const form = document.getElementById('addUserForm');
  if (form && !form.dataset.sraWired){
    form.dataset.sraWired = '1';
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const name = (document.getElementById('userName')||{}).value || '';
      const email = (document.getElementById('userEmail')||{}).value || '';
      const temp = (document.getElementById('userTempPassword')||{}).value || generateTempPassword();
      const status = (document.querySelector('input[name="userStatus"]:checked')||{}).value || 'active';

      // Show preview popup
      await showSRASuccessPopup({ name, email, temp });

      // Save to Firestore
      try{
        await addDoc(collection(db,'users'), {
          name, email, role: 'sra', status,
          forcePasswordChange: true,
          createdAt: serverTimestamp(),
        });
        await addDoc(collection(db,'temp_passwords'), { email, tempPassword: temp, role: 'sra', createdAt: serverTimestamp() });
        // Optionally add notification entry
        await addDoc(collection(db,'notifications'), { 
          title: `Admin Officer account created for ${name || email}`,
          createdAt: serverTimestamp()
        });
        // Queue email (to be delivered by a backend/Cloud Function)
        const link = window.location.origin + '/frontend/Common/farmers_login.html';
        await addDoc(collection(db,'email_queue'), {
          to: email,
          subject: 'Your CaneMap SRA Officer Account',
          html: `Hello ${name || email},<br/>Your account has been created.<br/><br/>Username: ${email}<br/>Temporary Password: ${temp}<br/><br/>Please log in at <a href="${link}">${link}</a> and change your password immediately.`,
          createdAt: serverTimestamp(),
          status: 'queued'
        });
        window.closeAddUserModal();
        if (window.fetchAndRenderSRA) window.fetchAndRenderSRA();
      }catch(err){
        // eslint-disable-next-line no-console
        console.error(err);
        alert('Failed to save SRA Officer');
      }
    });
  }
}

function toggleSRAFields(show){
  ['tempPasswordRow','statusRow','forceChangeRow'].forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    el.style.display = show ? '' : 'none';
  });
}

// Hook generators
export function wireGenerators(){
  const genBtn = document.getElementById('genUserTempPassword');
  const pw = document.getElementById('userTempPassword');
  if (genBtn && pw){
    genBtn.addEventListener('click', () => { pw.value = generateTempPassword(); });
  }
}

// Optional: override submit to inject temp password storage
export function wireSubmitAugment(){
  const form = document.getElementById('addUserForm');
  if (!form) return;
  form.addEventListener('submit', async () => {
    try{
      const email = (document.getElementById('userEmail')||{}).value || '';
      const role = (document.getElementById('userRole')||{}).value || '';
      const temp = (document.getElementById('userTempPassword')||{}).value || '';
      if (role === 'sra' && email && temp){
        await addDoc(collection(db,'temp_passwords'), {
          email, tempPassword: temp, role, createdAt: serverTimestamp()
        });
      }
    }catch(_){}
  }, { once: true });
}

// Expose to window for inline usage
// eslint-disable-next-line no-undef
window.openAddFarmerModal = openAddFarmerModal;
// eslint-disable-next-line no-undef
window.openAddSRAModal = openAddSRAModal;
// eslint-disable-next-line no-undef
window.wireAddUserModal = () => { wireGenerators(); wireSubmitAugment(); };

async function showSRASuccessPopup({ name, email, temp }){
  return new Promise((resolve) => {
    let modal = document.getElementById('sraAccountPopup');
    if (!modal){
      modal = document.createElement('div');
      modal.id = 'sraAccountPopup';
      modal.className = 'fixed inset-0 bg-black/40 hidden items-center justify-center z-50';
      document.body.appendChild(modal);
    }
    modal.innerHTML = '';
    const card = document.createElement('div');
    card.className = 'bg-white rounded-2xl w-[92%] max-w-xl p-6 shadow-2xl relative space-y-3';
    const close = document.createElement('button');
    close.className = 'absolute top-3 right-4 text-xl';
    close.textContent = '×';
    close.onclick = () => { modal.classList.add('hidden'); resolve(); };
    const title = document.createElement('h3');
    title.className = 'text-xl font-semibold';
    title.textContent = 'Admin Officer Account Created';
    const body = document.createElement('div');
    body.className = 'text-sm text-gray-700 space-y-2';
    const link = window.location.origin + '/frontend/Common/farmers_login.html';
    body.innerHTML = `
      <p>The system will send the following notification email to the officer:</p>
      <div class="bg-gray-50 border rounded p-3">
        <p><strong>Subject:</strong> Your CaneMap SRA Officer Account</p>
        <p><strong>To:</strong> ${email}</p>
        <hr class="my-2"/>
        <p>Hello ${name || email},</p>
        <p>Your account has been created.</p>
        <p>Username: ${email}</p>
        <p>Temporary Password: ${temp}</p>
        <p>Please log in at ${link} and change your password immediately.</p>
      </div>
    `;
    const footer = document.createElement('div');
    footer.className = 'pt-2 text-right';
    const ok = document.createElement('button');
    ok.className = 'px-5 py-2 rounded-lg bg-[var(--cane-600)] hover:bg-[var(--cane-700)] text-white';
    ok.textContent = 'Close';
    ok.onclick = () => { modal.classList.add('hidden'); resolve(); };
    card.appendChild(close); card.appendChild(title); card.appendChild(body); footer.appendChild(ok); card.appendChild(footer); modal.appendChild(card);
    modal.classList.remove('hidden'); modal.classList.add('flex');
  });
}


