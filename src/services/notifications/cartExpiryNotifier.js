const { Op } = require("sequelize");
const { CartItem, Cart } = require("../../models");
const { sendToUser } = require("./notificationService");
const { NOTIFICATION_TYPES } = require("./notificationTypes");

const DAY_MS = 24 * 60 * 60 * 1000;

// Remaining-days values that trigger a push notification.
// Day 23 of 30 → 7 days left  → "1 week left" warning
// Day 30 of 30 → 1 day left   → "24 hours left" warning
const WARN_AT_REMAINING_DAYS = [7, 1];

/**
 * Main job – runs once a day (controlled by CART_NOTIFY_CRON env var).
 *
 * Since the cart controller always writes expires_at = created_at + 30 days
 * when a new item is inserted, we rely on expires_at as the single source
 * of truth.  Items without expires_at are skipped (legacy / data issue).
 *
 * Lifecycle:
 *   expires_at - 7 days  → send "1 week left" push
 *   expires_at - 1 day   → send "24 hours left" push
 *   expires_at passed    → delete the cart item
 */
async function runCartExpiryNotifications() {
  const now = new Date();

  // Only look at items in active carts that have an expires_at set
  const items = await CartItem.findAll({
    include: [
      {
        model: Cart,
        as: "cart",
        where: { status: "active" },
        attributes: ["user_id"],
      },
    ],
    where: {
      expires_at: { [Op.ne]: null },
    },
    attributes: ["id", "expires_at"],
  });

  const expiredIds = [];

  // userId → { 7: count, 1: count }
  // Accumulate per-user counts so we send one batched push per trigger.
  const userWarnings = new Map();

  for (const item of items) {
    const expiresAt = new Date(item.expires_at);
    const msLeft = expiresAt.getTime() - now.getTime();
    const remainingDays = Math.ceil(msLeft / DAY_MS);

    console.log(
      `[CartExpiry] Item ID: ${item.id}, User ID: ${item.cart.user_id}, Expires At: ${item.expires_at}, Remaining Days: ${remainingDays}`,
    );

    if (remainingDays <= 0) {
      expiredIds.push(item.id);
      continue;
    }

    if (WARN_AT_REMAINING_DAYS.includes(remainingDays)) {
      const userId = item.cart.user_id;
      if (!userWarnings.has(userId)) userWarnings.set(userId, {});
      const bucket = userWarnings.get(userId);
      bucket[remainingDays] = (bucket[remainingDays] || 0) + 1;
    }
  }

  // ── 1. Delete expired items ────────────────────────────────────────────────
  if (expiredIds.length) {
    await CartItem.destroy({ where: { id: expiredIds } });
    console.log(
      `[CartExpiry] Removed ${expiredIds.length} expired cart item(s).`,
    );
  }

  if (!userWarnings.size) {
    console.log("[CartExpiry] No warnings to send today.");
    return;
  }

  // ── 2. Send push notifications per user ───────────────────────────────────
  for (const [userId, bucket] of userWarnings.entries()) {
    // 7-day warning  (item created 23 days ago, 7 days remain)
    if (bucket[7]) {
      const count = bucket[7];
      await sendToUser(userId, {
        title: "⏰ Cart Reminder – 1 Week Left",
        body:
          `You have ${count} item${count > 1 ? "s" : ""} in your cart expiring in 7 days. ` +
          "Complete your purchase before they are removed!",
        data: {
          type: NOTIFICATION_TYPES.CART_REMINDER,
          trigger: "7_days",
          item_count: String(count),
        },
      });
      console.log(
        `[CartExpiry] 7-day warning → user ${userId} (${count} item(s)).`,
      );
    }

    // 24-hour warning  (item created 30 days ago, expires tomorrow)
    if (bucket[1]) {
      const count = bucket[1];
      await sendToUser(userId, {
        title: "🚨 Last Chance – Cart Expires in 24 Hours",
        body:
          `You have ${count} item${count > 1 ? "s" : ""} in your cart expiring in less than 24 hours. ` +
          "Check out now before they are removed!",
        data: {
          type: NOTIFICATION_TYPES.CART_REMINDER,
          trigger: "24_hours",
          item_count: String(count),
        },
      });
      console.log(
        `[CartExpiry] 24-hour warning → user ${userId} (${count} item(s)).`,
      );
    }
  }
}

module.exports = { runCartExpiryNotifications };
