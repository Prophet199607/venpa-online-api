const { DeviceToken } = require("../../models");
const { getMessaging } = require("./firebase");

async function sendToUser(userId, { title, body, data }) {
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
    messaging = getMessaging();
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

    // Log individual failures for debugging
    response.responses.forEach((r, i) => {
      if (!r.success) {
        console.error(
          `[FCM] Token ${tokenList[i].slice(0, 20)}... failed: ${r.error?.message}`,
        );
      }
    });
  } catch (e) {
    console.error("[FCM] sendEachForMulticast error:", e.message);
  }
}

module.exports = { sendToUser };
