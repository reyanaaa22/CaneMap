import { collection, addDoc, query, where, getDocs } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js";
import { auth, db } from "../Common/firebase-config.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-auth.js";
import {
  doc,
  setDoc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js";
import {
  getStorage,
  ref as sref,
  uploadString,
  getDownloadURL
} from "https://www.gstatic.com/firebasejs/12.1.0/firebase-storage.js";

console.log("Register-field.js loaded ✅");

// ----------------------------
// 📸 CAMERA CAPTURE LOGIC
// ----------------------------
function setupCamera(buttonId, cameraDivId, inputId, facingMode = "environment") {
  const button = document.getElementById(buttonId);
  const cameraDiv = document.getElementById(cameraDivId);
  if (!button || !cameraDiv) return;

  button.addEventListener("click", async () => {
    cameraDiv.innerHTML = "";
    const video = document.createElement("video");
    video.autoplay = true;
    video.playsInline = true;
    video.width = 320;
    video.height = 240;
    cameraDiv.appendChild(video);

    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode } });
      video.srcObject = stream;
    } catch (err) {
      alert("Camera access denied or not available.");
      return;
    }

    const snapBtn = document.createElement("button");
    snapBtn.textContent = "Capture";
    snapBtn.className =
      "px-3 py-1 bg-green-700 text-white rounded hover:bg-green-800 mt-2";
    cameraDiv.appendChild(snapBtn);

    snapBtn.onclick = function () {
      const canvas = document.createElement("canvas");
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      canvas.getContext("2d").drawImage(video, 0, 0);
      const dataUrl = canvas.toDataURL("image/png");

      const inputEl = document.getElementById(inputId);
      if (inputEl) inputEl.value = dataUrl;

      cameraDiv.innerHTML = `<img src="${dataUrl}" class="rounded shadow mt-2" width="160">`;
      if (stream) stream.getTracks().forEach((t) => t.stop());
    };
  });
}

// Initialize all cameras
setupCamera("takePhotoFront", "camera-front", "valid_id_front", "environment");
setupCamera("takePhotoBack", "camera-back", "valid_id_back", "environment");
setupCamera("takePhotoSelfie", "camera-selfie", "selfie_with_id", "user");

// ----------------------------
// 📂 FIELD FORM SUBMISSION
// ----------------------------
document.addEventListener("DOMContentLoaded", () => {
  const form = document.querySelector("form");
  if (!form) return;

  const storage = getStorage();
  let currentUser = null;

  onAuthStateChanged(auth, (user) => (currentUser = user));

  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    if (!currentUser) {
      alert("Please login first before registering a field.");
      return;
    }

    const barangay = form.querySelector("#barangay")?.value.trim() || "";
    const size = form.querySelector("#field_size")?.value.trim() || "";
    const variety = form.querySelector("#crop_variety")?.value.trim() || "";
    const lat = parseFloat(form.querySelector("#latitude")?.value || "0");
    const lng = parseFloat(form.querySelector("#longitude")?.value || "0");

    const validFront = form.querySelector("#valid_id_front")?.value || "";
    const validBack = form.querySelector("#valid_id_back")?.value || "";
    const selfie = form.querySelector("#selfie_with_id")?.value || "";

    if (!barangay || !size || !variety || !lat || !lng || !validFront || !validBack || !selfie) {
      alert("Please fill out all fields and capture all required photos.");
      return;
    }

    const submitBtn = form.querySelector('button[type="submit"]');
    submitBtn.disabled = true;
    submitBtn.textContent = "Submitting...";
    submitBtn.classList.add("opacity-50");

    try {
      // 🧩 Duplicate field check – stronger version
      const fieldsRef = collection(db, "field_applications", currentUser.uid, "fields");

      const barangayNorm = barangay.trim().toLowerCase();
      const sizeNorm = size.trim().toLowerCase();
      const varietyNorm = variety.trim().toLowerCase();
      const latNorm = parseFloat(lat.toFixed(5));
      const lngNorm = parseFloat(lng.toFixed(5));

      // Query only docs with same barangay (fast + cheap)
      const q = query(fieldsRef, where("barangay_lower", "==", barangayNorm));
      const snap = await getDocs(q);

      let duplicateFound = false;

      snap.forEach((docSnap) => {
        const d = docSnap.data();
        const s = (d.field_size_lower || d.field_size || "").trim().toLowerCase();
        const v = (d.crop_variety_lower || d.crop_variety || "").trim().toLowerCase();
        const lt = parseFloat((d.latitude || 0).toFixed(5));
        const lg = parseFloat((d.longitude || 0).toFixed(5));

        if (s === sizeNorm && v === varietyNorm && lt === latNorm && lg === lngNorm) {
          duplicateFound = true;
        }
      });

      if (duplicateFound) {
        alert("⚠️ You already registered this field with the same barangay, field size, crop variety, and coordinates.");
        submitBtn.disabled = false;
        submitBtn.textContent = "Submit Field Registration";
        submitBtn.classList.remove("opacity-50");
        return;
      }

      // Upload images
      async function uploadBase64(base64, name) {
        if (!base64.startsWith("data:image")) return "";
        const refPath = sref(storage, `field_applications/${currentUser.uid}/${name}_${Date.now()}.png`);
        await uploadString(refPath, base64, "data_url");
        return await getDownloadURL(refPath);
      }

      const frontURL = await uploadBase64(validFront, "valid_front");
      const backURL = await uploadBase64(validBack, "valid_back");
      const selfieURL = await uploadBase64(selfie, "selfie");

      const payload = {
        fieldName: `${barangay}_${Date.now()}`,
        barangay,
        barangay_lower: barangay.trim().toLowerCase(),
        field_size: size,
        field_size_lower: size.trim().toLowerCase(),
        crop_variety: variety,
        crop_variety_lower: variety.trim().toLowerCase(),
        latitude: lat,
        longitude: lng,
        validFrontUrl: frontURL,
        validBackUrl: backURL,
        selfieUrl: selfieURL,
        status: "pending",
        submittedAt: serverTimestamp(),
        requestedBy: currentUser.uid
      };

      const userFieldsRef = collection(db, "field_applications", currentUser.uid, "fields");
      await addDoc(userFieldsRef, payload);

      alert(
        "✅ Your field registration has been submitted!\n\n" +
        "Your field registration will be reviewed by the Sugar Regulatory Administration (SRA).\n\n" +
        "Status:\nSubmitted – Awaiting SRA Review (5–10 days)."
      );

      form.reset();
    } catch (err) {
      console.error("❌ Field registration error:", err);
      alert("Error submitting field registration: " + (err.message || err));
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = "Submit Field Registration";
      submitBtn.classList.remove("opacity-50");
    }
  });
});
