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

// ---------------------------------------------
// 🧾 Barangay Certificate & Land Title Upload Fix
// ---------------------------------------------
function setupDocUpload(fileInputId, base64InputId, nameDisplayId) {
  const fileInput = document.getElementById(fileInputId);
  const base64Holder = document.getElementById(base64InputId);
  const nameDisplay = document.getElementById(nameDisplayId);

  if (!fileInput) return;

  fileInput.addEventListener("change", () => {
    const file = fileInput.files[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      alert("File too large. Max 5MB allowed.");
      fileInput.value = "";
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      base64Holder.value = e.target.result;
      if (nameDisplay) nameDisplay.textContent = file.name;
    };
    reader.readAsDataURL(file);
  });
}

// ✅ Attach handlers for Barangay Certificate & Land Title
setupDocUpload("barangay_certification", "barangay_certification_base64", "barangay_certification_name");
setupDocUpload("land_title", "land_title_base64", "land_title_name");

// ----------------------------
// 📸 CAMERA CAPTURE + FILE UPLOAD (Unified)
// ----------------------------
function setupCameraAndUpload(config) {
  const { takeBtnId, fileInputId, base64Id, nameDisplayId, facingMode = "environment" } = config;

  const takeBtn = document.getElementById(takeBtnId);
  const fileInput = document.getElementById(fileInputId);
  const base64Holder = document.getElementById(base64Id);
  const nameDisplay = document.getElementById(nameDisplayId);

  if (!takeBtn || !fileInput || !base64Holder) return;

  // 🟢 Take Live Photo
  takeBtn.addEventListener("click", async () => {
    const cameraDiv = document.createElement("div");
    cameraDiv.className = "fixed inset-0 bg-black/90 flex flex-col items-center justify-center z-50";
    document.body.appendChild(cameraDiv);

    const video = document.createElement("video");
    video.autoplay = true;
    video.playsInline = true;
    video.className = "w-full h-full object-contain";
    cameraDiv.appendChild(video);

    const controls = document.createElement("div");
    controls.className = "absolute bottom-10 flex gap-4";
    cameraDiv.appendChild(controls);

    const captureBtn = document.createElement("button");
    captureBtn.textContent = "Capture";
    captureBtn.className =
      "px-6 py-3 bg-green-600 text-white rounded-full font-semibold hover:bg-green-700 transition";
    controls.appendChild(captureBtn);

    const cancelBtn = document.createElement("button");
    cancelBtn.textContent = "Cancel";
    cancelBtn.className =
      "px-6 py-3 bg-gray-500 text-white rounded-full font-semibold hover:bg-gray-600 transition";
    controls.appendChild(cancelBtn);

    // Start camera
    let stream = null;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode } });
      video.srcObject = stream;
    } catch (err) {
      alert("Camera not accessible. Please allow camera permission or upload a file instead.");
      cameraDiv.remove();
      return;
    }

    // Capture image
    captureBtn.onclick = () => {
      const canvas = document.createElement("canvas");
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(video, 0, 0);
      const dataUrl = canvas.toDataURL("image/png");

      // Save dataURL
      base64Holder.value = dataUrl;

      // Display filename only
      const fileName = `${takeBtnId}_${Date.now()}.png`;
      if (nameDisplay) nameDisplay.textContent = fileName;

      // Stop camera and close
      stream.getTracks().forEach((t) => t.stop());
      cameraDiv.remove();

      // Reset file input (so the camera photo is the one that counts)
      fileInput.value = "";
    };

    // Cancel camera
    cancelBtn.onclick = () => {
      if (stream) stream.getTracks().forEach((t) => t.stop());
      cameraDiv.remove();
    };
  });

  // 🖼️ Upload File
  fileInput.addEventListener("change", () => {
    const file = fileInput.files[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      alert("File too large. Max 5MB allowed.");
      fileInput.value = "";
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      base64Holder.value = e.target.result;
      const fileName = file.name;
      if (nameDisplay) nameDisplay.textContent = fileName;
    };
    reader.readAsDataURL(file);
  });
}
setupCameraAndUpload({
  takeBtnId: "takePhotoFront",
  fileInputId: "uploadFrontFile",
  base64Id: "valid_id_front",
  nameDisplayId: "valid_id_front_name",
  facingMode: "environment",
});

setupCameraAndUpload({
  takeBtnId: "takePhotoBack",
  fileInputId: "uploadBackFile",
  base64Id: "valid_id_back",
  nameDisplayId: "valid_id_back_name",
  facingMode: "environment",
});

setupCameraAndUpload({
  takeBtnId: "takePhotoSelfie",
  fileInputId: "uploadSelfieFile",
  base64Id: "selfie_with_id",
  nameDisplayId: "selfie_with_id_name",
  facingMode: "user",
});

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
    const barangay = window.selectedBarangay?.trim() || "";
    const street = form.querySelector("#street")?.value.trim() || "";
    const size = form.querySelector("#field_size")?.value.trim() || "";
    const terrain = form.querySelector("#terrain_type")?.value.trim() || "";

    const lat = parseFloat(form.querySelector("#latitude")?.value || "0");
    const lng = parseFloat(form.querySelector("#longitude")?.value || "0");

    const validFront = form.querySelector("#valid_id_front")?.value || "";
    const validBack = form.querySelector("#valid_id_back")?.value || "";
    const selfie = form.querySelector("#selfie_with_id")?.value || "";

    const barangayCert = form.querySelector("#barangay_certification_base64")?.value || "";
    const landTitle = form.querySelector("#land_title_base64")?.value || "";

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
      console.log("DEBUG CHECK:", {
        fieldName,
        barangay,
        street,
        size,
        terrain,
        sugarVariety,
        lat,
        lng,
        validFront,
        validBack,
        selfie
      });
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
        if (!base64.startsWith("data:")) return "";
        const fileType = base64.includes("pdf") ? "pdf" : "png";
        const refPath = sref(storage, `field_applications/${currentUser.uid}/${name}_${Date.now()}.${fileType}`);
        await uploadString(refPath, base64, "data_url");
        return await getDownloadURL(refPath);
      }


      function toBase64(file) {
        return new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.readAsDataURL(file);
          reader.onload = () => resolve(reader.result);
          reader.onerror = (error) => reject(error);
        });
      }

      const frontURL = await uploadBase64(validFront, "valid_front");
      const backURL = await uploadBase64(validBack, "valid_back");
      const selfieURL = await uploadBase64(selfie, "selfie");
      const barangayURL = barangayCert ? await uploadBase64(barangayCert, "barangay_certificate") : "";
      const landTitleURL = landTitle ? await uploadBase64(landTitle, "land_title") : "";


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
        barangayCertUrl: barangayURL,
        landTitleUrl: landTitleURL
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
