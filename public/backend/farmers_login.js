import { signInWithEmailAndPassword } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-auth.js";
import { doc, getDoc, setDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js";
import { auth, db } from "../backend/firebase-config.js"; 

// Firebase services are available from firebase-config.js

const alertBox = document.getElementById("alertBox");
const emailInput = document.getElementById("email");
const passwordInput = document.getElementById("password");
const loginButton = document.querySelector("button[type='submit']");

const MAX_ATTEMPTS = 5;
const LOCK_TIME = 30 * 1000; 

function showAlert(message, type) {
  alertBox.textContent = message;
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
    const userCredential = await signInWithEmailAndPassword(auth, email, password);
    const user = userCredential.user;

    if (!user.emailVerified) {
      showAlert("Please verify your email before logging in.", "error");
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
      email: user.email,
      role: "farmer",
      createdAt: serverTimestamp()
    });
  }

  // ✅ Add this snippet to store farmer name in localStorage
  let farmerName = docSnap.exists() 
      ? docSnap.data().fullname || user.displayName || "Farmer Name"
      : user.displayName || "Farmer Name";

  localStorage.setItem("farmerName", farmerName);

  let farmerContact = docSnap.exists() 
    ? docSnap.data().contact || "" 
    : "";
  localStorage.setItem("farmerContact", farmerContact);

  // --- Reset attempts and redirect ---
  resetAttempts();
  showAlert("Login successful!", "success");
  setTimeout(() => window.location.href = "../views/lobby.html", 1500);

  } catch (error) {
    if (error.code === "auth/invalid-credential") {
      showAlert("Invalid credentials. Please check your email and password.", "error");
    } else {
      showAlert("Login failed: " + error.message, "error");
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
    alertBox.style.display = "none";
  });
});

// auto-disable forms & button
isLocked();
