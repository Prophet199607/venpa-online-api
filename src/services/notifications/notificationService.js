const { DeviceToken, NotificationLog } = require("../../models");
const { getMessaging } = require("./firebase");

/**
 * Persist a notification record to the notification_logs table.
 * Called for every sendToUser invocation regardless of FCM outcome.
 */
async function logNotification(userId, { title, body, data }) {
  try {
    const now = new Date();
    await NotificationLog.create({
      user_id: userId,
      title,
      body: body || null,
      type: data?.type || null,
      data: data || null,
      is_read: false,
      created_at: now,
      updated_at: now,
    });
  } catch (err) {
    // Never let a logging failure break the actual notification flow
    console.error(
      "[NotificationLog] Failed to persist notification:",
      err.message,
    );
  }
}

async function sendToUser(userId, { title, body, data }) {
  // Persist before sending so the record exists even if FCM fails
  await logNotification(userId, { title, body, data });

  const tokens = await DeviceToken.findAll({
    where: { user_id: userId },
    attributes: ["token"],
  });

  const tokenList = tokens.map((t) => t.token).filter(Boolean);
  if (!tokenList.length) {
    console.log(`[FCM] No device tokens found for user ${userId}`);
    return;
  }

  let messaging;
  try {
    messaging = await getMessaging();
  } catch (e) {
    console.error("[FCM] Firebase not configured:", e.message);
    return;
  }

  try {
    // FCM v1 API: sendEachForMulticast sends one message per token
    const response = await messaging.sendEachForMulticast({
      tokens: tokenList,
      notification: { title, body },
      data: Object.fromEntries(
        Object.entries(data || {}).map(([k, v]) => [k, String(v)]),
      ),
      android: {
        priority: "high",
      },
      apns: {
        headers: {
          "apns-priority": "10",
        },
        payload: {
          aps: {
            sound: "default",
            badge: 1,
          },
        },
      },
    });

    console.log(
      `[FCM] Sent to user ${userId}: ${response.successCount} success, ${response.failureCount} failed`,
    );

    // Log individual failures and cleanup dead tokens
    const tokensToDelete = [];
    response.responses.forEach((r, i) => {
      if (!r.success) {
        const token = tokenList[i];
        const errorMessage = r.error?.message || "Unknown error";
        console.error(
          `[FCM] Token ${token.slice(0, 20)}... failed: ${errorMessage}`,
        );

        // If token is invalid/expired, mark for deletion
        if (
          errorMessage.includes("Requested entity was not found") ||
          r.error?.code === "messaging/registration-token-not-registered" ||
          r.error?.code === "messaging/invalid-registration-token"
        ) {
          tokensToDelete.push(token);
        }
      }
    });

    if (tokensToDelete.length > 0) {
      console.log(
        `[FCM] Cleaning up ${tokensToDelete.length} invalid tokens...`,
      );
      await DeviceToken.destroy({
        where: { token: tokensToDelete },
      });
    }
  } catch (e) {
    console.error("[FCM] sendEachForMulticast error:", e.message);
  }
}

async function sendToTopic(topic, { title, body, data }) {
  let messaging;
  try {
    messaging = await getMessaging();
  } catch (e) {
    console.error("[FCM] Firebase not configured:", e.message);
    return;
  }

  try {
    const message = {
      topic,
      notification: { title, body },
      data: Object.fromEntries(
        Object.entries(data || {}).map(([k, v]) => [k, String(v)]),
      ),
      android: {
        priority: "high",
      },
      apns: {
        headers: {
          "apns-priority": "10",
        },
        payload: {
          aps: {
            sound: "default",
            badge: 1,
          },
        },
      },
    };

    const response = await messaging.send(message);
    console.log(`[FCM] Sent to topic ${topic}:`, response);
    return response;
  } catch (e) {
    console.error(`[FCM] Topic ${topic} error:`, e.message);
  }
}

module.exports = { sendToUser, sendToTopic };
