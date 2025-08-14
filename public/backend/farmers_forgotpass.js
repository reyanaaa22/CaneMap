import { sendPasswordResetEmail } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-auth.js";
import { auth } from "./firebase-config.js";

const emailInput = document.getElementById("email");
const resetBtn = document.getElementById("resetBtn");
const alertBox = document.getElementById("alertBox");

const modalOverlay = document.getElementById("modalOverlay");
const modalMessage = document.getElementById("modalMessage");
const modalOkBtn = document.getElementById("modalOkBtn");

function showAlert(message, type) {
  hideModal(); // Always hide modal
  alertBox.textContent = message;
  alertBox.className = `alert ${type}`;
  alertBox.style.display = "block";
  console.log("ALERT:", message); // Debug
}

function clearAlert() {
  alertBox.textContent = "";
  alertBox.className = "alert";
  alertBox.style.display = "none";
}
function showModal(message) {
  clearAlert(); // Always hide alert
  modalMessage.textContent = message;
  modalOverlay.style.display = "flex";
  modalOkBtn.disabled = false;
  console.log("MODAL:", message); // Debug
}

function hideModal() {
  modalOverlay.style.display = "none";
}

resetBtn.addEventListener("click", async () => {
  clearAlert();
  hideModal();

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

  try {
    await sendPasswordResetEmail(auth, email);
    showModal("Password reset email sent! Please check your inbox.");
  } catch (error) {
  console.error("RESET ERROR:", error); // Debug
  let msg = "Something went wrong. Please try again.";
  if (error.code === "auth/user-not-found") {
    msg = "No account found with that email.";
  } else if (error.code === "auth/invalid-email") {
    msg = "Invalid email address.";
  }
  showAlert(msg, "error");
}
});

modalOkBtn.addEventListener("click", () => {
  hideModal();
  window.location.href = "../views/farmers_login.html";
});

emailInput.addEventListener("focus", () => clearAlert());
