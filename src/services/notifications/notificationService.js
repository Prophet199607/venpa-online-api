const { DeviceToken } = require("../../models");
const { getMessaging } = require("./firebase");

async function sendToUser(userId, { title, body, data }) {
  const tokens = await DeviceToken.findAll({
    where: { user_id: userId },
    attributes: ["token"],
  });

  const tokenList = tokens.map((t) => t.token).filter(Boolean);
  if (!tokenList.length) return;

  let messaging;
  try {
    messaging = getMessaging();
  } catch (e) {
    console.error("Firebase not configured:", e.message);
    return;
  }

  await messaging.sendEachForMulticast({
    tokens: tokenList,
    notification: { title, body },
    data: data || {},
  });
}

module.exports = { sendToUser };
