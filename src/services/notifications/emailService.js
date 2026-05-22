const nodemailer = require("nodemailer");

function getTransporter() {
  return nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS,
    },
  });
}
exports.getTransporter = getTransporter;

function buildItemsRows(cartItems) {
  if (!cartItems || cartItems.length === 0) return "";
  const imageBaseUrl = process.env.PRODUCT_IMAGE_BASE_URL || "";

  return cartItems
    .map((item) => {
      const product = item.product || {};
      const unitPrice = Number(product.selling_price || 0);
      const qty = Number(item.quantity || 1);
      const subtotal = unitPrice * qty;

      const formattedUnitPrice = unitPrice.toLocaleString("en-US", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      });
      const formattedSubtotal = subtotal.toLocaleString("en-US", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      });

      let imageUrl = null;
      if (product.prod_image) {
        if (
          product.prod_image.startsWith("http://") ||
          product.prod_image.startsWith("https://")
        ) {
          imageUrl = product.prod_image;
        } else {
          const cleanBaseUrl = imageBaseUrl.endsWith("/")
            ? imageBaseUrl.slice(0, -1)
            : imageBaseUrl;
          const cleanProdImage = product.prod_image.startsWith("/")
            ? product.prod_image.slice(1)
            : product.prod_image;
          imageUrl = `${cleanBaseUrl}/${cleanProdImage}`;
        }
      }

      return `
      <tr>
        <td class="item-row-td" style="padding: 10px 16px; border-bottom: 1px solid #f0f0f0; text-align: center;">
          <img src="${imageUrl}" alt="${product.prod_name}" width="40" height="auto" style="object-fit: cover; border-radius: 4px; display: block; margin: 0 auto;" />
        </td>
        <td class="item-row-td" style="padding: 10px 16px; border-bottom: 1px solid #f0f0f0; color: #374151; font-size: 13px;">
          ${product.prod_name}
        </td>
        <td class="item-row-td" style="padding: 10px 16px; border-bottom: 1px solid #f0f0f0; color: #374151; font-size: 13px; text-align: center;">
          ${qty}
        </td>
        <td class="item-row-td" style="padding: 10px 16px; border-bottom: 1px solid #f0f0f0; color: #374151; font-size: 13px; text-align: right;">
          Rs. ${formattedUnitPrice}
        </td>
        <td class="item-row-td" style="padding: 10px 16px; border-bottom: 1px solid #f0f0f0; color: #111827; font-size: 13px; font-weight: 600; text-align: right;">
          Rs. ${formattedSubtotal}
        </td>
      </tr>
    `;
    })
    .join("");
}

/**
 * Generates the Order Invoice HTML
 */
