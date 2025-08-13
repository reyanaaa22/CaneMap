const firebaseConfig = {
  apiKey: "AIzaSyAWcIMy6hBF4aP6LTSS1PwtmZogUebAI4A",
  authDomain: "canemap-system.firebaseapp.com",
  projectId: "canemap-system",
  storageBucket: "canemap-system.firebasestorage.app",
  messagingSenderId: "624993566775",
  appId: "1:624993566775:web:5b1b72cb58203b46123fb2",
  measurementId: "G-08KFJQ1NEJ"
};

firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();

const form = document.getElementById('signup-form');
const messageDiv = document.getElementById('message');

const errors = {
  fullname: document.getElementById('error-fullname'),
  email: document.getElementById('error-email'),
  contact: document.getElementById('error-contact'),
  password: document.getElementById('error-password'),
  confirmPassword: document.getElementById('error-confirm-password'),
  terms: document.getElementById('error-terms'),
};

// Modal elements
const successModal = document.getElementById('successModal');
const modalOkBtn = document.getElementById('modalOkBtn');

function clearErrors() {
  for (const key in errors) {
    errors[key].textContent = '';
  }
  messageDiv.textContent = '';
  messageDiv.style.color = '#16a34a';
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  clearErrors();

  const fullName = form.fullname.value.trim();
  const email = form.email.value.trim();
  const contact = form.contact.value.trim();
  const password = form.password.value;
  const confirmPassword = form['confirm-password'].value;
  const terms = form.terms.checked;

  let valid = true;

  if (!fullName) { errors.fullname.textContent = 'Please enter your full name.'; valid = false; }

  if (!email) { errors.email.textContent = 'Please enter your email address.'; valid = false; } 
  else { const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/; if (!emailRegex.test(email)) { errors.email.textContent = 'Please enter a valid email.'; valid = false; } }

  if (!contact) { errors.contact.textContent = 'Please enter your contact number.'; valid = false; } 
  else { 
    const contactRegex = /^\+?\d{10,15}$/; // allows optional + and 10-15 digits
    if (!contactRegex.test(contact)) { errors.contact.textContent = 'Please enter a valid contact number (digits only).'; valid = false; }
  }

  if (!password) { errors.password.textContent = 'Please enter a password.'; valid = false; } 
  else if (password.length < 8) { errors.password.textContent = 'Password must be at least 8 characters.'; valid = false; } 
  else { const strongPasswordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])/;
         if (!strongPasswordRegex.test(password)) { errors.password.textContent = 'Password must have uppercase, lowercase, number, and special character.'; valid = false; } }

  if (!confirmPassword) { /* Do not show error yet */ } 
  else if (password !== confirmPassword) { errors.confirmPassword.textContent = 'Passwords do not match.'; valid = false; }

  if (!terms) { errors.terms.textContent = 'You must agree to the Terms of Service and Privacy Policy.'; valid = false; }

  if (!valid) return;

  try {
    const signInMethods = await auth.fetchSignInMethodsForEmail(email);

    if (signInMethods.length > 0) {
      let tempUser = null;
      try { tempUser = await auth.signInWithEmailAndPassword(email, password); } 
      catch (err) { if (err.code !== "auth/wrong-password") throw err; }

      if (tempUser && !tempUser.user.emailVerified) { await tempUser.user.delete(); } 
      else if (tempUser && tempUser.user.emailVerified) { throw new Error("Email already in use. Try other email."); }
    }

    const userCredential = await auth.createUserWithEmailAndPassword(email, password);
    await userCredential.user.updateProfile({ displayName: fullName });
    await userCredential.user.sendEmailVerification();

    successModal.style.display = 'flex';
    modalOkBtn.onclick = () => {
      successModal.style.display = 'none';
      window.location.href = "../views/farmers_login.html";
    };

    form.reset();
  } catch (error) {
    messageDiv.style.color = '#dc2626';
    messageDiv.textContent = error.message;
    setTimeout(() => { messageDiv.textContent = ''; }, 4000);
  }
});

// ---------------------- Responsive error alerts ----------------------
const inputs = {
  fullname: form.fullname,
  email: form.email,
  contact: form.contact,
  password: form.password,
  confirmPassword: form['confirm-password'],
  terms: form.terms,
};

function validateField(field) {
  switch(field) {
    case 'fullname':
      errors.fullname.textContent = inputs.fullname.value.trim() ? '' : 'Please enter your full name.';
      break;
    case 'email':
      const emailVal = inputs.email.value.trim();
      if (!emailVal) errors.email.textContent = 'Please enter your email address.';
      else { const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/; errors.email.textContent = emailRegex.test(emailVal) ? '' : 'Please enter a valid email.'; }
      break;
    case 'contact':
      const contactVal = inputs.contact.value.trim();
      if (!contactVal) errors.contact.textContent = 'Please enter your contact number.';
      else { const contactRegex = /^\+?\d{10,15}$/; errors.contact.textContent = contactRegex.test(contactVal) ? '' : 'Please enter a valid contact number (digits only).'; }
      break;
    case 'password':
      const passVal = inputs.password.value;
      if (!passVal) errors.password.textContent = 'Please enter a password.';
      else if (passVal.length < 8) errors.password.textContent = 'Password must be at least 8 characters.';
      else { const strongPasswordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])/; errors.password.textContent = strongPasswordRegex.test(passVal) ? '' : 'Password must have uppercase, lowercase, number, and special character.'; }
      validateField('confirmPassword'); // live update confirm password
      break;
    case 'confirmPassword':
      // Show error only if user typed something in confirm password
      if (inputs['confirmPassword'].value) {
        errors.confirmPassword.textContent = inputs['confirmPassword'].value === inputs.password.value ? '' : 'Passwords do not match.';
      } else {
        errors.confirmPassword.textContent = '';
      }
      break;
    case 'terms':
      errors.terms.textContent = inputs.terms.checked ? '' : 'You must agree to the Terms of Service and Privacy Policy.';
      break;
  }
}

// Add input/change listeners
inputs.fullname.addEventListener('input', () => validateField('fullname'));
inputs.email.addEventListener('input', () => validateField('email'));
inputs.contact.addEventListener('input', () => validateField('contact'));
inputs.password.addEventListener('input', () => validateField('password'));
inputs['confirmPassword'].addEventListener('input', () => validateField('confirmPassword'));
inputs.terms.addEventListener('change', () => validateField('terms'));
