// Simple camera setup used by Register-field.html
(function(){
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
