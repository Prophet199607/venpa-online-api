const { ContactUs } = require("../models");
const {
  getTransporter,
  generateContactEmailHtml,
  sendContactUsEmail,
} = require("../services/notifications/emailService");

/**
 * Handles contact us submissions.
 * Stores the message in the ContactUs table and emails the admin (.env.CONTACT_ADMIN_EMAIL).
 */
exports.createContactMessage = async (req, res, next) => {
  try {
    const { name, email, subject, message } = req.body;
    if (!name || !email || !subject || !message) {
      return res.status(400).json({ message: "All fields are required" });
    }

    const record = await ContactUs.create({
      name: String(name).trim(),
      email: String(email).trim(),
      subject: String(subject).trim(),
      message: String(message).trim(),
      created_at: new Date(),
      updated_at: new Date(),
    });

    // Send email with contact us data to admin (.env.CONTACT_ADMIN_EMAIL)
    try {
      await sendContactUsEmail({
        name: record.name,
        email: record.email,
        subject: record.subject,
        message: record.message,
        id: record.id,
        created_at: record.created_at,
      });
    } catch (mailError) {
      console.error(
        `[ContactUs] Failed to send email to admin for message #${record.id}:`,
        mailError,
      );
    }

    return res.status(201).json({ message: "Message received", id: record.id });
  } catch (e) {
    next(e);
  }
};
