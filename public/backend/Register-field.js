import { signInWithEmailAndPassword } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-auth.js";
import { doc, getDoc, setDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js";
import { auth, db } from "../backend/firebase-config.js";

// Initialize map for location selection
const locationMap = L.map('locationMap').setView([14.5995, 120.9842], 10);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© OpenStreetMap contributors'
}).addTo(locationMap);

let locationMarker = null;
locationMap.on('click', function(e) {
    const lat = e.latlng.lat;
    const lng = e.latlng.lng;
    if (locationMarker) locationMap.removeLayer(locationMarker);
    locationMarker = L.marker([lat, lng]).addTo(locationMap);
    document.getElementById('latitude').value = lat.toFixed(6);
    document.getElementById('longitude').value = lng.toFixed(6);
});

// Form validation
document.querySelector('form').addEventListener('submit', function(e) {
    const latitude = document.getElementById('latitude').value;
    const longitude = document.getElementById('longitude').value;
    if (!latitude || !longitude) {
        e.preventDefault();
        alert('Please select a location on the map.');
        return false;
    }
});

// Setup camera
function setupCamera(buttonId, cameraDivId, inputId, facingMode = "environment") {
    const button = document.getElementById(buttonId);
    const cameraDiv = document.getElementById(cameraDivId);
    button.addEventListener('click', async function() {
        cameraDiv.innerHTML = '';
        const video = document.createElement('video');
        video.autoplay = true;
        video.playsInline = true;
        video.width = 320;
        video.height = 240;
        cameraDiv.appendChild(video);
        let stream;
        try {
            stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: facingMode } });
            video.srcObject = stream;
        } catch (err) {
            alert('Camera access denied or not available.');
            return;
        }
        const snapBtn = document.createElement('button');
        snapBtn.textContent = 'Capture';
        snapBtn.className = 'px-3 py-1 bg-[var(--cane-700)] text-white rounded hover:bg-[var(--cane-800)] mt-2';
        cameraDiv.appendChild(snapBtn);
        snapBtn.onclick = function() {
            const canvas = document.createElement('canvas');
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
            canvas.getContext('2d').drawImage(video, 0, 0);
            const dataUrl = canvas.toDataURL('image/png');
            document.getElementById(inputId).value = dataUrl;
            cameraDiv.innerHTML = '<img src="' + dataUrl + '" class="rounded shadow mt-2" width="160">';
            stream.getTracks().forEach(track => track.stop());
        };
    });
}

setupCamera('takePhotoFront', 'camera-front', 'valid_id_front', 'environment');
setupCamera('takePhotoBack', 'camera-back', 'valid_id_back', 'environment');
setupCamera('takePhotoSelfie', 'camera-selfie', 'selfie_with_id', 'user');

// ==========================
// Ormoc City & Barangay Setup
// ==========================

// Add readonly city input
const cityInput = document.createElement('input');
cityInput.type = 'text';
cityInput.id = 'city';
cityInput.name = 'city';
cityInput.value = 'Ormoc City';
cityInput.readOnly = true;
cityInput.className = 'border px-2 py-1 rounded w-full mb-2';
document.querySelector('form').prepend(cityInput);

// Add barangay select input with white background and black text
const brgyLabel = document.createElement('label');
brgyLabel.textContent = 'Barangay *';
brgyLabel.className = 'block text-sm font-medium text-gray-700 mb-1';
document.querySelector('form').prepend(brgyLabel);

const brgySelect = document.createElement('select');
brgySelect.id = 'barangay';
brgySelect.name = 'barangay';
brgySelect.className = 'border px-3 py-2 rounded-md w-full mb-4 focus:ring-2 focus:ring-cane-green';
brgySelect.style.backgroundColor = 'white';
brgySelect.style.color = 'black';
barangays.forEach(brgy => {
    const option = document.createElement('option');
    option.value = brgy;
    option.textContent = brgy;
    brgySelect.appendChild(option);
});
document.querySelector('form').prepend(brgySelect);

// Make barangay dropdown searchable
brgySelect.addEventListener('focus', () => {
    brgySelect.setAttribute('size', Math.min(barangays.length, 10)); // show max 10 options, scrollable
});
brgySelect.addEventListener('blur', () => {
    brgySelect.setAttribute('size', 1);
});
