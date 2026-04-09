const admin = require("firebase-admin");
const axios = require("axios");
const path = require("path");
const fs = require("fs");

let initialized = false;

async function initFirebase() {
  if (initialized) return admin;

  const json = process.env.FIREBASE_SERVICE_ACCOUNT;
  const filePathFromEnv = process.env.FIREBASE_SERVICE_ACCOUNT_FILE;

  let serviceAccount = null;

  if (json) {
    try {
      serviceAccount = JSON.parse(json);
    } catch (e) {
      console.error(
        "[Firebase] Failed to parse FIREBASE_SERVICE_ACCOUNT JSON string",
      );
    }
  }

  if (!serviceAccount && filePathFromEnv) {
    // Check if it's a URL
    if (
      filePathFromEnv.startsWith("http://") ||
      filePathFromEnv.startsWith("https://")
    ) {
      try {
        console.log(
          `[Firebase] Downloading service account from: ${filePathFromEnv}`,
        );
        const response = await axios.get(filePathFromEnv);
        serviceAccount = response.data;
      } catch (e) {
        console.error(
          `[Firebase] Failed to download service account from URL: ${filePathFromEnv}. Error: ${e.message}`,
        );
      }
    } else {
      // If the path is absolute, use it; otherwise, make it relative to the project root
      const resolvedPath = path.isAbsolute(filePathFromEnv)
        ? filePathFromEnv
        : path.join(process.cwd(), filePathFromEnv);

      if (fs.existsSync(resolvedPath)) {
        try {
          serviceAccount = JSON.parse(fs.readFileSync(resolvedPath, "utf8"));
        } catch (e) {
          console.error(
            `[Firebase] Failed to read/parse service account file at: ${resolvedPath}`,
          );
        }
      } else {
        console.error(
          `[Firebase] Service account file NOT found at: ${resolvedPath}`,
        );
      }
    }
  }

  if (!serviceAccount) {
    throw new Error(
      "Firebase service account not configured. Set FIREBASE_SERVICE_ACCOUNT (JSON string) or FIREBASE_SERVICE_ACCOUNT_FILE (path/URL).",
    );
  }

  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
  initialized = true;
  console.log("[Firebase] Initialized successfully");
  return admin;
}

async function getMessaging() {
  const app = await initFirebase();
  return app.messaging();
}

module.exports = { getMessaging };
