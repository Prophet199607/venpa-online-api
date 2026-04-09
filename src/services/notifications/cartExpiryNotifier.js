const { CartItem, Cart, DeviceToken } = require("../../models");
const { getMessaging } = require("./firebase");

const DAY_MS = 24 * 60 * 60 * 1000;
const WARN_DAYS = [15, 5, 3];

function computeExpiresAt(item) {
  if (item.expires_at) return new Date(item.expires_at);
  if (item.created_at) return new Date(new Date(item.created_at).getTime() + 30 * DAY_MS);
  return null;
}

async function runCartExpiryNotifications() {
  const now = new Date();

  const items = await CartItem.findAll({
    include: [
      {
        model: Cart,
        where: { status: "active" },
        attributes: ["user_id", "status"],
      },
    ],
    attributes: ["id", "expires_at", "created_at"],
  });

  const expiredIds = [];
  const perUserByDay = new Map();

  for (const item of items) {
    const expiresAt = computeExpiresAt(item);
    if (!expiresAt) continue;

    const remainingDays = Math.ceil((expiresAt - now) / DAY_MS);

    if (remainingDays <= 0) {
      expiredIds.push(item.id);
      continue;
    }

    if (WARN_DAYS.includes(remainingDays)) {
      const userId = item.Cart.user_id;
      if (!perUserByDay.has(userId)) {
        perUserByDay.set(userId, {});
      }
      const map = perUserByDay.get(userId);
      map[remainingDays] = (map[remainingDays] || 0) + 1;
    }
  }

  if (expiredIds.length) {
    await CartItem.destroy({ where: { id: expiredIds } });
  }

  if (!perUserByDay.size) return;

  const userIds = Array.from(perUserByDay.keys());
  const tokens = await DeviceToken.findAll({
    where: { user_id: userIds },
    attributes: ["user_id", "token"],
  });

  const tokensByUser = tokens.reduce((acc, t) => {
    if (!acc[t.user_id]) acc[t.user_id] = [];
    acc[t.user_id].push(t.token);
    return acc;
  }, {});

  let messaging;
  try {
    messaging = getMessaging();
  } catch (e) {
    console.error("Firebase not configured:", e.message);
    return;
  }

  for (const userId of userIds) {
    const tokenList = tokensByUser[userId] || [];
    if (!tokenList.length) continue;

    const dayCounts = perUserByDay.get(userId);
    for (const day of WARN_DAYS) {
      const count = dayCounts[day];
      if (!count) continue;

      const title = "Cart item expiring";
      const body = `You have ${count} item(s) expiring in ${day} day(s).`;

      await messaging.sendEachForMulticast({
        tokens: tokenList,
        notification: { title, body },
        data: { type: "cart_expiry", days: String(day), count: String(count) },
      });
    }
  }
}

module.exports = { runCartExpiryNotifications };
