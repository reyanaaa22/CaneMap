  import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
  import { getAuth, sendPasswordResetEmail, fetchSignInMethodsForEmail } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

  const firebaseConfig = {
    apiKey: "AIzaSyAWcIMy6hBF4aP6LTSS1PwtmZogUebAI4A",
    authDomain: "canemap-system.firebaseapp.com",
    projectId: "canemap-system",
    storageBucket: "canemap-system.firebasestorage.app",
    messagingSenderId: "624993566775",
    appId: "1:624993566775:web:5b1b72cb58203b46123fb2",
    measurementId: "G-08KFJQ1NEJ"
  };

  const app = initializeApp(firebaseConfig);
  const auth = getAuth(app);

  const emailInput = document.getElementById("email");
  const resetBtn = document.getElementById("resetBtn");
  const alertBox = document.getElementById("alertBox");

  const modalOverlay = document.getElementById("modalOverlay");
  const modalMessage = document.getElementById("modalMessage");
  const modalOkBtn = document.getElementById("modalOkBtn");

  function showAlert(message, type) {
    alertBox.textContent = message;
    alertBox.className = `alert ${type}`;
    alertBox.style.display = "block";
  }

  function clearAlert() {
    alertBox.textContent = "";
    alertBox.className = "alert";
    alertBox.style.display = "none";
  }

  function showModal(message) {
    modalMessage.textContent = message;
    modalOverlay.style.display = "flex";
    modalOkBtn.disabled = false;
  }

  function hideModal() {
    modalOverlay.style.display = "none";
  }

  resetBtn.addEventListener("click", async () => {
    clearAlert();

    const email = emailInput.value.trim();

    if (!email) {
      showAlert("Please enter your email address.", "error");
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      showAlert("Please enter a valid email address.", "error");
      return;
    }

    showModal("Password reset email sent! Please check your inbox.");

    

      await sendPasswordResetEmail(auth, email);
      modalMessage.textContent = "Password reset email sent! Please check your inbox.";
      modalOkBtn.disabled = false;

    });

  modalOkBtn.addEventListener("click", () => {
    hideModal();
    window.location.href = "../viewss/farmers_login.html"; // Redirect to login page
  });

  emailInput.addEventListener("focus", () => clearAlert());
