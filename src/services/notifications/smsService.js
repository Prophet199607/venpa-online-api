const axios = require("axios");

/**
 * Send SMS OTP using Dialog e-SMS gateway
 * @param {string} phone - Recipient phone number (e.g. 759888883)
 * @param {string} message - Message content
 */
exports.sendSms = async (phone, message) => {
  try {
    const apiKey = process.env.SMS_API_KEY;
    const sourceAddress = process.env.SMS_SOURCE_ADDRESS || "Venpaa";

    // Clean phone number - the gateway seems to expect 9 digits (e.g. 75xxxxxxx)
    // If it comes with leading 0 or +94, we should strip it.
    let cleanPhone = phone.replace(/\D/g, "");
    if (cleanPhone.startsWith("94")) {
      cleanPhone = cleanPhone.substring(2);
    } else if (cleanPhone.startsWith("0")) {
      cleanPhone = cleanPhone.substring(1);
    }

    const url = `https://e-sms.dialog.lk/api/v1/message-via-url/CREATE/url-campaign`;

    const params = {
      esmsqk: apiKey,
      list: cleanPhone,
      source_address: sourceAddress,
      message: message,
    };

    console.log(`Sending SMS to ${cleanPhone}: ${message}`);

    const response = await axios.get(url, { params });

    // The response might be a string or JSON depending on the gateway
    console.log("SMS Gateway Response:", response.data);

    return { success: true, data: response.data };
  } catch (error) {
    console.error("SMS Sending Error:", error.response?.data || error.message);
    return { success: false, error: error.message };
  }
};
