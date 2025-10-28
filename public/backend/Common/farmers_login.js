import { 
  signInWithEmailAndPassword, 
  setPersistence, 
  browserLocalPersistence, 
  sendEmailVerification 
} from "https://www.gstatic.com/firebasejs/12.1.0/firebase-auth.js";

import { 
  doc, getDoc, setDoc, getDocs, collection, query, where, serverTimestamp 
} from "https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js";

import { getFunctions, httpsCallable } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-functions.js";
import { auth, db } from "./firebase-config.js"; 

let alertBox = document.getElementById("alertBox");
let alertOverlay = document.getElementById("alertOverlay");
const emailInput = document.getElementById("email");
const passwordInput = document.getElementById("password");
const loginButton = document.querySelector("button[type='submit']");
const DEFAULT_BUTTON_TEXT = "Sign in";
let alertHideTimeout;
const buttonLabelEl = loginButton ? loginButton.querySelector('.btn-text') : null;

function setButtonLabel(label) {
  if (!loginButton) return;
  if (buttonLabelEl) {
    buttonLabelEl.textContent = label;
  } else {
    loginButton.textContent = label;
  }
}

function setButtonState({ loading = false, label = DEFAULT_BUTTON_TEXT, disabled }) {
  if (!loginButton) return;
  loginButton.classList.toggle('loading', loading);
  if (disabled !== undefined) {
    loginButton.disabled = disabled;
  } else {
    loginButton.disabled = loading;
  }
  setButtonLabel(label);
}

const MAX_ATTEMPTS = 5;
const LOCK_TIME = 30 * 1000; // 30 seconds

function ensureAlertElements() {
  if (!alertOverlay) {
    alertOverlay = document.getElementById("alertOverlay");
    if (!alertOverlay) {
      alertOverlay = document.createElement("div");
      alertOverlay.id = "alertOverlay";
      alertOverlay.className = "alert-overlay";
      document.body.appendChild(alertOverlay);
    }
  }
  if (!alertBox) {
    alertBox = document.getElementById("alertBox");
    if (!alertBox) {
      alertBox = document.createElement("div");
      alertBox.id = "alertBox";
      alertBox.className = "alert";
      alertOverlay.appendChild(alertBox);
    }
  }
}

function hideAlert() {
  if (alertHideTimeout) {
    clearTimeout(alertHideTimeout);
    alertHideTimeout = undefined;
  }
  if (alertBox) {
    alertBox.style.display = "none";
    alertBox.className = "alert";
    alertBox.innerHTML = "";
  }
  if (alertOverlay) {
    alertOverlay.classList.remove("active");
    alertOverlay.setAttribute("aria-hidden", "true");
  }
}

function showAlert(message, type, options = {}) {
  const { autoHide = false, hideAfter = 2000 } = options;
  ensureAlertElements();
  alertBox.innerHTML = message;
  alertBox.className = `alert ${type}`;
  alertBox.style.display = "block";
  alertOverlay.classList.add("active");
  alertOverlay.setAttribute("aria-hidden", "false");

  if (alertHideTimeout) {
    clearTimeout(alertHideTimeout);
  }
  if (autoHide) {
    alertHideTimeout = setTimeout(() => {
      hideAlert();
    }, hideAfter);
  }
}

