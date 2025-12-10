const nodemailer = require("nodemailer");

// Create transporter with Gmail SMTP
const transporter = nodemailer.createTransport({
  host: "smtp.gmail.com",
  port: 465,
  secure: true,
  
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_APP_PASSWORD,
  },
});

// Verify connection configuration
transporter.verify((error, success) => {
  if (error) {
    console.log("Email configuration error:", error.message);
    
  } else {
    console.log("Email server is ready to send messages");
  }
});

// Send password reset email
const sendPasswordResetEmail = async (email, resetCode) => {
  const mailOptions = {
    from: `"SweetNest" <${process.env.EMAIL_USER}>`,
    to: email,
    subject: "Password Reset Code - SweetNest",
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #333; text-align: center;">Password Reset Request</h2>
        <p style="color: #666;">You requested to reset your password. Use the code below to reset it:</p>
        <div style="background-color: #f5f5f5; padding: 20px; text-align: center; margin: 20px 0;">
          <h1 style="color: #333; letter-spacing: 8px; margin: 0;">${resetCode}</h1>
        </div>
        <p style="color: #666;">This code will expire in <strong>10 minutes</strong>.</p>
        <p style="color: #999; font-size: 12px;">If you didn't request this, please ignore this email.</p>
      </div>
    `,
  };

  await transporter.sendMail(mailOptions);
};

module.exports = { sendPasswordResetEmail };
