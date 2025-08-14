  // Import Firebase services from centralized config
  import { sendPasswordResetEmail } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-auth.js";
  
  // Firebase services are available from firebase-config.js

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
    window.location.href = "../views/farmers_login.html"; // Redirect to login page
  });

  emailInput.addEventListener("focus", () => clearAlert());
