const admin = require("firebase-admin");
const fs = require("fs");

let initialized = false;

function initFirebase() {
  if (initialized) return admin;

  const json = process.env.FIREBASE_SERVICE_ACCOUNT;
  const file = process.env.FIREBASE_SERVICE_ACCOUNT_FILE;

  let serviceAccount = null;
  if (json) {
    serviceAccount = JSON.parse(json);
  } else if (file && fs.existsSync(file)) {
    serviceAccount = JSON.parse(fs.readFileSync(file, "utf8"));
  }

  if (!serviceAccount) {
    throw new Error("Firebase service account not configured");
  }

  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
  initialized = true;
  return admin;
}

function getMessaging() {
  const app = initFirebase();
  return app.messaging();
}

module.exports = { getMessaging };
