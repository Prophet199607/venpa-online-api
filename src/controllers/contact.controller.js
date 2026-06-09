const { ContactUs } = require("../models");
const {
  getTransporter,
  generateContactEmailHtml,
} = require("../services/notifications/emailService");

/**
 * Handles contact us submissions.
 * Stores the message in the ContactUs table and emails the admin..
 */
exports.createContactMessage = async (req, res, next) => {
  try {
    const { name, email, subject, message } = req.body;
    if (!name || !email || !subject || !message) {
      return res.status(400).json({ message: "All fields are required" });
    }

    const record = await ContactUs.create({
      name,
      email,
      subject,
      message,
      created_at: new Date(),
      updated_at: new Date(),
    });

    // Send email to admin
    const transporter = getTransporter();
    const adminEmail = "venpaabookshop@gmail.com";
    const html = generateContactEmailHtml({ name, email, subject, message });
    await transporter.sendMail({
      from: `Venpaa Bookshop <${process.env.EMAIL_USER}>`,
      replyTo: `${name} <${email}>`,
      to: adminEmail,
      subject: `Contact Us: ${subject}`,
      html,
    });

    return res.status(201).json({ message: "Message received", id: record.id });
  } catch (e) {
    next(e);
  }
};
