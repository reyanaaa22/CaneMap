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
