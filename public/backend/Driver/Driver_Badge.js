// public/backend/Driver/Driver_Badge.js
// (replace the current file contents with this)
// uses ES modules -> requires <script type="module" ...> in HTML

import { auth, db } from "../Common/firebase-config.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-auth.js";
import { doc, setDoc, updateDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js";
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

    // optional: prefill from localStorage (your current code uses farmerName/farmerContact).
    const fullnameEl = form.elements["fullname"];
    const contactEl = form.elements["contact_number"] || form.elements["contact"];
    const farmerName = localStorage.getItem("farmerName");
    const farmerContact = localStorage.getItem("farmerContact");
    if (farmerName && fullnameEl) fullnameEl.value = farmerName;
    if (farmerContact && contactEl) contactEl.value = farmerContact;

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
        license_type: f["license_type"]?.value || "",
        license_status: f["license_status"]?.value || "",
        vehicle_types: [...form.querySelectorAll('input[name="vehicle_types[]"]:checked')]
                 .map(cb => cb.value),
        plate_number: f["plate_number"]?.value || "",
        other_vehicle_type: f["other_vehicle_type"]?.value || "",
        status: "pending",
        requestedAt: serverTimestamp(),
        requestedBy: user.uid
      };

      // basic required validation (add more as needed)
      if (!payload.fullname || !payload.contact_number || !payload.license_number) {
        alert("Please fill in required fields (Full name, Contact, License Number).");
        return;
      }

      try {
        const storage = getStorage();

        // helper: upload file if present and return download URL
        async function maybeUpload(inputName, destName) {
          const input = f[inputName];
          if (input && input.files && input.files[0]) {
            const file = input.files[0];
            const r = sref(storage, `driver_badges/${user.uid}/${destName}_${Date.now()}_${file.name}`);
            await uploadBytes(r, file);
            return await getDownloadURL(r);
          }
          return null;
        }

        // file inputs (these names appear in your HTML: license_front, license_back, photo, vehicle_orcr). :contentReference[oaicite:11]{index=11}
        const licenseFrontURL = await maybeUpload("license_front", "license_front");
        const licenseBackURL  = await maybeUpload("license_back", "license_back");
        const photoURL        = await maybeUpload("photo", "photo");
        const vehicleOrcrURL  = await maybeUpload("vehicle_orcr", "vehicle_orcr");

        if (licenseFrontURL) payload.license_front_url = licenseFrontURL;
        if (licenseBackURL) payload.license_back_url = licenseBackURL;
        if (photoURL) payload.photo_url = photoURL;
        if (vehicleOrcrURL) payload.vehicle_orcr_url = vehicleOrcrURL;

        // Save driver badge request (document id = user.uid so it's easy to look up)
        await setDoc(doc(db, "Drivers_Badge", user.uid), payload);

        // Update the user's role to "Driver" in the users collection
        // (your signup code sets users/{uid} earlier). :contentReference[oaicite:12]{index=12}
        await updateDoc(doc(db, "users", user.uid), { role: "Driver" });

        alert("Driver Badge application submitted. Your role has been set to Driver.");
        // redirect to driver dashboard or another page (adjust path as appropriate)
        window.location.href = "../../frontend/Driver/driver_dashboard.html";
      } catch (err) {
        console.error("Driver badge submission error:", err);
        alert("Error submitting Driver Badge: " + (err.message || err));
      }
    });
  });
});
