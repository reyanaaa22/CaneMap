const functions = require("firebase-functions");
const admin = require("firebase-admin");

if (!admin.apps.length) admin.initializeApp();
const db = admin.firestore();

exports.verifyEmailLink = functions.https.onRequest(async (req, res) => {
  const email = req.query.email;
  if (!email) return res.status(400).send("Missing email parameter.");

  try {
    const snap = await db.collection("users").where("email", "==", email).limit(1).get();
    if (snap.empty) return res.status(404).send("User not found.");

    const userRef = snap.docs[0].ref;

    // ✅ Update user status and verification
    await userRef.update({
      emailVerified: true,
      status: "verified",
      verifiedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    // Also mark the Firebase Auth user as emailVerified so they can log in
    try {
      const authUser = await admin.auth().getUserByEmail(email);
      if (authUser && !authUser.emailVerified) {
        await admin.auth().updateUser(authUser.uid, { emailVerified: true });
      }
    } catch (e) {
      // If the auth user doesn't exist yet or update fails, log and continue.
      console.warn('Could not mark auth user as verified:', e.message || e);
    }

    // ✅ Show success and auto-redirect to login page
    const redirectURL = "https://canemap-system.web.app/frontend/Common/farmers_login.html";
    res.status(200).send(`
      <html>
        <head>
          <meta http-equiv="refresh" content="4;url=${redirectURL}" />
          <style>
            body { font-family: Arial, sans-serif; text-align: center; padding-top: 100px; background: #f9fafb; color: #333; }
            .card { display: inline-block; background: white; padding: 30px 50px; border-radius: 12px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
          </style>
        </head>
        <body>
          <div class="card">
            <h2>✅ Email verified successfully!</h2>
            <p>You can now close this tab or <a href="${redirectURL}">log in</a>.</p>
            <p style="font-size: 14px; color: gray;">Redirecting you in a few seconds...</p>
          </div>
          <script>
            setTimeout(() => { window.location.href = "${redirectURL}"; }, 4000);
          </script>
        </body>
      </html>
    `);
  } catch (err) {
    console.error("Verification error:", err);
    res.status(500).send("Server error: " + err.message);
  }
});

// Create SRA account (called by System Admin front-end)
exports.createSRA = functions.https.onRequest(async (req, res) => {
  // Allow simple CORS for browser requests from the frontend
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).send('');

  try {
    const { name, email, password } = req.method === 'POST' ? req.body : req.query;
    if (!name || !email || !password) return res.status(400).json({ error: 'Missing name/email/password' });

    // Check if Auth user already exists
    try {
      const existing = await admin.auth().getUserByEmail(email);
      if (existing) return res.status(409).json({ error: 'Auth user already exists' });
    } catch (e) {
      // getUserByEmail throws if not found - that's OK, continue
    }

    // Create the auth user
    const user = await admin.auth().createUser({
      email: email,
      password: password,
      displayName: name,
      emailVerified: false,
    });

    // Create Firestore user document with uid so both are linked
    const payload = {
      uid: user.uid,
      name,
      email,
      role: 'sra',
      status: 'pending',
      emailVerified: false,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      lastLogin: null
    };

    // Use UID as document ID so client code can read users/{uid}
    const docRef = db.collection('users').doc(user.uid);
    await docRef.set({
      fullname: name,
      name: name,
      email: email,
      role: 'sra',
      status: 'pending',
      emailVerified: false,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      lastLogin: null,
      failedLogins: 0,
      uid: user.uid
    });

    // Try to generate a Firebase action link (email verification) server-side and return it to the client
    let verificationLink = null;
    try {
      verificationLink = await admin.auth().generateEmailVerificationLink(email, {
        url: `https://canemap-system.web.app/verify.html?email=${encodeURIComponent(email)}`
      });
    } catch (linkErr) {
      console.warn('Could not generate email verification link via Admin SDK:', linkErr && linkErr.message ? linkErr.message : linkErr);
    }

    return res.status(200).json({ ok: true, uid: user.uid, docId: docRef.id, verificationLink });
  } catch (err) {
    console.error('createSRA error:', err);
    return res.status(500).json({ error: err.message || String(err) });
  }
});