function disableForm(seconds) {
  emailInput.disabled = true;
  passwordInput.disabled = true;
  setButtonState({ loading: false, label: `Try again in ${seconds}s`, disabled: true });

  let remaining = seconds;

  const countdown = setInterval(() => {
    remaining--;
    setButtonState({ loading: false, label: `Try again in ${remaining}s`, disabled: true });

    if (remaining <= 0) {
      clearInterval(countdown);
      emailInput.disabled = false;
      passwordInput.disabled = false;
      setButtonState({ loading: false, label: DEFAULT_BUTTON_TEXT, disabled: false });
      hideAlert();
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

  setButtonState({ loading: true, label: "Signing in..." });

  try {
    await setPersistence(auth, browserLocalPersistence);
    const userCredential = await signInWithEmailAndPassword(auth, email, password);
    const user = userCredential.user;

    if (!user.emailVerified) {
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
            resendBtn.disabled = false;
            resendBtn.textContent = "Resend verification";
          }
        });
      }
      passwordInput.value = "";
      recordFailedAttempt();
      setButtonState({ loading: false, label: DEFAULT_BUTTON_TEXT, disabled: false });
      return;
    }

    // --- Save in Firestore ONLY after email verification ---
    const userRef = doc(db, "users", user.uid);
    const docSnap = await getDoc(userRef);
    let resolvedDoc = docSnap;
    if (!docSnap.exists()) {
      // Fallback: try to find a users doc by email (some older records used random IDs)
      try {
  const usersRef = collection(db, 'users');
  const q = query(usersRef, where('email', '==', user.email));
        const snapshot = await getDocs(q);
        if (!snapshot.empty) {
          // use the first matching doc
          resolvedDoc = snapshot.docs[0];
          // also copy/merge this doc into users/{uid} so future lookups are consistent
          try {
            await setDoc(userRef, { ...resolvedDoc.data(), uid: user.uid, lastLogin: serverTimestamp(), status: 'verified' }, { merge: true });
          } catch (e) { console.warn('Could not copy existing user doc into users/{uid}:', e); }
        } else {
          // No existing doc by email — create a fresh farmer doc
          await setDoc(userRef, {
            fullname: user.displayName,
            name: user.displayName,
            email: user.email,
            role: 'farmer',
            status: 'verified',
            createdAt: serverTimestamp(),
            lastLogin: serverTimestamp(),
            failedLogins: 0,
            uid: user.uid
          });
          resolvedDoc = await getDoc(userRef);
        }
      } catch (err) {
        console.warn('Fallback user lookup by email failed:', err);
        // create minimal doc so app can proceed
        await setDoc(userRef, {
          fullname: user.displayName,
          name: user.displayName,
          email: user.email,
          role: 'farmer',
          status: 'verified',
          createdAt: serverTimestamp(),
          lastLogin: serverTimestamp(),
          failedLogins: 0,
          uid: user.uid
        });
        resolvedDoc = await getDoc(userRef);
      }
    } else {
      await setDoc(userRef, { 
        lastLogin: serverTimestamp(), 
        status: "verified",
        failedLogins: 0 // reset failed login count
      }, { merge: true });
    }

  let userRole = resolvedDoc && resolvedDoc.exists() ? (resolvedDoc.data().role || 'farmer') : 'farmer';
  // normalize role to lowercase for consistent checks
  if (typeof userRole === 'string') userRole = userRole.toLowerCase();
    let userName = resolvedDoc && resolvedDoc.exists()
      ? (resolvedDoc.data().fullname || resolvedDoc.data().name || user.displayName || 'User')
      : (user.displayName || 'User');

    localStorage.setItem("farmerName", userName);
    localStorage.setItem("userRole", userRole);
    localStorage.setItem("userId", user.uid);

    let farmerNickname = docSnap.exists() ? (docSnap.data().nickname || "") : "";
    if (farmerNickname) localStorage.setItem("farmerNickname", farmerNickname);
    else localStorage.removeItem("farmerNickname");

    let farmerContact = docSnap.exists() ? docSnap.data().contact || "" : "";
    localStorage.setItem("farmerContact", farmerContact);

    resetAttempts();
    setButtonState({ loading: true, label: "Signing in...", disabled: true });
    showAlert("Login successful!", "success");

    setTimeout(() => {
      if (userRole === "sra") {
        window.location.href = "../../frontend/SRA/SRA_Dashboard.html";
      } else {
        window.location.href = "../../frontend/Common/lobby.html";
      }
    }, 1500);

    } catch (error) {
    setButtonState({ loading: false, label: DEFAULT_BUTTON_TEXT, disabled: false });
    const code = (error && error.code) || "";

    // ✅ Record failed login attempt if email exists
      if (code === "auth/wrong-password" || code === "auth/invalid-credential") {
        try {
          const emailKey = email.toLowerCase();
          const usersRef = collection(db, "users");
          const q = query(usersRef, where("email", "==", emailKey));
          const snapshot = await getDocs(q);

          if (!snapshot.empty) {
            const userDoc = snapshot.docs[0].ref;
            const userData = snapshot.docs[0].data();
            const failedCount = (userData.failedLogins || 0) + 1;

            await setDoc(
              userDoc,
              {
                email: emailKey,
                failedLogins: failedCount,
                last_failed_login: new Date().toISOString(),
              },
              { merge: true }
            );

            console.log(`✅ Recorded failed login for ${emailKey}. Count: ${failedCount}`);
          } else {
            console.warn("⚠️ No user found for failed login:", emailKey);
          }
        } catch (err) {
          console.error("Error recording last failed login:", err);
        }
      }

      // --- Friendly error messages ---
      if (code === "auth/user-not-found") {
        showAlert("No account found with this email. Please check your email or sign up first.", "error");
      } else if (code === "auth/wrong-password") {
        showAlert("Incorrect password. Please try again.", "error");
      } else if (code === "auth/invalid-credential") {
        showAlert("Incorrect email or password. Please try again.", "error");
      } else if (code === "auth/too-many-requests") {
        showAlert("Too many failed login attempts. Please wait a moment before trying again.", "error");
      } else {
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
    hideAlert();
  });
});

if (alertOverlay) {
  alertOverlay.addEventListener('click', (event) => {
    if (event.target === alertOverlay) {
      hideAlert();
    }
  });
}

isLocked();
