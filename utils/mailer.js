const nodemailer = require("nodemailer");
const fs = require("fs");
const path = require("path");

const transporter =
  nodemailer.createTransport({
    host: process.env.SMTP_HOST,

    port: Number(
      process.env.SMTP_PORT || 587
    ),

    secure:
      String(
        process.env.SMTP_SECURE
      ) === "true",

    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });

const escapeHtml = (value) => {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
};

const sendPasswordEmail = async ({
  name,
  email,
  password,
  passwordSource = "Password Reset",
  subject,
}) => {
  const templatePath = path.join(
    __dirname,
    "../templates/passwordChanged.html"
  );

  let html =
    await fs.promises.readFile(
      templatePath,
      "utf8"
    );

  // Date: 07 September 2026
  const now = new Date();

  const datePart =
    now.toLocaleDateString(
      "en-GB",
      {
        day: "2-digit",
        month: "long",
        year: "numeric",
        timeZone: "Asia/Kolkata",
      }
    );

  // Time: 05:30 PM
  const timePart =
    now.toLocaleTimeString(
      "en-US",
      {
        hour: "2-digit",
        minute: "2-digit",
        hour12: true,
        timeZone: "Asia/Kolkata",
      }
    );

  const formattedDate =
    `${datePart}, ${timePart}`;

  // Replaces HTML template placeholders
  html = html
    .replaceAll(
      "{{name}}",
      escapeHtml(name)
    )
    .replaceAll(
      "{{email}}",
      escapeHtml(email)
    )
    .replaceAll(
      "{{newPassword}}",
      escapeHtml(password)
    )
    .replaceAll(
      "{{passwordSource}}",
      escapeHtml(passwordSource)
    )
    .replaceAll(
      "{{formattedDate}}",
      escapeHtml(formattedDate)
    );

  return transporter.sendMail({
    from:
      process.env.MAIL_FROM ||
      process.env.SMTP_USER,

    to: email,

    subject:
      subject ||
      "Your ProdTrack password",

    html,
  });
};

module.exports = {
  sendPasswordEmail,
};