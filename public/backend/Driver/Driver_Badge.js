import { auth, db } from "../Common/firebase-config.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-auth.js";
import { doc, getDoc, setDoc, updateDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js";
import { getStorage, ref as sref, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-storage.js";

console.log("Driver_Badge.js loaded");

document.addEventListener("DOMContentLoaded", () => {
  const form = document.getElementById("driverBadgeForm");
  if (!form) return; // safety

  // keep existing UI helpers (if you still want generateFormId etc)
  // (the PDF shows generateFormId/autofill already present). :contentReference[oaicite:9]{index=9}

  onAuthStateChanged(auth, (user) => {
    if (!user) {
      alert("Please log in to apply for a Driver Badge.");
      window.location.href = "../../frontend/Handler/farmers_login.html";
      return;
    }

    // Autofill: try Firestore users/{uid}, then auth profile, then localStorage
    (async () => {
      try {
        const f = form.elements;
        const fullnameEl = f["fullname"]; const contactEl = f["contact_number"] || f["contact"]; const emailEl = f["email"];

        // 1) Firestore profile
        try {
          const userSnap = await getDoc(doc(db, "users", user.uid));
          if (userSnap.exists()) {
            const u = userSnap.data();
            if (fullnameEl && !fullnameEl.value && (u.name || u.fullname)) fullnameEl.value = (u.name || u.fullname);
            if (contactEl && !contactEl.value && (u.contact || u.phone || u.contact_number)) contactEl.value = (u.contact || u.phone || u.contact_number);
            if (emailEl && !emailEl.value && u.email) emailEl.value = u.email;
          }
        } catch {}

        // 2) Auth object fallback
        if (emailEl && !emailEl.value && user.email) emailEl.value = user.email;
        if (fullnameEl && !fullnameEl.value && (user.displayName || "")) fullnameEl.value = user.displayName;

        // 3) localStorage fallback
        const farmerName = localStorage.getItem("farmerName");
        const farmerContact = localStorage.getItem("farmerContact");
        if (fullnameEl && !fullnameEl.value && farmerName) fullnameEl.value = farmerName;
        if (contactEl && !contactEl.value && farmerContact) contactEl.value = farmerContact;
      } catch (e) {
        console.warn('Profile autofill failed', e);
      }
    })();

    // Always bypass Storage (no bucket available). Save to Firestore only.
    const bypassStorage = true;
    ["license_front","license_back","photo","vehicle_orcr"].forEach((name) => {
      const el = form.elements[name];
      if (el) el.removeAttribute("required");
    });

    // Prefill if existing application
    (async () => {
      try {
        const snap = await getDoc(doc(db, "Drivers_Badge", user.uid));
        if (snap.exists()) {
          const data = snap.data();
          const f = form.elements;
          if (data.fullname && f["fullname"]) f["fullname"].value = data.fullname;
          if (data.contact_number && (f["contact_number"]||f["contact"])) (f["contact_number"]||f["contact"]).value = data.contact_number;
          if (data.address && f["address"]) f["address"].value = data.address;
          if (data.birth_date && f["birth_date"]) f["birth_date"].value = data.birth_date;
          if (data.email && f["email"]) f["email"].value = data.email;
          if (data.license_number && f["license_number"]) f["license_number"].value = data.license_number;
          if (data.license_expiry && f["license_expiry"]) f["license_expiry"].value = data.license_expiry;
          if (data.vehicle_model && f["vehicle_model"]) f["vehicle_model"].value = data.vehicle_model;
          if (data.vehicle_year && f["vehicle_year"]) f["vehicle_year"].value = data.vehicle_year;
          if (data.vehicle_color && f["vehicle_color"]) f["vehicle_color"].value = data.vehicle_color;
          // license_type removed from form
          if (Array.isArray(data.vehicle_types)) {
            [...form.querySelectorAll('input[name="vehicle_types[]"]')].forEach(cb => {
              cb.checked = data.vehicle_types.includes(cb.value);
            });
          }
          if (data.plate_number && f["plate_number"]) f["plate_number"].value = data.plate_number;
          if (data.other_vehicle_type && f["other_vehicle_type"]) f["other_vehicle_type"].value = data.other_vehicle_type;

          // Gate edits to once every 30 days
          const submitBtn = form.querySelector('button[type="submit"]');
          const lastEdit = data.lastEdit?.toDate ? data.lastEdit.toDate() : (data.lastEdit ? new Date(data.lastEdit) : null);
          const now = new Date();
          if (lastEdit) {
            const daysSince = (now - lastEdit) / (1000*60*60*24);
            if (daysSince < 30 && submitBtn) {
              submitBtn.disabled = true;
              submitBtn.textContent = `Next edit available in ${Math.ceil(30 - daysSince)} day(s)`;
            }
          }

          // Show previews if URLs exist
          function renderPreview(containerId, url){
            const c = document.getElementById(containerId);
            if (!c || !url) return;
            const isPdf = typeof url === 'string' && url.toLowerCase().endsWith('.pdf');
            c.innerHTML = isPdf ? `<a href="${url}" target="_blank" class="text-[var(--cane-700)] underline">View PDF</a>` : `<img src="${url}" alt="preview" class="rounded shadow max-h-40">`;
          }
          renderPreview('preview_license_front', data.license_front_url || data.license_front_data);
          renderPreview('preview_license_back', data.license_back_url || data.license_back_data);
          renderPreview('preview_photo', data.photo_url || data.photo_data);
          renderPreview('preview_vehicle_orcr', data.vehicle_orcr_url || data.vehicle_orcr_data);
        }
      } catch (e) {
        console.warn('Prefill failed', e);
      }
    })();

    form.addEventListener("submit", async (e) => {
      e.preventDefault();

      // collect fields by name (your HTML uses name="..." attributes). :contentReference[oaicite:10]{index=10}
      const f = form.elements;
      const payload = {
        fullname: (f["fullname"]?.value || "").trim(),
        contact_number: (f["contact_number"]?.value || f["contact"]?.value || "").trim(),
        address: (f["address"]?.value || "").trim(),
        birth_date: f["birth_date"]?.value || "",
        email: (f["email"]?.value || "").trim(),
        license_number: (f["license_number"]?.value || "").trim(),
        license_expiry: f["license_expiry"]?.value || "",
        // license_type removed; truck configuration captured via vehicle_types
        // license_status removed from form
        vehicle_model: (f["vehicle_model"]?.value || "").trim(),
        vehicle_year: (f["vehicle_year"]?.value || "").trim(),
        vehicle_color: (f["vehicle_color"]?.value || "").trim(),
        vehicle_types: [...form.querySelectorAll('input[name="vehicle_types[]"]:checked')]
                 .map(cb => cb.value),
        plate_number: f["plate_number"]?.value || "",
        other_vehicle_type: f["other_vehicle_type"]?.value || "",
        requestedAt: serverTimestamp(),
        lastEdit: serverTimestamp(),
        requestedBy: user.uid
      };

      // basic required validation (add more as needed)
      if (!payload.fullname || !payload.contact_number || !payload.license_number) {
        alert("Please fill in required fields (Full name, Contact, License Number).");
        return;
      }

      try {
        const storage = bypassStorage ? null : getStorage();

        // helper: upload file if present and return download URL
        async function maybeUpload(inputName, destName) {
          const input = f[inputName];
          if (!storage) return null; // storage disabled
          if (input && input.files && input.files[0]) {
            try {
              const file = input.files[0];
              const r = sref(storage, `driver_badges/${user.uid}/${destName}_${Date.now()}_${file.name}`);
              await uploadBytes(r, file);
              return await getDownloadURL(r);
            } catch (uploadErr) {
              console.warn("Upload failed, proceeding without file:", destName, uploadErr);
              return null;
            }
          }
          return null;
        }

        // file inputs (these names appear in your HTML: license_front, license_back, photo, vehicle_orcr). :contentReference[oaicite:11]{index=11}
        const licenseFrontURL = await maybeUpload("license_front", "license_front");
        const licenseBackURL  = await maybeUpload("license_back", "license_back");
        const photoURL        = await maybeUpload("photo", "photo");
        const vehicleOrcrURL  = await maybeUpload("vehicle_orcr", "vehicle_orcr");

        // If storage disabled, embed images as compressed data URLs into Firestore
        async function readAsCompressedDataUrl(file){
          const dataUrl = await new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = reject;
            reader.readAsDataURL(file);
          });
          return await new Promise((resolve) => {
            const img = new Image();
            img.onload = () => {
              const maxDim = 1024;
              let { width, height } = img;
              if (width > height && width > maxDim) { height = Math.round(height * (maxDim / width)); width = maxDim; }
              else if (height > width && height > maxDim) { width = Math.round(width * (maxDim / height)); height = maxDim; }
              else if (width === height && width > maxDim) { width = height = maxDim; }
              const canvas = document.createElement('canvas');
              canvas.width = width; canvas.height = height;
              const ctx = canvas.getContext('2d');
              ctx.drawImage(img, 0, 0, width, height);
              resolve(canvas.toDataURL('image/jpeg', 0.8));
            };
            img.onerror = () => resolve(dataUrl);
            img.src = dataUrl;
          });
        }

        if (!storage) {
          const lf = f["license_front"]; if (lf && lf.files && lf.files[0] && lf.files[0].type.startsWith('image/')) payload.license_front_data = await readAsCompressedDataUrl(lf.files[0]);
          const lb = f["license_back"];  if (lb && lb.files && lb.files[0] && lb.files[0].type.startsWith('image/')) payload.license_back_data = await readAsCompressedDataUrl(lb.files[0]);
          const ph = f["photo"];          if (ph && ph.files && ph.files[0] && ph.files[0].type.startsWith('image/')) payload.photo_data = await readAsCompressedDataUrl(ph.files[0]);
          const vo = f["vehicle_orcr"];   if (vo && vo.files && vo.files[0] && vo.files[0].type.startsWith('image/')) payload.vehicle_orcr_data = await readAsCompressedDataUrl(vo.files[0]);
        }

        if (licenseFrontURL) payload.license_front_url = licenseFrontURL;
        if (licenseBackURL) payload.license_back_url = licenseBackURL;
        if (photoURL) payload.photo_url = photoURL;
        if (vehicleOrcrURL) payload.vehicle_orcr_url = vehicleOrcrURL;

        // Save driver badge request (document id = user.uid so it's easy to look up)
        await setDoc(doc(db, "Drivers_Badge", user.uid), payload);

        // Save driver badge request (document id = user.uid)
        await setDoc(doc(db, "Drivers_Badge", user.uid), {
          ...payload,
          status: "pending" // 🕐 start as pending
        });

        // 🚫 Don't auto-promote the user yet
        alert("Driver Badge application submitted. Your request is now pending officer review.");
        window.location.href = "../Common/lobby.html";

      } catch (err) {
        console.error("Driver badge submission error:", err);
        alert("Error submitting Driver Badge: " + (err.message || err));
      }
    });
  });
});
