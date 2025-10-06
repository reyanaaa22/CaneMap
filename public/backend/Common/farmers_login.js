import { signInWithEmailAndPassword, setPersistence, browserLocalPersistence, sendEmailVerification } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-auth.js";
import { doc, getDoc, setDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js";
import { getFunctions, httpsCallable } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-functions.js";
import { auth, db } from "./firebase-config.js"; 

// Firebase services are available from firebase-config.js

let alertBox = document.getElementById("alertBox");
const emailInput = document.getElementById("email");
const passwordInput = document.getElementById("password");
const loginButton = document.querySelector("button[type='submit']");

const MAX_ATTEMPTS = 5;
const LOCK_TIME = 30 * 1000; 

function showAlert(message, type) {
  // Lazily resolve/construct alert box if not yet present
  if (!alertBox) {
    alertBox = document.getElementById("alertBox");
    if (!alertBox) {
      const container = document.querySelector('.container') || document.body;
      const div = document.createElement('div');
      div.id = 'alertBox';
      div.className = 'alert';
      container.appendChild(div);
      alertBox = div;
    }
  }
  alertBox.innerHTML = message;
  alertBox.className = `alert ${type}`;
  alertBox.style.display = "block";
}

function disableForm(seconds) {
  emailInput.disabled = true;
  passwordInput.disabled = true;
  loginButton.disabled = true;

  let remaining = seconds;
  loginButton.textContent = `Try again in ${remaining}s`;

  const countdown = setInterval(() => {
    remaining--;
    loginButton.textContent = `Try again in ${remaining}s`;

    if (remaining <= 0) {
      clearInterval(countdown);
      emailInput.disabled = false;
      passwordInput.disabled = false;
      loginButton.disabled = false;
      loginButton.textContent = "Login";
      alertBox.style.display = "none";
    }
  }, 1000);
}

function isLocked() {
  const lockUntil = localStorage.getItem("lockUntil");
  if (lockUntil && Date.now() < parseInt(lockUntil)) {
    const remaining = Math.ceil((parseInt(lockUntil) - Date.now()) / 1000);
    showAlert(`Too many failed attempts. Try again in ${remaining} seconds.`, "error");
    disableForm(remaining);
    return true;
  }
  return false;
}

function recordFailedAttempt() {
  let attempts = parseInt(localStorage.getItem("loginAttempts") || "0") + 1;
  localStorage.setItem("loginAttempts", attempts);

  if (attempts >= MAX_ATTEMPTS) {
    localStorage.setItem("lockUntil", Date.now() + LOCK_TIME);
    localStorage.setItem("loginAttempts", 0);
    showAlert(`Too many failed attempts. Please try again in ${LOCK_TIME / 1000} seconds.`, "error");
    disableForm(LOCK_TIME / 1000);
  }
}

function resetAttempts() {
  localStorage.setItem("loginAttempts", 0);
  localStorage.removeItem("lockUntil");
}

async function login() {
  if (isLocked()) return;

  const email = emailInput.value.trim();
  const password = passwordInput.value.trim();

  try {
    // Ensure auth persists across tabs/pages
    await setPersistence(auth, browserLocalPersistence);
    const userCredential = await signInWithEmailAndPassword(auth, email, password);
    const user = userCredential.user;

    if (!user.emailVerified) {
      // Provide friendly message with option to resend verification email
      showAlert(
        'Your email is registered but not yet verified. Please check your inbox for the verification link. ' +
        '<button id="resendVerifyBtn" style="margin-left:8px;padding:6px 10px;border:none;border-radius:6px;background:#16a34a;color:#fff;cursor:pointer">Resend verification</button>',
        "warning"
      );
      const resendBtn = document.getElementById("resendVerifyBtn");
      if (resendBtn) {
        resendBtn.addEventListener("click", async () => {
          try {
            resendBtn.disabled = true;
            resendBtn.textContent = "Sending...";
            await sendEmailVerification(user);
            showAlert("Verification email sent. Please check your inbox (or Spam).", "success");
          } catch (e) {
            showAlert("Could not send verification email. Please try again later.", "error");
          } finally {
            try { resendBtn.disabled = false; resendBtn.textContent = "Resend verification"; } catch (_) {}
          }
        });
      }
      passwordInput.value = "";
      recordFailedAttempt();
      return;
    }

  // --- Save in Firestore ONLY after email verification ---
  const userRef = doc(db, "users", user.uid);
  const docSnap = await getDoc(userRef);

  if (!docSnap.exists()) {
    await setDoc(userRef, {
      fullname: user.displayName,
      name: user.displayName,
      email: user.email,
      role: "farmer",
      status: user.emailVerified ? "verified" : "active",
      createdAt: serverTimestamp(),
      lastLogin: serverTimestamp(),
      failedLogins: 0
    });
  } else {
    // Update lastLogin and set status to verified if email is verified
    await setDoc(userRef, { 
      lastLogin: serverTimestamp(), 
      status: user.emailVerified ? "verified" : (docSnap.data().status || "active")
    }, { merge: true });
  }

  // Get user role from Firestore
  let userRole = "farmer";
  if (docSnap.exists()) {
    userRole = docSnap.data().role || "farmer";
  }

  // ✅ Store user information in localStorage
  let userName = docSnap.exists() 
      ? docSnap.data().fullname || docSnap.data().name || user.displayName || "User"
      : user.displayName || "User";

  localStorage.setItem("farmerName", userName);
  localStorage.setItem("userRole", userRole);
  localStorage.setItem("userId", user.uid);

  // ✅ Store nickname if present so other pages (e.g., Workers) can display it
  let farmerNickname = docSnap.exists() 
    ? (docSnap.data().nickname || "")
    : "";
  if (farmerNickname) {
    localStorage.setItem("farmerNickname", farmerNickname);
  } else {
    localStorage.removeItem("farmerNickname");
  }

  let farmerContact = docSnap.exists() 
    ? docSnap.data().contact || "" 
    : "";
  localStorage.setItem("farmerContact", farmerContact);

  // --- Reset attempts and redirect based on role ---
  resetAttempts();
  showAlert("Login successful!", "success");
  
  // Update SRA Officer data in localStorage if they're an SRA Officer
  if (userRole === "sra_officer") {
    try {
      const sraOfficersData = localStorage.getItem('sraOfficers');
      if (sraOfficersData) {
        const sraOfficers = JSON.parse(sraOfficersData);
        const officerIndex = sraOfficers.findIndex(o => o.id === user.uid);
        if (officerIndex !== -1) {
          sraOfficers[officerIndex].emailVerified = user.emailVerified;
          sraOfficers[officerIndex].lastLogin = new Date().toISOString();
          localStorage.setItem('sraOfficers', JSON.stringify(sraOfficers));
        }
      }
    } catch (error) {
      console.log('Could not update SRA Officer data:', error);
    }
  }

  // Redirect based on user role
  setTimeout(() => {
    if (userRole === "sra_officer") {
      window.location.href = "../../frontend/SRA/SRA_Dashboard.html";
    } else {
      window.location.href = "../../frontend/Common/lobby.html";
    }
  }, 1500);

  } catch (error) {
    // Friendly, specific error messaging
    const code = (error && error.code) || "";
    // Log failed login attempt via callable (server increments users.failedLogins)
    try {
      const emailKey = (email || '').toLowerCase();
      if (emailKey) {
        let details = {};
        try {
          const resp = await fetch('https://ipapi.co/json/');
          if (resp.ok) {
            const info = await resp.json();
            details = {
              ip: info.ip || null,
              city: info.city || null,
              region: info.region || info.region_code || null,
              country: info.country_name || info.country || null,
              loc: info.latitude && info.longitude ? `${info.latitude},${info.longitude}` : (info.loc || null)
            };
          }
        } catch (_) {}
        const functions = getFunctions();
        const record = httpsCallable(functions, 'recordFailedLogin');
        await record({ email: emailKey, details });
      }
    } catch (_) {}
    if (code === "auth/user-not-found") {
      showAlert("No account found with this email. Please check your email or sign up first.", "error");
    } else if (code === "auth/wrong-password") {
      showAlert("Incorrect password. Please try again.", "error");
    } else if (code === "auth/invalid-credential") {
      showAlert("Incorrect email or password. Please try again.", "error");
    } else if (code === "auth/too-many-requests") {
      showAlert("Too many failed login attempts. Please wait a moment before trying again.", "error");
    } else {
      // Prevent raw Firebase message leakage
      showAlert("Login failed. Please try again.", "error");
    }
    passwordInput.value = "";
    recordFailedAttempt();
  }
}

document.getElementById("loginForm").addEventListener("submit", (e) => {
  e.preventDefault();
  login();
});

document.querySelectorAll("#email, #password").forEach(input => {
  input.addEventListener("focus", () => {
    const box = document.getElementById('alertBox');
    if (box) box.style.display = "none";
  });
});

// auto-disable forms & button
isLocked();
