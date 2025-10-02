// Simple camera setup used by Register-field.html
(function(){
  // Cancel button handler (delegated in HTML via anchor)
  const cancelLink = document.querySelector('a[href="../Common/lobby.html"]');
  if (cancelLink) {
    cancelLink.addEventListener('click', function(){
      // nothing extra needed; just navigate
    });
  }

  // Persist submission to Firestore
  import('../Common/firebase-config.js').then(async ({ db }) => {
    const { addDoc, collection, serverTimestamp } = await import('https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js');

    const form = document.querySelector('form');
    if (!form) return;
    form.addEventListener('submit', async function(e){
      e.preventDefault();
      try {
        const barangay = (document.getElementById('barangay')||{}).value || '';
        const size = (document.getElementById('field_size')||{}).value || '';
        const terrain = (document.getElementById('crop_variety')||{}).value || '';
        const lat = parseFloat((document.getElementById('latitude')||{}).value || '0');
        const lng = parseFloat((document.getElementById('longitude')||{}).value || '0');
        const userId = localStorage.getItem('userId') || '';
        const payload = {
          applicantName: localStorage.getItem('farmerName') || 'Handler',
          userId,
          barangay, size, terrain, lat, lng,
          status: 'pending',
          createdAt: serverTimestamp()
        };
        await addDoc(collection(db, 'field_applications'), payload);
        // Custom confirmation popup
        const popup = document.createElement('div');
        popup.className = 'fixed inset-0 bg-black/40 flex items-center justify-center z-50';
        popup.innerHTML = `<div class='bg-white rounded-xl p-6 shadow-xl text-center max-w-sm mx-auto'><h2 class='text-xl font-bold mb-2 text-green-700'>Field Submitted!</h2><p class='mb-4 text-gray-700'>Your field registration has been sent for review. You will be notified once it is approved by the SRA Officer.</p><button id='closePopupBtn' class='px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700'>OK</button></div>`;
        document.body.appendChild(popup);
        document.getElementById('closePopupBtn').onclick = function(){ popup.remove(); window.location.href = '../Common/lobby.html'; };
      } catch(e) {
        const errPopup = document.createElement('div');
        errPopup.className = 'fixed inset-0 bg-black/40 flex items-center justify-center z-50';
        errPopup.innerHTML = `<div class='bg-white rounded-xl p-6 shadow-xl text-center max-w-sm mx-auto'><h2 class='text-xl font-bold mb-2 text-red-700'>Submission Failed</h2><p class='mb-4 text-gray-700'>There was an error submitting your field. Please try again.<br><span class='text-xs text-red-500'>${e.message || e}</span></p><button id='closeErrPopupBtn' class='px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700'>Close</button></div>`;
        document.body.appendChild(errPopup);
        document.getElementById('closeErrPopupBtn').onclick = function(){ errPopup.remove(); };
        // eslint-disable-next-line no-console
        console.error('Failed to submit to Firestore', e);
      }
    });
  }).catch(()=>{});

  function setupCamera(buttonId, cameraDivId, inputId, facingMode = 'environment'){
    const button = document.getElementById(buttonId);
    const cameraDiv = document.getElementById(cameraDivId);
    if (!button || !cameraDiv) return;
    button.addEventListener('click', async function(){
      cameraDiv.innerHTML = '';
      const video = document.createElement('video');
      video.autoplay = true; video.playsInline = true; video.width = 320; video.height = 240;
      cameraDiv.appendChild(video);
      let stream;
      try{
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode } });
        video.srcObject = stream;
      }catch(err){
        alert('Camera access denied or not available.');
        return;
      }
      const snapBtn = document.createElement('button');
      snapBtn.textContent = 'Capture';
      snapBtn.className = 'px-3 py-1 bg-[var(--cane-700)] text-white rounded hover:bg-[var(--cane-800)] mt-2';
      cameraDiv.appendChild(snapBtn);
      snapBtn.onclick = function(){
        const canvas = document.createElement('canvas');
        canvas.width = video.videoWidth; canvas.height = video.videoHeight;
        canvas.getContext('2d').drawImage(video, 0, 0);
        const dataUrl = canvas.toDataURL('image/png');
        const inputEl = document.getElementById(inputId);
        if (inputEl) inputEl.value = dataUrl;
        cameraDiv.innerHTML = '<img src="'+dataUrl+'" class="rounded shadow mt-2" width="160">';
        if (stream) stream.getTracks().forEach(t=>t.stop());
      };
    });
  }
  setupCamera('takePhotoFront','camera-front','valid_id_front','environment');
  setupCamera('takePhotoBack','camera-back','valid_id_back','environment');
  setupCamera('takePhotoSelfie','camera-selfie','selfie_with_id','user');
})();
