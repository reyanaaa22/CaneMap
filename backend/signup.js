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

      if (!fullName) {
        errors.fullname.textContent = 'Please enter your full name.';
        valid = false;
      }

      if (!email) {
        errors.email.textContent = 'Please enter your email address.';
        valid = false;
      } else {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
          errors.email.textContent = 'Please enter a valid email.';
          valid = false;
        }
      }

      if (!contact) {
        errors.contact.textContent = 'Please enter your contact number.';
        valid = false;
      }

      if (!password) {
        errors.password.textContent = 'Please enter a password.';
        valid = false;
      } else if (password.length < 8) {
        errors.password.textContent = 'Password must be at least 8 characters.';
        valid = false;
      } else {
        // Strong password check
        const strongPasswordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/;
        if (!strongPasswordRegex.test(password)) {
          errors.password.textContent = 'Password must have uppercase, lowercase, number, and special character.';
          valid = false;
        }
      }

      if (!confirmPassword) {
        errors.confirmPassword.textContent = 'Please confirm your password.';
        valid = false;
      } else if (password !== confirmPassword) {
        errors.confirmPassword.textContent = 'Passwords do not match.';
        valid = false;
      }

      if (!terms) {
        errors.terms.textContent = 'You must agree to the Terms of Service and Privacy Policy.';
        valid = false;
      }

      if (!valid) return;

      try {
        const userCredential = await auth.createUserWithEmailAndPassword(email, password);
        await userCredential.user.updateProfile({ displayName: fullName });
        await userCredential.user.sendEmailVerification();

        // Save user info with role fixed as 'farmer'
        await db.collection('users').doc(userCredential.user.uid).set({
          fullname: fullName,
          email: email,
          contact: contact,
          role: "farmer", // fixed role — can't be changed from frontend
          createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });

        messageDiv.style.color = '#16a34a';
        messageDiv.textContent = 'Sign-up successful! Please check your email to verify your account before logging in.';
        form.reset();
      } catch (error) {
        messageDiv.style.color = '#dc2626';
        messageDiv.textContent = error.message;
      }
    });