function generateOrderInvoiceHtml(
  user,
  checkoutData,
  cartItems = [],
  logoUrl = "",
  statusTitle = "Order Confirmed!",
) {
  let paymentMethod = "N/A";
  let paymentBadgeColor = "#6B7280";

  if (checkoutData.type === 1) {
    paymentMethod = "Cash on Delivery";
    paymentBadgeColor = "#10B981";
  } else if (checkoutData.type === 2) {
    paymentMethod = "Card Payment (PayHere)";
    paymentBadgeColor = "#6366F1";
  } else if (checkoutData.type === 3) {
    paymentMethod = "Mintpay";
    paymentBadgeColor = "#003C71";
  }
  const brandColor = "#0d5b82";

  const orderTypeDisplay =
    checkoutData.type_name === "delivery" ||
    checkoutData.type_name === "checkout"
      ? "Delivery"
      : "Collect from Store";

  const payload = checkoutData.payload || {};
  const totals = payload.totals || {};

  const subTotal =
    totals.subTotal ||
    cartItems.reduce((acc, item) => {
      return (
        acc +
        Number(item.product?.selling_price || 0) * Number(item.quantity || 1)
      );
    }, 0);

  const productDiscountTotal = Number(totals.productDiscountTotal || 0);
  const originalSubTotal = totals.originalSubTotal
    ? Number(totals.originalSubTotal)
    : subTotal + productDiscountTotal;

  const discountAmount = Number(
    totals.discountAmount || checkoutData.discount_amount || 0,
  );
  const codCharge = Number(totals.codCharge || 0);
  const courierCharge = Number(totals.courierCharge || 0);

  let finalTotal = Number(checkoutData.net_amount || 0);
  if (!finalTotal) {
    if (checkoutData.type === 1) {
      // COD
      finalTotal =
        totals.netTotalWithCod ||
        subTotal + courierCharge + codCharge - discountAmount;
    } else {
      // Card (2) or Mintpay (3)
      finalTotal =
        totals.netTotalWithoutCod || subTotal + courierCharge - discountAmount;
    }
  }

  const itemsSection =
    cartItems.length > 0
      ? `
      <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse: collapse;">
        <thead>
          <tr class="items-table-head" style="background-color: #F9FAFB;">
            <th class="items-head-th" style="padding: 10px 16px; text-align: center; font-size: 11px; font-weight: 600; color: #6B7280; text-transform: uppercase; letter-spacing: 0.05em; border-bottom: 1px solid #E5E7EB; width: 60px;">Image</th>
            <th class="items-head-th" style="padding: 10px 16px; text-align: left; font-size: 11px; font-weight: 600; color: #6B7280; text-transform: uppercase; letter-spacing: 0.05em; border-bottom: 1px solid #E5E7EB;">Product</th>
            <th class="items-head-th" style="padding: 10px 16px; text-align: center; font-size: 11px; font-weight: 600; color: #6B7280; text-transform: uppercase; letter-spacing: 0.05em; border-bottom: 1px solid #E5E7EB;">Qty</th>
            <th class="items-head-th" style="padding: 10px 16px; text-align: right; font-size: 11px; font-weight: 600; color: #6B7280; text-transform: uppercase; letter-spacing: 0.05em; border-bottom: 1px solid #E5E7EB;">Unit</th>
            <th class="items-head-th" style="padding: 10px 16px; text-align: right; font-size: 11px; font-weight: 600; color: #6B7280; text-transform: uppercase; letter-spacing: 0.05em; border-bottom: 1px solid #E5E7EB;">Subtotal</th>
          </tr>
        </thead>
        <tbody>
          ${buildItemsRows(cartItems)}
        </tbody>
        <tfoot>
          ${
            productDiscountTotal > 0
              ? `
          <tr>
            <td colspan="4" class="value-text" style="padding: 8px 16px; text-align: right; font-size: 13px; font-weight: 500; color: #6B7280;">Item Total (Original):</td>
            <td class="value-text" style="padding: 8px 16px; text-align: right; font-size: 14px; font-weight: 600; color: #374151;">Rs. ${originalSubTotal.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
          </tr>
          <tr>
            <td colspan="4" class="value-text" style="padding: 8px 16px; text-align: right; font-size: 13px; font-weight: 500; color: #DC2626;">Product Discount:</td>
            <td class="value-text" style="padding: 8px 16px; text-align: right; font-size: 14px; font-weight: 600; color: #DC2626;">- Rs. ${productDiscountTotal.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
          </tr>
          `
              : ""
          }
          <tr>
            <td colspan="4" class="value-text" style="padding: 8px 16px; text-align: right; font-size: 13px; font-weight: 500; color: #6B7280;">Sub Total:</td>
            <td class="value-text" style="padding: 8px 16px; text-align: right; font-size: 14px; font-weight: 600; color: #374151;">Rs. ${subTotal.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
          </tr>
          ${
            discountAmount > 0
              ? `
          <tr>
            <td colspan="4" class="value-text" style="padding: 8px 16px; text-align: right; font-size: 13px; font-weight: 500; color: #DC2626;">Coupon Discount:</td>
            <td class="value-text" style="padding: 8px 16px; text-align: right; font-size: 14px; font-weight: 600; color: #DC2626;">- Rs. ${discountAmount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
          </tr>
          `
              : ""
          }
          ${
            courierCharge > 0
              ? `
          <tr>
            <td colspan="4" class="value-text" style="padding: 8px 16px; text-align: right; font-size: 13px; font-weight: 500; color: #6B7280;">Shipping:</td>
            <td class="value-text" style="padding: 8px 16px; text-align: right; font-size: 14px; font-weight: 600; color: #374151;">Rs. ${courierCharge.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
          </tr>
          `
              : ""
          }
          ${
            checkoutData.type === 1 && codCharge > 0
              ? `
          <tr>
            <td colspan="4" class="value-text" style="padding: 8px 16px; text-align: right; font-size: 13px; font-weight: 500; color: #6B7280;">COD Charge:</td>
            <td class="value-text" style="padding: 8px 16px; text-align: right; font-size: 14px; font-weight: 600; color: #374151;">Rs. ${codCharge.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
          </tr>
          `
              : ""
          }
          <tr>
            <td colspan="4" class="value-text" style="padding: 12px 16px; text-align: right; font-size: 14px; font-weight: 700; color: #111827; border-top: 1px solid #E5E7EB;">Net Total:</td>
            <td class="value-text" style="padding: 12px 16px; text-align: right; font-size: 16px; font-weight: 800; color: #111827; border-top: 1px solid #E5E7EB;">Rs. ${finalTotal.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
          </tr>
        </tfoot>
      </table>
    `
      : `<p style="margin: 0; color: #6B7280; font-size: 13px; padding: 12px;">Items: ${
          checkoutData.payload?.prod_codes?.join(", ") || "N/A"
        }</p>`;

  let logoImgTag = "";
  if (logoUrl) {
    logoImgTag = `
      <img
        src="${logoUrl}"
        alt="Venpaa"
        width="110"
        style="display: block; max-width: 110px; height: auto;"
      />
    `;
  }

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Order Confirmation</title>
  <style>
    body { background-color: #F3F4F6 !important; }
    .email-card { background-color: #ffffff !important; }
    .order-details-card { background-color: #F9FAFB !important; border-color: #E5E7EB !important; }
    .row-divider { border-bottom-color: #E5E7EB !important; }
    .label-text { color: #6B7280 !important; }
    .value-text { color: #111827 !important; }
    .item-row-td { border-bottom-color: #f0f0f0 !important; color: #374151 !important; }
    .info-box { background-color: #EFF6FF !important; border-left-color: ${brandColor} !important; border-right-color: ${brandColor} !important; }
    .info-box p { color: #1E40AF !important; }
    .footer-text { color: #9CA3AF !important; }
    .footer-sub { color: #D1D5DB !important; }

    @media (prefers-color-scheme: dark) {
      body { background-color: #111827 !important; }
      .email-card { background-color: #1F2937 !important; }
      .order-details-card { background-color: #374151 !important; border-color: #4B5563 !important; }
      .row-divider { border-bottom-color: #4B5563 !important; }
      .label-text { color: #9CA3AF !important; }
      .value-text { color: #F9FAFB !important; }
      .item-row-td { border-bottom-color: #374151 !important; color: #E5E7EB !important; }
      .items-table-head { background-color: #374151 !important; }
      .items-head-th { color: #9CA3AF !important; border-bottom-color: #4B5563 !important; }
      .info-box { background-color: #1E3A5F !important; border-left-color: ${brandColor} !important; border-right-color: ${brandColor} !important; }
      .info-box p { color: #BFDBFE !important; }
      .footer-text { color: #6B7280 !important; }
      .footer-sub { color: #4B5563 !important; }
    }
  </style>
</head>
<body style="margin: 0; padding: 0; background-color: #F3F4F6; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;">

  <table width="100%" cellpadding="0" cellspacing="0">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" class="email-card" style="background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 20px rgba(0,0,0,0.06); max-width: 600px; width: 100%;">

          <!-- Header Banner -->
          <tr>
            <td style="background: linear-gradient(135deg, #3160c4 0%, ${brandColor} 100%); padding: 12px 24px;">
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td width="110">
                    ${logoImgTag}
                  </td>
                  <td style="padding-left: 16px; text-align: right;">
                    <h1 style="margin: 0 0 2px; color: #ffffff; font-size: 19px; font-weight: 700; letter-spacing: -0.3px; line-height: 1.1;">${statusTitle}</h1>
                    <p style="margin: 0; color: rgba(255,255,255,0.85); font-size: 12px; line-height: 1.2;">Thank you for shopping, ${user.fname || "Customer"}.</p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Order Details -->
          <tr>
            <td style="padding: 16px 24px 0;">
              <h2 style="margin: 0 0 10px; font-size: 15px; font-weight: 700; letter-spacing: -0.2px;" class="value-text">Order Summary</h2>
              <table width="100%" cellpadding="0" cellspacing="0" class="order-details-card" style="border-radius: 8px; overflow: hidden; border: 1px solid #E5E7EB;">
                <tr class="row-divider" style="border-bottom: 1px solid #E5E7EB;">
                  <td style="padding: 10px 16px;">
                    <table width="100%" cellpadding="0" cellspacing="0">
                      <tr>
                        <td class="label-text" style="font-size: 12px;">Order ID</td>
                        <td class="value-text" style="font-size: 13px; font-weight: 600; text-align: right;">#${checkoutData.order_id || checkoutData.pick_and_collect_id}</td>
                      </tr>
                    </table>
                  </td>
                </tr>
                <tr class="row-divider" style="border-bottom: 1px solid #E5E7EB;">
                  <td style="padding: 10px 16px;">
                    <table width="100%" cellpadding="0" cellspacing="0">
                      <tr>
                        <td class="label-text" style="font-size: 12px;">Order Type</td>
                        <td class="value-text" style="font-size: 13px; font-weight: 600; text-align: right;">${orderTypeDisplay}</td>
                      </tr>
                    </table>
                  </td>
                </tr>
                <tr class="row-divider" style="border-bottom: 1px solid #E5E7EB;">
                  <td style="padding: 10px 16px;">
                    <table width="100%" cellpadding="0" cellspacing="0">
                      <tr>
                        <td class="label-text" style="font-size: 12px;">Payment Method</td>
                        <td style="text-align: right;">
                          <span style="display: inline-block; background-color: ${paymentBadgeColor}15; color: ${paymentBadgeColor}; font-size: 11px; font-weight: 600; padding: 2px 8px; border-radius: 20px;">${paymentMethod}</span>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
                <tr>
                  <td style="padding: 10px 16px;">
                    <table width="100%" cellpadding="0" cellspacing="0">
                      <tr>
                        <td class="label-text" style="font-size: 12px;">Order Date & Time</td>
                        <td class="value-text" style="font-size: 13px; font-weight: 500; text-align: right;">${new Date(checkoutData.created_at || Date.now()).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" })}</td>
                      </tr>
                    </table>
                  </td>
                </tr>
                <tr>
                  <td style="padding: 14px 20px;">
                    <table width="100%" cellpadding="0" cellspacing="0">
                      <tr>
                        <td class="label-text" style="font-size: 13px;">Status</td>
                        <td style="text-align: right;">
                          <span style="display: inline-block; background-color: #FEF3C7; color: #92400E; font-size: 12px; font-weight: 600; padding: 3px 10px; border-radius: 20px; text-transform: capitalize;">${checkoutData.payment_status}</span>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Items Ordered -->
          <tr>
            <td style="padding: 16px 24px 0;">
              <h2 style="margin: 0 0 8px; font-size: 15px; font-weight: 700; letter-spacing: -0.2px;" class="value-text">Items</h2>
              <div style="border: 1px solid #E5E7EB; border-radius: 8px; overflow: hidden;">
                ${itemsSection}
              </div>
            </td>
          </tr>
          
          <!-- Footer -->
          <tr>
            <td style="padding: 20px 24px; text-align: center;">
              <p class="footer-text" style="margin: 0 0 4px; font-size: 12px;">© ${new Date().getFullYear()} Venpaa Bookshop. All rights reserved.</p>
              <p class="footer-sub" style="margin: 0; font-size: 11px;">This is an automated email, please do not reply.</p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
  `;
}
exports.generateOrderInvoiceHtml = generateOrderInvoiceHtml;

async function sendOrderConfirmationEmail(user, checkoutData, cartItems = []) {
  if (!user.email) {
    console.error(
      "No email address found for user. Cannot send order confirmation.",
    );
    return;
  }

  const transporter = getTransporter();
  const logoUrl = process.env.EMAIL_LOGO_URL;

  const htmlContent = generateOrderInvoiceHtml(
    user,
    checkoutData,
    cartItems,
    logoUrl,
  );

  try {
    console.log(
      `Attempting to send order confirmation email for Order #${checkoutData.order_id || checkoutData.pick_and_collect_id} to ${user.email}...`,
    );
    const info = await transporter.sendMail({
      from: `"Venpaa Bookshop" <${process.env.EMAIL_USER}>`,
      replyTo: "no-reply@venpaa.lk",
      to: user.email,
      subject: `Order Confirmed #${checkoutData.order_id || checkoutData.pick_and_collect_id} — Venpaa Bookshop`,
      html: htmlContent,
    });
    console.log(`Email sent successfully to ${user.email}: ${info.messageId}`);
  } catch (error) {
    console.error(
      `Email send failed for Order #${checkoutData.order_id || checkoutData.pick_and_collect_id} to ${user.email}:`,
      error,
    );
  }
}
exports.sendOrderConfirmationEmail = sendOrderConfirmationEmail;

async function sendOrderShippedEmail(user, checkoutData, cartItems = []) {
  if (!user.email) {
    console.error(
      "No email address found for user. Cannot send order shipped email.",
    );
    return;
  }

  const transporter = getTransporter();
  const logoUrl = process.env.EMAIL_LOGO_URL;

  const htmlContent = generateOrderInvoiceHtml(
    user,
    checkoutData,
    cartItems,
    logoUrl,
    "Order Shipped!",
  );

  try {
    console.log(
      `Attempting to send order shipped email for Order #${checkoutData.order_id || checkoutData.pick_and_collect_id} to ${user.email}...`,
    );
    const info = await transporter.sendMail({
      from: `"Venpaa Bookshop" <${process.env.EMAIL_USER}>`,
      replyTo: "no-reply@venpaa.lk",
      to: user.email,
      subject: `Order Shipped #${checkoutData.order_id || checkoutData.pick_and_collect_id} — Venpaa Bookshop`,
      html: htmlContent,
    });
    console.log(`Email sent successfully to ${user.email}: ${info.messageId}`);
  } catch (error) {
    console.error(
      `Email send failed for Order #${checkoutData.order_id || checkoutData.pick_and_collect_id} to ${user.email}:`,
      error,
    );
  }
}
exports.sendOrderShippedEmail = sendOrderShippedEmail;

async function sendOrderPlacedEmail(user, checkoutData, cartItems = []) {
  if (!user.email) {
    console.error(
      "No email address found for user. Cannot send order placed email.",
    );
    return;
  }

  const transporter = getTransporter();
  const logoUrl = process.env.EMAIL_LOGO_URL;

  const htmlContent = generateOrderInvoiceHtml(
    user,
    checkoutData,
    cartItems,
    logoUrl,
    "Order Placed Successfully!",
  );

  try {
    console.log(
      `Attempting to send order placed email for Order #${checkoutData.order_id || checkoutData.pick_and_collect_id} to ${user.email}...`,
    );
    const info = await transporter.sendMail({
      from: `"Venpaa Bookshop" <${process.env.EMAIL_USER}>`,
      replyTo: "no-reply@venpaa.lk",
      to: user.email,
      subject: `Order Placed #${checkoutData.order_id || checkoutData.pick_and_collect_id} — Venpaa Bookshop`,
      html: htmlContent,
    });
    console.log(`Email sent successfully to ${user.email}: ${info.messageId}`);
  } catch (error) {
    console.error(
      `Email send failed for Order #${checkoutData.order_id || checkoutData.pick_and_collect_id} to ${user.email}:`,
      error,
    );
  }
}
exports.sendOrderPlacedEmail = sendOrderPlacedEmail;

async function sendOrderCanceledEmail(user, checkoutData, cartItems = []) {
  if (!user.email) {
    console.error(
      "No email address found for user. Cannot send order canceled email.",
    );
    return;
  }

  const transporter = getTransporter();
  const logoUrl = process.env.EMAIL_LOGO_URL;

  const htmlContent = generateOrderInvoiceHtml(
    user,
    checkoutData,
    cartItems,
    logoUrl,
    "Order Canceled",
  );

  try {
    console.log(
      `Attempting to send order canceled email for Order #${checkoutData.order_id || checkoutData.pick_and_collect_id} to ${user.email}...`,
    );
    const info = await transporter.sendMail({
      from: `"Venpaa Bookshop" <${process.env.EMAIL_USER}>`,
      replyTo: "no-reply@venpaa.lk",
      to: user.email,
      subject: `Order Canceled #${checkoutData.order_id || checkoutData.pick_and_collect_id} — Venpaa Bookshop`,
      html: htmlContent,
    });
    console.log(`Email sent successfully to ${user.email}: ${info.messageId}`);
  } catch (error) {
    console.error(
      `Email send failed for Order #${checkoutData.order_id || checkoutData.pick_and_collect_id} to ${user.email}:`,
      error,
    );
  }
}
exports.sendOrderCanceledEmail = sendOrderCanceledEmail;

exports.generateOtpEmailHtml = (code) => {
  const brandColor = "#0d5b82";
  const logoUrl = process.env.EMAIL_LOGO_URL;

  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Your Login Code</title>
      <style>
        body { margin: 0; padding: 0; background-color: #F3F4F6; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; }
        .email-card { background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 20px rgba(0,0,0,0.06); max-width: 500px; width: 100%; margin: 20px auto; }
        .header { background: linear-gradient(135deg, #3160c4 0%, ${brandColor} 100%); padding: 10px; text-align: center; }
        .content { padding: 30px 24px; text-align: center; }
        .otp-code { font-size: 36px; font-weight: 800; color: ${brandColor}; letter-spacing: 8px; margin: 20px 0; padding: 8px; background-color: #F0F7FF; border-radius: 8px; display: inline-block; border: 1px dashed #3160c4; }
        .footer { padding: 20px; text-align: center; color: #9CA3AF; font-size: 11px; }
        @media (prefers-color-scheme: dark) {
          body { background-color: #111827; }
          .email-card { background-color: #1F2937; }
          .content { color: #F9FAFB; }
          .otp-code { background-color: #374151; color: #60A5FA; border-color: #60A5FA; }
        }
      </style>
    </head>
    <body>
      <div class="email-card">
        <div class="header">
          <img src="${logoUrl}" alt="Venpaa" width="90" style="display: block; margin: 0 auto; max-width: 90px; height: auto;" />
        </div>
        <div class="content">
          <h2 style="margin: 0; font-size: 19px; font-weight: 700;">Verify Your Email</h2>
          <p style="color: #6B7280; font-size: 14px; margin-top: 6px; line-height: 1.4;">Use the following code to complete your login or registration. This code is valid for 10 minutes.</p>
          <div class="otp-code">${code}</div>
          <p style="color: #9CA3AF; font-size: 11px; margin-top: 20px;">If you didn't request this, please ignore this email.</p>
        </div>
        <div class="footer">
          <p>© ${new Date().getFullYear()} Venpaa Bookshop. All rights reserved.</p>
        </div>
      </div>
    </body>
    </html>
  `;
};

/**
 * Generates a modern branded HTML email for contact us submissions.
 */
exports.generateContactEmailHtml = ({ name, email, subject, message }) => {
  const brandColor = "#0d5b82";
  const logoUrl = process.env.EMAIL_LOGO_URL;
  const year = new Date().getFullYear();
  const messageHtml = String(message).replace(/\n/g, "<br/>");

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>New Contact Message</title>
  <style>
    body { margin: 0; padding: 0; background-color: #F3F4F6; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; }
    .email-card { background-color: #ffffff !important; }
    .label-text { color: #6B7280 !important; }
    .value-text { color: #111827 !important; }
    .row-divider { border-bottom: 1px solid #E5E7EB !important; }
    .message-box { background-color: #F9FAFB !important; border-color: #E5E7EB !important; }
    .footer-text { color: #9CA3AF !important; }
    @media (prefers-color-scheme: dark) {
      body { background-color: #111827 !important; }
      .email-card { background-color: #1F2937 !important; }
      .label-text { color: #9CA3AF !important; }
      .value-text { color: #F9FAFB !important; }
      .row-divider { border-bottom-color: #4B5563 !important; }
      .message-box { background-color: #374151 !important; border-color: #4B5563 !important; }
      .footer-text { color: #6B7280 !important; }
    }
  </style>
</head>
<body style="margin:0;padding:20px 0;background-color:#F3F4F6;">
  <table width="100%" cellpadding="0" cellspacing="0">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" class="email-card" style="background-color:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 4px 20px rgba(0,0,0,0.06);max-width:600px;width:100%;">

          <!-- Header -->
          <tr>
            <td style="background:linear-gradient(135deg,#3160c4 0%,${brandColor} 100%);padding:14px 24px;">
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td width="110">
                    ${logoUrl ? `<img src="${logoUrl}" alt="Venpaa" width="110" style="display:block;max-width:110px;height:auto;" />` : ""}
                  </td>
                  <td style="padding-left:16px;text-align:right;">
                    <h1 style="margin:0 0 2px;color:#ffffff;font-size:18px;font-weight:700;line-height:1.1;">New Contact Message</h1>
                    <p style="margin:0;color:rgba(255,255,255,0.85);font-size:12px;">Someone has submitted a contact form.</p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Details Card -->
          <tr>
            <td style="padding:20px 24px 0;">
              <h2 style="margin:0 0 10px;font-size:14px;font-weight:700;color:#111827;">Contact Details</h2>
              <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #E5E7EB;border-radius:8px;overflow:hidden;">

                <!-- Name -->
                <tr class="row-divider" style="border-bottom:1px solid #E5E7EB;">
                  <td style="padding:10px 16px;">
                    <table width="100%" cellpadding="0" cellspacing="0">
                      <tr>
                        <td class="label-text" style="font-size:12px;color:#6B7280;width:100px;">Name</td>
                        <td class="value-text" style="font-size:13px;font-weight:600;color:#111827;text-align:right;">${name}</td>
                      </tr>
                    </table>
                  </td>
                </tr>

                <!-- Email -->
                <tr class="row-divider" style="border-bottom:1px solid #E5E7EB;">
                  <td style="padding:10px 16px;">
                    <table width="100%" cellpadding="0" cellspacing="0">
                      <tr>
                        <td class="label-text" style="font-size:12px;color:#6B7280;width:100px;">Email</td>
                        <td style="text-align:right;">
                          <a href="mailto:${email}" style="font-size:13px;font-weight:600;color:${brandColor};text-decoration:none;">${email}</a>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>

                <!-- Subject -->
                <tr>
                  <td style="padding:10px 16px;">
                    <table width="100%" cellpadding="0" cellspacing="0">
                      <tr>
                        <td class="label-text" style="font-size:12px;color:#6B7280;width:100px;">Subject</td>
                        <td class="value-text" style="font-size:13px;font-weight:600;color:#111827;text-align:right;">${subject}</td>
                      </tr>
                    </table>
                  </td>
                </tr>

              </table>
            </td>
          </tr>

          <!-- Message -->
          <tr>
            <td style="padding:16px 24px 0;">
              <h2 style="margin:0 0 8px;font-size:14px;font-weight:700;color:#111827;">Message</h2>
              <div class="message-box" style="background-color:#F9FAFB;border:1px solid #E5E7EB;border-radius:8px;padding:14px 16px;">
                <p class="value-text" style="margin:0;font-size:13px;color:#374151;line-height:1.7;">${messageHtml}</p>
              </div>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding:20px 24px;text-align:center;">
              <p class="footer-text" style="margin:0 0 4px;font-size:12px;color:#9CA3AF;">© ${year} Venpaa Bookshop. All rights reserved.</p>
              <p style="margin:0;font-size:11px;color:#D1D5DB;">This is an automated notification email.</p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `;
};
