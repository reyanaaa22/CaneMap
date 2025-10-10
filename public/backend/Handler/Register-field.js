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

    // 🎥 Create live video
    const video = document.createElement("video");
    video.autoplay = true;
    video.playsInline = true;
    video.className =
      "rounded-lg shadow-md w-full max-h-[400px] object-contain bg-black";
    cameraDiv.appendChild(video);

    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode } });
      video.srcObject = stream;
    } catch (err) {
      alert("Camera access denied or not available.");
      return;
    }

    // 🎛️ Controls container
    const controls = document.createElement("div");
    controls.className = "flex gap-3 mt-3 justify-center";
    cameraDiv.appendChild(controls);

    // 📸 Capture button
    const snapBtn = document.createElement("button");
    snapBtn.textContent = "Capture";
    snapBtn.className =
      "px-4 py-2 bg-green-700 text-white rounded hover:bg-green-800 transition font-medium";
    controls.appendChild(snapBtn);

    // 🟢 Fullscreen button (lighter green)
    const fullBtn = document.createElement("button");
    fullBtn.textContent = "Fullscreen";
    fullBtn.className =
      "px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600 transition font-medium";
    controls.appendChild(fullBtn);

    // 📸 Function to capture and show image
    const capturePhoto = (srcVideo, closeOverlay = false) => {
      const canvas = document.createElement("canvas");
      canvas.width = srcVideo.videoWidth;
      canvas.height = srcVideo.videoHeight;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(srcVideo, 0, 0);
      const dataUrl = canvas.toDataURL("image/png");

      const inputEl = document.getElementById(inputId);
      if (inputEl) inputEl.value = dataUrl;

      // Clean UI
      cameraDiv.innerHTML = `<img src="${dataUrl}" class="rounded shadow mt-2 w-full max-w-sm mx-auto">`;

      // Stop the stream safely
      if (stream) stream.getTracks().forEach((t) => t.stop());

      // Remove overlay cleanly if capture from fullscreen
      if (closeOverlay && document.getElementById("cameraOverlay")) {
        document.getElementById("cameraOverlay").remove();
      }
    };

    // 🖼️ Capture button (normal)
    snapBtn.onclick = () => capturePhoto(video);

    // ⛶ Fullscreen overlay
    fullBtn.onclick = async () => {
      // Create overlay container
      const overlay = document.createElement("div");
      overlay.id = "cameraOverlay";
      overlay.className =
        "fixed inset-0 bg-black flex flex-col items-center justify-center z-50";
      document.body.appendChild(overlay);

      // Clone video feed (reuse stream)
      const fullVideo = document.createElement("video");
      fullVideo.autoplay = true;
      fullVideo.playsInline = true;
      fullVideo.srcObject = stream;
      fullVideo.className = "w-full h-full object-contain";
      overlay.appendChild(fullVideo);

      // 📸 Capture button (fullscreen)
      const fullCaptureBtn = document.createElement("button");
      fullCaptureBtn.textContent = "Capture";
      fullCaptureBtn.className =
        "absolute bottom-10 px-6 py-3 bg-green-600 text-white text-lg rounded-full shadow-lg hover:bg-green-700 transition";
      overlay.appendChild(fullCaptureBtn);

      // ❌ Exit icon button
      const exitBtn = document.createElement("button");
      exitBtn.innerHTML = "&times;"; // ✕ symbol
      exitBtn.className =
        "absolute top-5 right-6 text-white text-4xl font-light hover:scale-110 transition transform";
      overlay.appendChild(exitBtn);

      // 🟩 Capture photo while fullscreen
      fullCaptureBtn.onclick = () => {
        capturePhoto(fullVideo, true);
      };

      // ❌ Exit overlay
      exitBtn.onclick = () => {
        overlay.remove();
      };

      // ✅ Cleanup if user presses ESC
      document.addEventListener(
        "keydown",
        function escListener(e) {
          if (e.key === "Escape" && document.getElementById("cameraOverlay")) {
            overlay.remove();
            document.removeEventListener("keydown", escListener);
          }
        },
        { once: true }
      );
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

    const fieldName = form.querySelector("#field_name")?.value.trim() || "";
    const sugarVariety = form.querySelector("#sugarcane_variety")?.value.trim() || "";
    const barangay = form.querySelector("#barangay")?.value.trim() || "";
    const street = form.querySelector("#street")?.value.trim() || "";
    const size = form.querySelector("#field_size")?.value.trim() || "";
    const terrain = form.querySelector("#terrain_type")?.value.trim() || "";

    const lat = parseFloat(form.querySelector("#latitude")?.value || "0");
    const lng = parseFloat(form.querySelector("#longitude")?.value || "0");

    const validFront = form.querySelector("#valid_id_front")?.value || "";
    const validBack = form.querySelector("#valid_id_back")?.value || "";
    const selfie = form.querySelector("#selfie_with_id")?.value || "";

    // ✅ Include fieldName in the validation
    if (
      !fieldName ||
      !barangay ||
      !street ||
      !size ||
      !terrain ||
      !sugarVariety ||
      !lat ||
      !lng ||
      !validFront ||
      !validBack ||
      !selfie
    ) {
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

      const barangayNorm = barangay.toLowerCase();
      const streetNorm = street.toLowerCase();
      const sizeNorm = size.toLowerCase();
      const terrainNorm = terrain.toLowerCase();
      const sugarNorm = sugarVariety.toLowerCase();
      const fieldNameNorm = fieldName.toLowerCase();
      const latNorm = parseFloat(lat.toFixed(5));
      const lngNorm = parseFloat(lng.toFixed(5));

      // Query only docs with same barangay (fast + cheap)
      const q = query(fieldsRef, where("barangay", "==", barangay));
      const snap = await getDocs(q);

      let duplicateFound = false;

      snap.forEach((docSnap) => {
        const d = docSnap.data();
        const fName = (d.field_name || "").trim().toLowerCase();
        const st = (d.street || "").trim().toLowerCase();
        const s = (d.field_size || "").trim().toLowerCase();
        const t = (d.terrain_type || "").trim().toLowerCase();
        const v = (d.sugarcane_variety || "").trim().toLowerCase();
        const lt = parseFloat((d.latitude || 0).toFixed(5));
        const lg = parseFloat((d.longitude || 0).toFixed(5));

        if (
          fName === fieldNameNorm &&
          st === streetNorm &&
          s === sizeNorm &&
          t === terrainNorm &&
          v === sugarNorm &&
          lt === latNorm &&
          lg === lngNorm
        ) {
          duplicateFound = true;
        }
      });

      if (duplicateFound) {
        alert(
          "⚠️ You already registered this field with the same field name, barangay, street, field size, terrain type, variety, and coordinates."
        );
        submitBtn.disabled = false;
        submitBtn.textContent = "Submit Field Registration";
        submitBtn.classList.remove("opacity-50");
        return;
      }

      // Upload images
      async function uploadBase64(base64, name) {
        if (!base64.startsWith("data:image")) return "";
        const refPath = sref(
          storage,
          `field_applications/${currentUser.uid}/${name}_${Date.now()}.png`
        );
        await uploadString(refPath, base64, "data_url");
        return await getDownloadURL(refPath);
      }

      const frontURL = await uploadBase64(validFront, "valid_front");
      const backURL = await uploadBase64(validBack, "valid_back");
      const selfieURL = await uploadBase64(selfie, "selfie");

      // ✅ Clean, ordered, no "_lower" version
      const payload = {
        field_name: fieldName,
        barangay,
        street,
        sugarcane_variety: sugarVariety,
        terrain_type: terrain,
        field_size: size,
        latitude: lat,
        longitude: lng,
        status: "pending",
        requestedBy: currentUser.uid,
        submittedAt: serverTimestamp(),
        validBackUrl: backURL,
        validFrontUrl: frontURL,
        selfieUrl: selfieURL,
      };

      const userFieldsRef = collection(
        db,
        "field_applications",
        currentUser.uid,
        "fields"
      );
      await addDoc(userFieldsRef, payload);

      alert("✅ Field registration submitted successfully! Your request will be reviewed by the SRA within 5–10 working days.");
        window.location.href = "../Common/lobby.html";


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

// -------------------------------------------------------------
// Unified Terms & Privacy Modal (Professional Slim Version)
// -------------------------------------------------------------
document.addEventListener("DOMContentLoaded", () => {
  const modal = document.getElementById("legalModal");
  const overlay = document.getElementById("legalOverlay");
  const content = document.getElementById("legalContent");
  const closeBtn = document.getElementById("closeLegal");
  const acceptBtn = document.getElementById("legalAccept");
  const openTerms = document.getElementById("openTerms");
  const openPrivacy = document.getElementById("openPrivacy");
  const agreeCheckbox = document.getElementById("agree");

  // Full combined Terms + Privacy text (professional + complete)
  const html = `
  <article id="terms" class="space-y-3">
    <h3 class="text-lg font-bold text-[var(--cane-800)]">TERMS AND CONDITIONS</h3>
    <p>CaneMap is an official digital system for sugarcane field registration and monitoring. By registering, you acknowledge and agree to the policies outlined below.</p>

    <h4 class="font-semibold">1. Purpose</h4>
    <p>This service allows landowners and handlers to register their sugarcane fields for SRA validation, including land location, area, terrain, and supporting documents.</p>

    <h4 class="font-semibold">2. User Obligations</h4>
    <p>Users must provide accurate information and valid supporting documents (barangay certificate, land title, or equivalent). Submitting false or misleading data may result in account suspension or legal action.</p>

    <h4 class="font-semibold">3. Submitted Data</h4>
    <p>All fields submitted, including coordinates, uploaded documents, and captured images (front ID, back ID, selfie with ID), are used solely for official verification and mapping under the Sugar Regulatory Administration (SRA).</p>

    <h4 class="font-semibold">4. System Use</h4>
    <p>Users shall not misuse, duplicate, or modify CaneMap systems. Unauthorized access or tampering is prohibited under Republic Act No. 10173 (Data Privacy Act) and RA 8792 (E-Commerce Act).</p>

    <h4 class="font-semibold">5. Verification & Approval</h4>
    <p>Submissions will be validated by SRA or designated mill district officers. The review may include land inspection, GPS validation, and documentation checks. Approval timelines may vary based on completeness.</p>

    <h4 class="font-semibold">6. Limitation of Liability</h4>
    <p>CaneMap and its developers act as facilitators of submission. The platform is provided “as is” without warranty. CaneMap is not liable for losses due to user error, rejected submissions, or connectivity issues.</p>

    <h4 class="font-semibold">7. Amendments</h4>
    <p>Terms may be updated periodically to comply with new regulations. Updates will be posted in the app or portal. Continued use signifies acceptance.</p>
  </article>

  <hr class="my-4 border-gray-300/70">

  <article id="privacy" class="space-y-3">
    <h3 class="text-lg font-bold text-[var(--cane-800)]">PRIVACY POLICY</h3>
    <p>CaneMap values and protects your privacy in accordance with the Data Privacy Act of 2012 and related SRA policies.</p>

    <h4 class="font-semibold">1. Information Collected</h4>
    <p>We collect: your name, email, contact info, field details (name, barangay, city, coordinates, terrain type, variety, field size), and identity verification photos (ID and selfie). All are stored securely via Firebase services.</p>

    <h4 class="font-semibold">2. Purpose of Processing</h4>
    <p>Data is used to verify land ownership, map sugarcane areas, and enable SRA monitoring, auditing, and program qualification.</p>

    <h4 class="font-semibold">3. Storage & Retention</h4>
    <p>Your data is stored in Google Firebase Firestore and Firebase Storage under the path <code>field_applications/{userUid}/</code>. Retention follows SRA’s audit policy and may last until the registration cycle ends or is deleted upon request.</p>

    <h4 class="font-semibold">4. Sharing & Disclosure</h4>
    <p>We share data only with: (a) SRA officials and mill district staff, (b) relevant government agencies for lawful audits, or (c) law enforcement when required. No data is sold or monetized.</p>

    <h4 class="font-semibold">5. Data Protection</h4>
    <p>We apply strict access controls, encrypted transmission (HTTPS), Firebase Authentication, and server security. However, no system is immune from risk; users should ensure safe device use.</p>

    <h4 class="font-semibold">6. User Rights</h4>
    <p>Under the Data Privacy Act, you may request data correction, access, or deletion. Submit requests to <code>support@canemap.ph</code> with your registered email and field ID for verification.</p>

    <h4 class="font-semibold">7. Policy Updates</h4>
    <p>CaneMap may revise this Privacy Policy to reflect operational, legal, or regulatory changes. Notifications will be provided through the app or official announcements.</p>

    <h4 class="font-semibold">8. Contact</h4>
    <p>For questions or concerns, contact your nearest SRA regional office or CaneMap Support at <code>support@canemap.ph</code>.</p>
  </article>

  <p class="text-xs text-gray-500 mt-4">Last updated ${new Date().toLocaleDateString()}</p>
  `;

  // Inject text once
  content.innerHTML = html;

  function openModal(scrollToId) {
    modal.classList.remove("hidden");
    modal.classList.add("opacity-100");
    document.body.style.overflow = "hidden";

    setTimeout(() => {
      const target = document.getElementById(scrollToId);
      if (target) target.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 100);
  }

  function closeModal() {
    modal.classList.add("hidden");
    document.body.style.overflow = "";
  }

  openTerms?.addEventListener("click", () => openModal("terms"));
  openPrivacy?.addEventListener("click", () => openModal("privacy"));
  overlay?.addEventListener("click", closeModal);
  closeBtn?.addEventListener("click", closeModal);
  acceptBtn?.addEventListener("click", () => {
    closeModal();
    if (agreeCheckbox) agreeCheckbox.checked = true;
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !modal.classList.contains("hidden")) closeModal();
  });
});
