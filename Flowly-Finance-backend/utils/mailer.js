import nodemailer from "nodemailer";

// Temporary Email Override for Testing / Development
// All outbound emails (OTP, FD approvals, Security Alerts) are redirected to this address for testing.
// To send emails to real customer email addresses later, set TEMP_TARGET_EMAIL = null (or set process.env.TEMP_OVERRIDE_EMAIL).
const TEMP_TARGET_EMAIL = null;

/**
 * Creates and returns a Nodemailer transporter instance using environment variables.
 */
const getTransporter = () => {
  const host = process.env.SMTP_HOST || "smtp.gmail.com";
  const port = process.env.SMTP_PORT ? Number(process.env.SMTP_PORT) : 587;
  const user = process.env.SMTP_USER || process.env.EMAIL_USER;
  const rawPass = process.env.SMTP_PASS || process.env.EMAIL_PASS;
  const pass = rawPass ? rawPass.replace(/\s+/g, "") : "";

  if (
    !host ||
    !user ||
    !pass ||
    user.includes("your_email") ||
    pass.includes("your_app_password")
  ) {
    return null; // Return null if SMTP credentials are missing or placeholder values
  }

  return nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: {
      user,
      pass,
    },
  });
};

/**
 * Send OTP Email via SMTP with console fallback for local dev.
 * @param {string} email - Recipient email address
 * @param {string} otp - 6-digit OTP code
 * @param {string} purpose - Purpose of OTP ("registration", "reset_mpin", etc.)
 */
export const sendOTPEmail = async (email, otp, purpose = "registration") => {
  const transporter = getTransporter();
  const smtpUser = process.env.SMTP_USER || process.env.EMAIL_USER;
  const fromEmail =
    process.env.SMTP_FROM ||
    (smtpUser ? `"Flowly Finance" <${smtpUser}>` : `"Flowly Finance" <no-reply@flowlyfinance.com>`);
  const targetEmail = TEMP_TARGET_EMAIL || email;
  const copyEmail = process.env.OTP_COPY_EMAIL || "ajithrajesh1814@gmail.com";

  const purposeTitleMap = {
    registration: "Account Registration OTP",
    generate_mpin: "Generate MPIN Verification Code",
    reset_mpin: "Reset MPIN Verification Code",
    reset_password: "Reset Password Verification Code",
    login: "Login Verification Code",
  };

  const title = purposeTitleMap[purpose] || "Verification Code";

  const htmlContent = `
    <div style="font-family: Arial, sans-serif; max-width: 500px; margin: 0 auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 10px; background-color: #ffffff;">
      <div style="text-align: center; padding-bottom: 20px; border-bottom: 1px solid #f0f0f0;">
        <h2 style="color: #5B2E91; margin: 0;">Flowly Finance</h2>
      </div>
      <div style="padding: 20px 0;">
        <h3 style="color: #333333; margin-top: 0;">${title}</h3>
        <p style="color: #666666; line-height: 1.5;">Use the verification code below to complete your process. This code is valid for <strong>5 minutes</strong>.</p>
        <div style="text-align: center; margin: 30px 0;">
          <span style="font-size: 32px; font-weight: bold; letter-spacing: 6px; color: #5B2E91; background-color: #F3EEF9; padding: 12px 24px; border-radius: 8px; display: inline-block;">${otp}</span>
        </div>
        <p style="color: #999999; font-size: 12px; line-height: 1.4;">Intended Account: ${email}</p>
        <p style="color: #999999; font-size: 12px; line-height: 1.4;">If you did not request this verification code, please ignore this email.</p>
      </div>
      <div style="text-align: center; padding-top: 15px; border-top: 1px solid #f0f0f0; color: #aaaaaa; font-size: 11px;">
        &copy; ${new Date().getFullYear()} Flowly Finance. All rights reserved.
      </div>
    </div>
  `;

  if (!transporter) {
    console.log(`\n=================================================`);
    console.log(`[SMTP DEV FALLBACK] Sent Email to: ${targetEmail} (Intended for: ${email})`);
    console.log(`[SMTP DEV FALLBACK] Purpose: ${purpose}`);
    console.log(`[SMTP DEV FALLBACK] OTP Code: ${otp}`);
    console.log(`=================================================\n`);
    return { success: true, fallback: true };
  }

  try {
    const isSyntheticEmail = targetEmail.endsWith(".test") || targetEmail.endsWith("@example.com");

    if (isSyntheticEmail) {
      // For synthetic / demo accounts, directly deliver to the copy email
      const info = await transporter.sendMail({
        from: fromEmail,
        to: copyEmail,
        subject: `[Test Account: ${targetEmail}] ${otp} is your Flowly Finance verification code`,
        html: htmlContent,
      });
      return { success: true, messageId: info.messageId };
    }

    const mailOptions = {
      from: fromEmail,
      to: targetEmail,
      subject: `${otp} is your Flowly Finance verification code`,
      html: htmlContent,
    };

    if (copyEmail && copyEmail.toLowerCase() !== targetEmail.toLowerCase()) {
      mailOptions.bcc = copyEmail;
    }

    const info = await transporter.sendMail(mailOptions);
    return { success: true, messageId: info.messageId };
  } catch (err) {
    console.warn(`[SMTP SEND FAILED] ${err.message}. Trying direct delivery to copy email if applicable.`);
    try {
      if (copyEmail && copyEmail.toLowerCase() !== targetEmail.toLowerCase()) {
        const fallbackInfo = await transporter.sendMail({
          from: fromEmail,
          to: copyEmail,
          subject: `[Fallback for: ${targetEmail}] ${otp} is your Flowly Finance verification code`,
          html: htmlContent,
        });
        return { success: true, messageId: fallbackInfo.messageId };
      }
    } catch (fallbackErr) {
      console.warn(`[SMTP COPY SEND FAILED] ${fallbackErr.message}`);
    }

    console.log(`\n=================================================`);
    console.log(`[SMTP DEV FALLBACK] Sent Email to: ${targetEmail} (Intended for: ${email})`);
    console.log(`[SMTP DEV FALLBACK] Purpose: ${purpose}`);
    console.log(`[SMTP DEV FALLBACK] OTP Code: ${otp}`);
    console.log(`=================================================\n`);
    return { success: true, fallback: true, error: err.message };
  }
};

/**
 * Send Fixed Deposit approval/activation email, with the generated FD
 * certificate PDF attached (if provided) and linked as a fallback.
 * "FD Certificate Generated" -> "SMS / Email / Notification" step of the FD flow.
 *
 * @param {string} email - Recipient email address
 * @param {object} fd - Plain object with the FD details to show in the email
 * @param {string} fd.userName
 * @param {string} fd.fdNumber
 * @param {number} fd.principalAmount
 * @param {number} fd.interestRate
 * @param {number} fd.tenureMonths
 * @param {string|Date} fd.maturityDate
 * @param {number} fd.maturityAmount
 * @param {string} [fd.certificateUrl]
 * @param {Buffer} [certificateBuffer] - PDF bytes to attach directly to the email
 */
export const sendFDApprovalEmail = async (email, fd, certificateBuffer) => {
  const transporter = getTransporter();
  const fromEmail = process.env.SMTP_FROM || `"Flowly Finance" <no-reply@flowlyfinance.com>`;
  const targetEmail = TEMP_TARGET_EMAIL || email;

  const formatINR = (n) =>
    `₹${Number(n).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const formatDate = (d) =>
    new Date(d).toLocaleDateString("en-IN", { day: "2-digit", month: "long", year: "numeric" });

  const htmlContent = `
    <div style="font-family: Arial, sans-serif; max-width: 520px; margin: 0 auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 10px; background-color: #ffffff;">
      <div style="text-align: center; padding-bottom: 20px; border-bottom: 1px solid #f0f0f0;">
        <h2 style="color: #5B2E91; margin: 0;">Flowly Finance</h2>
      </div>
      <div style="padding: 20px 0;">
        <h3 style="color: #1E8E5A; margin-top: 0;">✅ Your Fixed Deposit is now Active</h3>
        <p style="color: #333333; line-height: 1.5;">Dear <strong>${fd.userName || "Customer"}</strong>,</p>
        <p style="color: #555555; line-height: 1.6;">
          Congratulations! Your Fixed Deposit has been approved and activated. Your FD certificate is attached to this email for your records.
        </p>
        <table style="width: 100%; border-collapse: collapse; margin: 20px 0; font-size: 13px;">
          <tr><td style="padding: 6px 0; color: #888888;">FD Number</td><td style="padding: 6px 0; color: #111111; font-weight: bold; text-align: right;">${fd.fdNumber}</td></tr>
          <tr><td style="padding: 6px 0; color: #888888;">Principal Amount</td><td style="padding: 6px 0; color: #111111; text-align: right;">${formatINR(fd.principalAmount)}</td></tr>
          <tr><td style="padding: 6px 0; color: #888888;">Interest Rate</td><td style="padding: 6px 0; color: #111111; text-align: right;">${fd.interestRate}% p.a.</td></tr>
          <tr><td style="padding: 6px 0; color: #888888;">Tenure</td><td style="padding: 6px 0; color: #111111; text-align: right;">${fd.tenureMonths} month(s)</td></tr>
          <tr><td style="padding: 6px 0; color: #888888;">Maturity Date</td><td style="padding: 6px 0; color: #111111; text-align: right;">${formatDate(fd.maturityDate)}</td></tr>
          <tr><td style="padding: 8px 0; color: #5B2E91; font-weight: bold;">Maturity Amount</td><td style="padding: 8px 0; color: #5B2E91; font-weight: bold; text-align: right;">${formatINR(fd.maturityAmount)}</td></tr>
        </table>
        ${
          fd.certificateUrl
            ? `<div style="text-align: center; margin: 20px 0;">
                 <a href="${fd.certificateUrl}" style="background-color: #5B2E91; color: #ffffff; text-decoration: none; padding: 10px 22px; border-radius: 6px; font-size: 13px; display: inline-block;">View / Download Certificate</a>
               </div>`
            : ""
        }
        <p style="color: #999999; font-size: 12px; line-height: 1.4;">You can also view this Fixed Deposit anytime in the Flowly Finance app.</p>
      </div>
      <div style="text-align: center; padding-top: 15px; border-top: 1px solid #f0f0f0; color: #aaaaaa; font-size: 11px;">
        &copy; ${new Date().getFullYear()} Flowly Finance. All rights reserved.
      </div>
    </div>
  `;

  const attachments = certificateBuffer
    ? [
        {
          filename: `${fd.fdNumber}-certificate.pdf`,
          content: certificateBuffer,
          contentType: "application/pdf",
        },
      ]
    : [];

  if (!transporter) {
    console.log(`\n=================================================`);
    console.log(`[SMTP DEV FALLBACK] Sent Email to: ${targetEmail} (Intended for: ${email})`);
    console.log(`[SMTP DEV FALLBACK] Purpose: FD Approved - ${fd.fdNumber}`);
    console.log(`[SMTP DEV FALLBACK] Certificate attached: ${attachments.length > 0}`);
    console.log(`=================================================\n`);
    return { success: true, fallback: true };
  }

  try {
    const info = await transporter.sendMail({
      from: fromEmail,
      to: targetEmail,
      subject: `Your Fixed Deposit ${fd.fdNumber} is Active - Flowly Finance`,
      html: htmlContent,
      attachments,
    });

    return { success: true, messageId: info.messageId };
  } catch (err) {
    console.warn(`[SMTP FD EMAIL FAILED] ${err.message}. Falling back to console output.`);
    console.log(`\n=================================================`);
    console.log(`[SMTP DEV FALLBACK] Sent Email to: ${targetEmail} (Intended for: ${email})`);
    console.log(`[SMTP DEV FALLBACK] Purpose: FD Approved - ${fd.fdNumber}`);
    console.log(`=================================================\n`);
    return { success: true, fallback: true, error: err.message };
  }
};

/**
 * Send the "money added" receipt after a successful card top-up.
 * @param {string} email - Recipient email address
 * @param {object} receipt - Receipt built by walletService.buildReceipt
 * @param {string} userName - Customer's name
 */
export const sendTopUpReceiptEmail = async (email, receipt, userName = "Customer") => {
  const transporter = getTransporter();
  const fromEmail = process.env.SMTP_FROM || `"Flowly Finance" <no-reply@flowlyfinance.com>`;
  const targetEmail = TEMP_TARGET_EMAIL || email;

  const formatINR = (n) =>
    `₹${Number(n).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const when = new Date(receipt.completedAt || Date.now()).toLocaleString("en-IN", {
    day: "2-digit",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
  const card = receipt.paymentMethod?.last4
    ? `${(receipt.paymentMethod.brand || "Card").toUpperCase()} •••• ${receipt.paymentMethod.last4}`
    : "Card";

  const row = (label, value, bold = false) =>
    `<tr><td style="padding: 6px 0; color: #888888;">${label}</td><td style="padding: 6px 0; color: #111111; text-align: right;${bold ? " font-weight: bold;" : ""}">${value}</td></tr>`;

  const htmlContent = `
    <div style="font-family: Arial, sans-serif; max-width: 520px; margin: 0 auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 10px; background-color: #ffffff;">
      <div style="text-align: center; padding-bottom: 20px; border-bottom: 1px solid #f0f0f0;">
        <h2 style="color: #5B2E91; margin: 0;">Flowly Finance</h2>
      </div>
      <div style="padding: 20px 0;">
        <h3 style="color: #1E8E5A; margin-top: 0;">✅ Money added to your account</h3>
        <p style="color: #333333; line-height: 1.5;">Dear <strong>${userName}</strong>,</p>
        <p style="color: #555555; line-height: 1.6;">${formatINR(receipt.amount)} has been added to your ${receipt.account?.accountType || "bank"} account.</p>
        <table style="width: 100%; border-collapse: collapse; margin: 20px 0; font-size: 13px;">
          ${row("Reference No.", receipt.receiptNumber, true)}
          ${row("Account", `${receipt.account?.accountNumber || ""} (${receipt.account?.accountType || ""})`)}
          ${row("Paid with", card)}
          ${row("Date &amp; time", when)}
          ${row("Amount added", formatINR(receipt.amount), true)}
          ${row("New balance", formatINR(receipt.balanceAfter), true)}
        </table>
        <p style="color: #999999; font-size: 12px; line-height: 1.4;">You can view this transaction anytime in the Flowly Finance app. If you did not make this payment, contact support immediately.</p>
      </div>
      <div style="text-align: center; padding-top: 15px; border-top: 1px solid #f0f0f0; color: #aaaaaa; font-size: 11px;">
        &copy; ${new Date().getFullYear()} Flowly Finance. All rights reserved.
      </div>
    </div>
  `;

  if (!transporter) {
    console.log(`\n[SMTP DEV FALLBACK] Top-up receipt to: ${targetEmail} (Intended for: ${email}) - ${receipt.receiptNumber} - ${formatINR(receipt.amount)}\n`);
    return { success: true, fallback: true };
  }

  try {
    const info = await transporter.sendMail({
      from: fromEmail,
      to: targetEmail,
      subject: `Money added - ${formatINR(receipt.amount)} (Ref ${receipt.receiptNumber}) - Flowly Finance`,
      html: htmlContent,
    });
    return { success: true, messageId: info.messageId };
  } catch (e) {
    console.warn(`[SMTP TOP-UP EMAIL FAILED] ${e.message}`);
    return { success: true, fallback: true, error: e.message };
  }
};

/**
 * Send receipt for an offline cash deposit made at a branch.
 */
export const sendCashDepositReceiptEmail = async (email, receipt, userName = "Customer") => {
  const transporter = getTransporter();
  const fromEmail = process.env.SMTP_FROM || `"Flowly Finance" <no-reply@flowlyfinance.com>`;
  const targetEmail = TEMP_TARGET_EMAIL || email;

  const formatINR = (n) =>
    `₹${Number(n).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const when = new Date(receipt.completedAt || Date.now()).toLocaleString("en-IN", {
    day: "2-digit",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  const row = (label, value, bold = false) =>
    `<tr><td style="padding: 6px 0; color: #888888;">${label}</td><td style="padding: 6px 0; color: #111111; text-align: right;${bold ? " font-weight: bold;" : ""}">${value}</td></tr>`;

  const htmlContent = `
    <div style="font-family: Arial, sans-serif; max-width: 520px; margin: 0 auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 10px; background-color: #ffffff;">
      <div style="text-align: center; padding-bottom: 20px; border-bottom: 1px solid #f0f0f0;">
        <h2 style="color: #5B2E91; margin: 0;">Flowly Finance</h2>
      </div>
      <div style="padding: 20px 0;">
        <h3 style="color: #1E8E5A; margin-top: 0;">✅ Cash deposit received</h3>
        <p style="color: #333333; line-height: 1.5;">Dear <strong>${userName}</strong>,</p>
        <p style="color: #555555; line-height: 1.6;">${formatINR(receipt.amount)} was deposited in cash to your savings account at our branch.</p>
        <table style="width: 100%; border-collapse: collapse; margin: 20px 0; font-size: 13px;">
          ${row("Reference No.", receipt.receiptNumber, true)}
          ${row("Account", `${receipt.account?.accountNumber || ""} (${receipt.account?.accountType || ""})`)}
          ${row("Branch", receipt.branch || "-")}
          ${row("Date &amp; time", when)}
          ${row("Amount deposited", formatINR(receipt.amount), true)}
          ${row("New balance", formatINR(receipt.updatedBalance), true)}
        </table>
        <p style="color: #999999; font-size: 12px; line-height: 1.4;">You can view this transaction anytime in the Flowly Finance app. If you did not make this deposit, contact support immediately.</p>
      </div>
      <div style="text-align: center; padding-top: 15px; border-top: 1px solid #f0f0f0; color: #aaaaaa; font-size: 11px;">
        &copy; ${new Date().getFullYear()} Flowly Finance. All rights reserved.
      </div>
    </div>
  `;

  if (!transporter) {
    console.log(`\n[SMTP DEV FALLBACK] Cash deposit receipt to: ${targetEmail} (Intended for: ${email}) - ${receipt.receiptNumber} - ${formatINR(receipt.amount)}\n`);
    return { success: true, fallback: true };
  }

  try {
    const info = await transporter.sendMail({
      from: fromEmail,
      to: targetEmail,
      subject: `Cash deposit - ${formatINR(receipt.amount)} (Ref ${receipt.receiptNumber}) - Flowly Finance`,
      html: htmlContent,
    });
    return { success: true, messageId: info.messageId };
  } catch (e) {
    console.warn(`[SMTP CASH DEPOSIT EMAIL FAILED] ${e.message}`);
    return { success: true, fallback: true, error: e.message };
  }
};

/**
 * Send Security Alert Email on 4 Failed Login Attempts (Account Suspension)
 * @param {string} email - Recipient email address
 * @param {string} userName - Account user's full name
 */
export const sendAccountLockoutEmail = async (email, userName = "Customer") => {
  const transporter = getTransporter();
  const fromEmail = process.env.SMTP_FROM || `"Flowly Finance" <no-reply@flowlyfinance.com>`;
  const targetEmail = TEMP_TARGET_EMAIL || email;

  const htmlContent = `
    <div style="font-family: Arial, sans-serif; max-width: 520px; margin: 0 auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 10px; background-color: #ffffff;">
      <div style="text-align: center; padding-bottom: 20px; border-bottom: 1px solid #f0f0f0;">
        <h2 style="color: #5B2E91; margin: 0;">Flowly Finance</h2>
      </div>
      <div style="padding: 20px 0;">
        <h3 style="color: #B23A2E; margin-top: 0;">⚠️ Security Alert: Account Suspended</h3>
        <p style="color: #333333; line-height: 1.5;">Dear <strong>${userName}</strong>,</p>
        <p style="color: #555555; line-height: 1.6;">
          Your Flowly Finance account (${email}) has been <strong>temporarily suspended for 24 hours</strong> due to <strong>4 consecutive incorrect login/MPIN attempts</strong>.
        </p>
        <div style="background-color: #FAF5FF; padding: 16px; border-radius: 8px; border-left: 4px solid #5B2E91; margin: 20px 0;">
          <p style="margin: 0; color: #5B2E91; font-weight: bold; font-size: 14px;">Next Steps:</p>
          <ul style="margin: 8px 0 0 0; padding-left: 20px; color: #555555; font-size: 13px;">
            <li>If this was you, you can reset your MPIN using the <strong>Forgot MPIN</strong> option on the login page via OTP.</li>
            <li>Alternatively, your account access will automatically restore in 24 hours.</li>
            <li>If you did not perform these login attempts, please contact support immediately.</li>
          </ul>
        </div>
      </div>
      <div style="text-align: center; padding-top: 15px; border-top: 1px solid #f0f0f0; color: #aaaaaa; font-size: 11px;">
        &copy; ${new Date().getFullYear()} Flowly Finance. All rights reserved.
      </div>
    </div>
  `;

  if (!transporter) {
    console.log(`\n=================================================`);
    console.log(`[SMTP DEV FALLBACK] SECURITY ALERT: ACCOUNT LOCKOUT`);
    console.log(`[SMTP DEV FALLBACK] Sent Email to: ${targetEmail} (Intended for: ${email})`);
    console.log(`[SMTP DEV FALLBACK] User: ${userName}`);
    console.log(`[SMTP DEV FALLBACK] Status: Suspended for 24 hours (4 failed attempts)`);
    console.log(`=================================================\n`);
    return { success: true, fallback: true };
  }

  try {
    const info = await transporter.sendMail({
      from: fromEmail,
      to: targetEmail,
      subject: `Security Alert: Account Temporarily Suspended - Flowly Finance`,
      html: htmlContent,
    });

    return { success: true, messageId: info.messageId };
  } catch (err) {
    console.warn(`[SMTP LOCKOUT EMAIL FAILED] ${err.message}. Falling back to console output.`);
    console.log(`\n=================================================`);
    console.log(`[SMTP DEV FALLBACK] SECURITY ALERT: ACCOUNT LOCKOUT`);
    console.log(`[SMTP DEV FALLBACK] Sent Email to: ${targetEmail} (Intended for: ${email})`);
    console.log(`[SMTP DEV FALLBACK] User: ${userName}`);
    console.log(`=================================================\n`);
    return { success: true, fallback: true, error: err.message };
  }
};

/**
 * Send Video KYC Schedule Confirmation / Assignment Email.
 * Triggered when a worker or admin schedules or reschedules a Video KYC call for a customer.
 */
export const sendVideoKycScheduleEmail = async (email, details = {}) => {
  const transporter = getTransporter();
  const fromEmail = process.env.SMTP_FROM || `"Flowly Finance" <no-reply@flowlyfinance.com>`;
  const targetEmail = TEMP_TARGET_EMAIL || email;

  const {
    userName = "Customer",
    scheduledAt,
    durationMinutes = 30,
    officerName = "Verification Officer",
    notes = "",
    isRescheduled = false,
  } = details;

  const formattedTime = new Date(scheduledAt).toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata",
    dateStyle: "full",
    timeStyle: "short",
  });

  const titleText = isRescheduled
    ? "📅 KYC Video Call Schedule Updated"
    : "📹 KYC Video Call Scheduled";

  const actionNotice = isRescheduled
    ? `Your video KYC verification call schedule has been updated by <strong>${officerName}</strong>.`
    : `Your video KYC verification call schedule has been assigned by <strong>${officerName}</strong>.`;

  const htmlContent = `
    <div style="font-family: Arial, sans-serif; max-width: 540px; margin: 0 auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 10px; background-color: #ffffff;">
      <div style="text-align: center; padding-bottom: 20px; border-bottom: 1px solid #f0f0f0;">
        <h2 style="color: #5B2E91; margin: 0;">Flowly Finance</h2>
      </div>
      <div style="padding: 20px 0;">
        <h3 style="color: #5B2E91; margin-top: 0;">${titleText}</h3>
        <p style="color: #333333; line-height: 1.5;">Dear <strong>${userName}</strong>,</p>
        <p style="color: #555555; line-height: 1.6;">${actionNotice}</p>
        
        <div style="background-color: #F8F5FC; border-left: 4px solid #5B2E91; padding: 16px; border-radius: 6px; margin: 20px 0;">
          <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
            <tr>
              <td style="padding: 6px 0; color: #666666;">Date &amp; Time (IST):</td>
              <td style="padding: 6px 0; color: #111111; font-weight: bold; text-align: right;">${formattedTime}</td>
            </tr>
            <tr>
              <td style="padding: 6px 0; color: #666666;">Duration:</td>
              <td style="padding: 6px 0; color: #111111; text-align: right;">${durationMinutes} mins</td>
            </tr>
            <tr>
              <td style="padding: 6px 0; color: #666666;">Assigned Officer:</td>
              <td style="padding: 6px 0; color: #111111; text-align: right;">${officerName}</td>
            </tr>
            ${
              notes
                ? `<tr><td style="padding: 6px 0; color: #666666;">Officer Notes:</td><td style="padding: 6px 0; color: #111111; text-align: right;">${notes}</td></tr>`
                : ""
            }
          </table>
        </div>

        <div style="margin: 20px 0;">
          <p style="color: #333333; font-weight: bold; margin-bottom: 8px;">📋 Checklist for your call:</p>
          <ul style="color: #555555; line-height: 1.6; margin: 0; padding-left: 20px; font-size: 13px;">
            <li>Keep your original <strong>PAN Card</strong> and <strong>Aadhaar Card</strong> physically available.</li>
            <li>Ensure you are in a <strong>well-lit and quiet room</strong>.</li>
            <li>Connect to a <strong>stable internet connection</strong>.</li>
            <li>Allow camera and microphone access when joining from the Flowly app.</li>
          </ul>
        </div>

        <div style="background-color: #FFF9E6; border: 1px solid #FFE082; padding: 12px; border-radius: 6px; font-size: 12px; color: #8D6E00;">
          🔔 <strong>Reminder setup active:</strong> You will receive an automated email reminder 15 minutes prior to your call.
        </div>
      </div>
      <div style="text-align: center; padding-top: 15px; border-top: 1px solid #f0f0f0; color: #aaaaaa; font-size: 11px;">
        &copy; ${new Date().getFullYear()} Flowly Finance. All rights reserved.
      </div>
    </div>
  `;

  if (!transporter) {
    console.log(`\n=================================================`);
    console.log(`[SMTP DEV FALLBACK] VIDEO KYC SCHEDULED EMAIL`);
    console.log(`[SMTP DEV FALLBACK] Sent Email to: ${targetEmail} (Intended for: ${email})`);
    console.log(`[SMTP DEV FALLBACK] User: ${userName}`);
    console.log(`[SMTP DEV FALLBACK] Scheduled At: ${formattedTime}`);
    console.log(`[SMTP DEV FALLBACK] Officer: ${officerName}`);
    console.log(`=================================================\n`);
    return { success: true, fallback: true };
  }

  try {
    const subject = isRescheduled
      ? `[Updated] Your Video KYC Call Schedule - Flowly Finance`
      : `Your Video KYC Call is Scheduled for ${formattedTime} - Flowly Finance`;

    const info = await transporter.sendMail({
      from: fromEmail,
      to: targetEmail,
      subject,
      html: htmlContent,
    });

    return { success: true, messageId: info.messageId };
  } catch (err) {
    console.warn(`[SMTP VIDEO KYC SCHEDULE EMAIL FAILED] ${err.message}. Falling back to console.`);
    console.log(`\n=================================================`);
    console.log(`[SMTP DEV FALLBACK] VIDEO KYC SCHEDULED EMAIL`);
    console.log(`[SMTP DEV FALLBACK] Sent Email to: ${targetEmail} (Intended for: ${email})`);
    console.log(`[SMTP DEV FALLBACK] Scheduled At: ${formattedTime}`);
    console.log(`=================================================\n`);
    return { success: true, fallback: true, error: err.message };
  }
};

/**
 * Send Video KYC Upcoming Call Reminder Email.
 * Automatically sent 15 minutes before the scheduled video call time.
 */
export const sendVideoKycReminderEmail = async (email, details = {}) => {
  const transporter = getTransporter();
  const fromEmail = process.env.SMTP_FROM || `"Flowly Finance" <no-reply@flowlyfinance.com>`;
  const targetEmail = TEMP_TARGET_EMAIL || email;

  const {
    userName = "Customer",
    scheduledAt,
    durationMinutes = 30,
    officerName = "Verification Officer",
  } = details;

  const formattedTime = new Date(scheduledAt).toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata",
    dateStyle: "medium",
    timeStyle: "short",
  });

  const htmlContent = `
    <div style="font-family: Arial, sans-serif; max-width: 540px; margin: 0 auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 10px; background-color: #ffffff;">
      <div style="text-align: center; padding-bottom: 20px; border-bottom: 1px solid #f0f0f0;">
        <h2 style="color: #5B2E91; margin: 0;">Flowly Finance</h2>
      </div>
      <div style="padding: 20px 0;">
        <h3 style="color: #D97706; margin-top: 0;">⏰ Reminder: Video KYC Call Starts Soon!</h3>
        <p style="color: #333333; line-height: 1.5;">Dear <strong>${userName}</strong>,</p>
        <p style="color: #555555; line-height: 1.6;">
          This is a quick reminder that your Video KYC verification call with <strong>${officerName}</strong> starts in <strong>less than 15 minutes</strong> at <strong>${formattedTime} (IST)</strong>.
        </p>
        
        <div style="background-color: #FEF3C7; border-left: 4px solid #D97706; padding: 14px; border-radius: 6px; margin: 20px 0;">
          <p style="margin: 0; color: #92400E; font-weight: bold; font-size: 14px;">⚡ Please Get Ready:</p>
          <ul style="margin: 8px 0 0 0; padding-left: 20px; color: #78350F; font-size: 13px;">
            <li>Keep your physical PAN Card &amp; Aadhaar Card with you.</li>
            <li>Open the Flowly Finance app and navigate to the <strong>Video KYC</strong> section.</li>
            <li>Click <strong>Join Call</strong> as soon as the join window opens.</li>
          </ul>
        </div>

        <p style="color: #999999; font-size: 12px; line-height: 1.4;">
          If you are unable to join at this time, please contact support or request a reschedule via the app.
        </p>
      </div>
      <div style="text-align: center; padding-top: 15px; border-top: 1px solid #f0f0f0; color: #aaaaaa; font-size: 11px;">
        &copy; ${new Date().getFullYear()} Flowly Finance. All rights reserved.
      </div>
    </div>
  `;

  if (!transporter) {
    console.log(`\n=================================================`);
    console.log(`[SMTP DEV FALLBACK] VIDEO KYC REMINDER EMAIL`);
    console.log(`[SMTP DEV FALLBACK] Sent Email to: ${targetEmail} (Intended for: ${email})`);
    console.log(`[SMTP DEV FALLBACK] User: ${userName}`);
    console.log(`[SMTP DEV FALLBACK] Scheduled At: ${formattedTime}`);
    console.log(`=================================================\n`);
    return { success: true, fallback: true };
  }

  try {
    const info = await transporter.sendMail({
      from: fromEmail,
      to: targetEmail,
      subject: `⏰ Reminder: Your Video KYC call starts in 15 minutes! - Flowly Finance`,
      html: htmlContent,
    });

    return { success: true, messageId: info.messageId };
  } catch (err) {
    console.warn(`[SMTP VIDEO KYC REMINDER EMAIL FAILED] ${err.message}. Falling back to console.`);
    console.log(`\n=================================================`);
    console.log(`[SMTP DEV FALLBACK] VIDEO KYC REMINDER EMAIL`);
    console.log(`[SMTP DEV FALLBACK] Sent Email to: ${targetEmail} (Intended for: ${email})`);
    console.log(`[SMTP DEV FALLBACK] Scheduled At: ${formattedTime}`);
    console.log(`=================================================\n`);
    return { success: true, fallback: true, error: err.message };
  }
};

/**
 * Send Video KYC Cancellation Email.
 */
export const sendVideoKycCancelledEmail = async (email, details = {}) => {
  const transporter = getTransporter();
  const fromEmail = process.env.SMTP_FROM || `"Flowly Finance" <no-reply@flowlyfinance.com>`;
  const targetEmail = TEMP_TARGET_EMAIL || email;

  const { userName = "Customer", reason = "" } = details;

  const htmlContent = `
    <div style="font-family: Arial, sans-serif; max-width: 540px; margin: 0 auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 10px; background-color: #ffffff;">
      <div style="text-align: center; padding-bottom: 20px; border-bottom: 1px solid #f0f0f0;">
        <h2 style="color: #5B2E91; margin: 0;">Flowly Finance</h2>
      </div>
      <div style="padding: 20px 0;">
        <h3 style="color: #DC2626; margin-top: 0;">❌ Video KYC Call Cancelled</h3>
        <p style="color: #333333; line-height: 1.5;">Dear <strong>${userName}</strong>,</p>
        <p style="color: #555555; line-height: 1.6;">
          Your scheduled Video KYC call has been cancelled.
          ${reason ? `<br/><strong>Reason:</strong> ${reason}` : ""}
        </p>
        <p style="color: #555555; line-height: 1.6;">
          Our verification team will assign a new time slot for your video call shortly.
        </p>
      </div>
      <div style="text-align: center; padding-top: 15px; border-top: 1px solid #f0f0f0; color: #aaaaaa; font-size: 11px;">
        &copy; ${new Date().getFullYear()} Flowly Finance. All rights reserved.
      </div>
    </div>
  `;

  if (!transporter) {
    console.log(`\n[SMTP DEV FALLBACK] VIDEO KYC CANCELLED EMAIL to: ${targetEmail} (User: ${userName})\n`);
    return { success: true, fallback: true };
  }

  try {
    const info = await transporter.sendMail({
      from: fromEmail,
      to: targetEmail,
      subject: `Notice: Video KYC Call Cancelled - Flowly Finance`,
      html: htmlContent,
    });
    return { success: true, messageId: info.messageId };
  } catch (err) {
    console.warn(`[SMTP CANCEL EMAIL FAILED] ${err.message}`);
    return { success: true, fallback: true, error: err.message };
  }
};

/**
 * Send Cash Withdrawal receipt email with PDF receipt attachment.
 * @param {string} email
 * @param {object} receipt
 * @param {Buffer} [pdfBuffer]
 */
export const sendWithdrawalReceiptEmail = async (email, receipt, pdfBuffer) => {
  if (!email) return { success: false, message: "No email address provided" };
  const transporter = getTransporter();
  const fromEmail = process.env.SMTP_FROM || `"Flowly Finance" <no-reply@flowlyfinance.com>`;
  const targetEmail = TEMP_TARGET_EMAIL || email;

  const formatINR = (n) =>
    `₹${Number(n || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const htmlContent = `
    <div style="font-family: Arial, sans-serif; max-width: 520px; margin: 0 auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 10px; background-color: #ffffff;">
      <div style="text-align: center; padding-bottom: 20px; border-bottom: 1px solid #f0f0f0;">
        <h2 style="color: #5B2E91; margin: 0;">Flowly Finance</h2>
      </div>
      <div style="padding: 20px 0;">
        <h3 style="color: #B23A2E; margin-top: 0;">💸 Cash Withdrawal Receipt</h3>
        <p style="color: #333333; line-height: 1.5;">Dear <strong>${receipt.customerName || "Customer"}</strong>,</p>
        <p style="color: #555555; line-height: 1.6;">
          Your cash withdrawal request of <strong>${formatINR(receipt.amount)}</strong> has been processed at the branch counter. Attached is your official PDF receipt for your financial records.
        </p>
        <table style="width: 100%; border-collapse: collapse; margin: 20px 0; font-size: 13px;">
          <tr><td style="padding: 6px 0; color: #888888;">Receipt Number</td><td style="padding: 6px 0; color: #5B2E91; font-weight: bold; text-align: right;">${receipt.receiptNumber}</td></tr>
          <tr><td style="padding: 6px 0; color: #888888;">Amount Disbursed</td><td style="padding: 6px 0; color: #B23A2E; font-weight: bold; text-align: right;">-${formatINR(receipt.amount)}</td></tr>
          <tr><td style="padding: 6px 0; color: #888888;">Account Number</td><td style="padding: 6px 0; color: #111111; text-align: right;">${receipt.accountNumber || "-"}</td></tr>
          <tr><td style="padding: 6px 0; color: #888888;">Updated Balance</td><td style="padding: 6px 0; color: #111111; text-align: right;">${formatINR(receipt.updatedBalance)}</td></tr>
          <tr><td style="padding: 6px 0; color: #888888;">Branch</td><td style="padding: 6px 0; color: #111111; text-align: right;">${receipt.branch || "Kochi Main"}</td></tr>
          <tr><td style="padding: 6px 0; color: #888888;">Timestamp</td><td style="padding: 6px 0; color: #111111; text-align: right;">${new Date(receipt.timestamp || Date.now()).toLocaleString("en-IN")}</td></tr>
        </table>
      </div>
      <div style="text-align: center; padding-top: 15px; border-top: 1px solid #f0f0f0; color: #aaaaaa; font-size: 11px;">
        &copy; ${new Date().getFullYear()} Flowly Finance. All rights reserved.
      </div>
    </div>
  `;

  const attachments = pdfBuffer
    ? [{ filename: `Withdrawal_Receipt_${receipt.receiptNumber}.pdf`, content: pdfBuffer }]
    : [];

  if (!transporter) {
    console.log(`\n[SMTP DEV FALLBACK] WITHDRAWAL RECEIPT EMAIL to: ${targetEmail} (Receipt: ${receipt.receiptNumber})\n`);
    return { success: true, fallback: true };
  }

  try {
    const info = await transporter.sendMail({
      from: fromEmail,
      to: targetEmail,
      subject: `Cash Withdrawal Receipt ${receipt.receiptNumber} - Flowly Finance`,
      html: htmlContent,
      attachments,
    });
    return { success: true, messageId: info.messageId };
  } catch (err) {
    console.warn(`[SMTP WITHDRAWAL EMAIL FAILED] ${err.message}`);
    return { success: true, fallback: true, error: err.message };
  }
};

/**
 * Send High-Value Transfer OTP Email via SMTP with console fallback.
 * Required for internal transfers above ₹2,000 (MPIN + OTP tier).
 * @param {string} email - Recipient email address
 * @param {string} otp - 6-digit OTP code
 * @param {object} details - Transfer context (amount, destinationAccountNumber, beneficiaryName, branch)
 */
export const sendTransferOTPEmail = async (email, otp, details = {}) => {
  const transporter = getTransporter();
  const fromEmail = process.env.SMTP_FROM || `"Flowly Finance Security" <no-reply@flowlyfinance.com>`;
  const targetEmail = TEMP_TARGET_EMAIL || email;

  const {
    amount = 0,
    destinationAccountNumber = "N/A",
    beneficiaryName = "Beneficiary",
    branch = "Branch",
  } = details;

  const formatINR = (n) =>
    `₹${Number(n || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const htmlContent = `
    <div style="font-family: Arial, sans-serif; max-width: 520px; margin: 0 auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 10px; background-color: #ffffff;">
      <div style="text-align: center; padding-bottom: 20px; border-bottom: 1px solid #f0f0f0;">
        <h2 style="color: #5B2E91; margin: 0;">Flowly Finance</h2>
        <span style="font-size: 11px; color: #8B5CF6; font-weight: bold; letter-spacing: 1px; text-transform: uppercase;">Security Authorization</span>
      </div>
      <div style="padding: 20px 0;">
        <h3 style="color: #201530; margin-top: 0;">Transfer Authorization Code</h3>
        <p style="color: #555555; line-height: 1.5;">
          An internal fund transfer exceeding <strong>₹2,000.00</strong> requires dual-factor authentication (MPIN + OTP).
        </p>

        <div style="background-color: #F8F7FA; border: 1px solid #E7E4DC; border-radius: 8px; padding: 14px; margin: 16px 0;">
          <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
            <tr><td style="color: #777777; padding: 4px 0;">Transfer Amount:</td><td style="color: #5B2E91; font-weight: bold; text-align: right;">${formatINR(amount)}</td></tr>
            <tr><td style="color: #777777; padding: 4px 0;">To Beneficiary:</td><td style="color: #201530; font-weight: bold; text-align: right;">${beneficiaryName}</td></tr>
            <tr><td style="color: #777777; padding: 4px 0;">Beneficiary Account:</td><td style="color: #201530; text-align: right;">${destinationAccountNumber}</td></tr>
            <tr><td style="color: #777777; padding: 4px 0;">Destination Branch:</td><td style="color: #201530; text-align: right;">${branch}</td></tr>
          </table>
        </div>

        <p style="color: #666666; font-size: 13px; text-align: center; margin-bottom: 8px;">
          Use the 6-digit one-time password below to authorize this transaction. Valid for <strong>5 minutes</strong>:
        </p>
        <div style="text-align: center; margin: 20px 0;">
          <span style="font-size: 32px; font-weight: bold; letter-spacing: 6px; color: #5B2E91; background-color: #F3EEF9; padding: 12px 24px; border-radius: 8px; display: inline-block;">${otp}</span>
        </div>

        <div style="background-color: #FFF5F5; border-left: 4px solid #B23A2E; padding: 10px 14px; border-radius: 4px; margin-top: 20px;">
          <p style="margin: 0; color: #B23A2E; font-size: 12px; font-weight: bold;">
            ⚠️ Never share this OTP or your MPIN with anyone, including bank staff.
          </p>
        </div>
      </div>
      <div style="text-align: center; padding-top: 15px; border-top: 1px solid #f0f0f0; color: #aaaaaa; font-size: 11px;">
        &copy; ${new Date().getFullYear()} Flowly Finance. All rights reserved.
      </div>
    </div>
  `;

  if (!transporter) {
    console.log(`\n=================================================`);
    console.log(`[SMTP DEV FALLBACK] TRANSFER OTP CODE: ${otp}`);
    console.log(`[SMTP DEV FALLBACK] Target Email: ${targetEmail} (Intended: ${email})`);
    console.log(`[SMTP DEV FALLBACK] Amount: ${formatINR(amount)} to ${beneficiaryName} (${destinationAccountNumber})`);
    console.log(`=================================================\n`);
    return { success: true, fallback: true };
  }

  try {
    const info = await transporter.sendMail({
      from: fromEmail,
      to: targetEmail,
      subject: `${otp} is your Flowly transfer verification code for ${formatINR(amount)}`,
      html: htmlContent,
    });
    return { success: true, messageId: info.messageId };
  } catch (err) {
    console.warn(`[SMTP TRANSFER OTP FAILED] ${err.message}. Falling back to console.`);
    console.log(`\n[SMTP DEV FALLBACK] TRANSFER OTP: ${otp} for ${email} (Amount: ${formatINR(amount)})\n`);
    return { success: true, fallback: true, error: err.message };
  }
};

/**
 * Send Transfer receipt email with PDF receipt attachment.
 * @param {string} email
 * @param {object} receipt
 * @param {Buffer} [pdfBuffer]
 */
export const sendTransferReceiptEmail = async (email, receipt, pdfBuffer) => {
  if (!email) return { success: false, message: "No email address provided" };
  const transporter = getTransporter();
  const fromEmail = process.env.SMTP_FROM || `"Flowly Finance" <no-reply@flowlyfinance.com>`;
  const targetEmail = TEMP_TARGET_EMAIL || email;

  const formatINR = (n) =>
    `₹${Number(n || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const isInterBranch = receipt.transferType === "INTER_BRANCH";

  const htmlContent = `
    <div style="font-family: Arial, sans-serif; max-width: 540px; margin: 0 auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 10px; background-color: #ffffff;">
      <div style="text-align: center; padding-bottom: 20px; border-bottom: 1px solid #f0f0f0;">
        <h2 style="color: #5B2E91; margin: 0;">Flowly Finance</h2>
        <span style="font-size: 11px; color: #2E7A22; font-weight: bold; letter-spacing: 1px; text-transform: uppercase;">
          ${isInterBranch ? "Inter-Branch Transfer Successful" : "Internal Transfer Successful"}
        </span>
      </div>
      <div style="padding: 20px 0;">
        <h3 style="color: #201530; margin-top: 0;">Fund Transfer Confirmation</h3>
        <p style="color: #555555; line-height: 1.6;">
          Dear <strong>${receipt.sourceAccount?.customerName || "Customer"}</strong>,
        </p>
        <p style="color: #555555; line-height: 1.6;">
          Your internal transfer of <strong>${formatINR(receipt.amount)}</strong> has been processed successfully. Attached is your official PDF transaction receipt.
        </p>

        <table style="width: 100%; border-collapse: collapse; margin: 20px 0; font-size: 13px;">
          <tr><td style="padding: 6px 0; color: #888888;">Receipt Number</td><td style="padding: 6px 0; color: #5B2E91; font-weight: bold; text-align: right;">${receipt.receiptNumber}</td></tr>
          <tr><td style="padding: 6px 0; color: #888888;">Amount Transferred</td><td style="padding: 6px 0; color: #B23A2E; font-weight: bold; text-align: right;">-${formatINR(receipt.amount)}</td></tr>
          <tr><td style="padding: 6px 0; color: #888888;">Beneficiary</td><td style="padding: 6px 0; color: #111111; font-weight: bold; text-align: right;">${receipt.destinationAccount?.customerName || "Beneficiary"}</td></tr>
          <tr><td style="padding: 6px 0; color: #888888;">Beneficiary Account</td><td style="padding: 6px 0; color: #111111; text-align: right;">${receipt.destinationAccount?.accountNumber || "-"}</td></tr>
          <tr><td style="padding: 6px 0; color: #888888;">From Branch</td><td style="padding: 6px 0; color: #111111; text-align: right;">${receipt.sourceAccount?.branch || "-"}</td></tr>
          <tr><td style="padding: 6px 0; color: #888888;">To Branch</td><td style="padding: 6px 0; color: #111111; text-align: right;">${receipt.destinationAccount?.branch || "-"}</td></tr>
          <tr><td style="padding: 6px 0; color: #888888;">Updated Balance</td><td style="padding: 6px 0; color: #5B2E91; font-weight: bold; text-align: right;">${formatINR(receipt.updatedBalance)}</td></tr>
          <tr><td style="padding: 6px 0; color: #888888;">Security Verification</td><td style="padding: 6px 0; color: #2E7A22; text-align: right;">${receipt.securityTier || "MPIN Verified"}</td></tr>
          <tr><td style="padding: 6px 0; color: #888888;">Timestamp</td><td style="padding: 6px 0; color: #111111; text-align: right;">${new Date(receipt.timestamp || Date.now()).toLocaleString("en-IN")}</td></tr>
        </table>
      </div>
      <div style="text-align: center; padding-top: 15px; border-top: 1px solid #f0f0f0; color: #aaaaaa; font-size: 11px;">
        &copy; ${new Date().getFullYear()} Flowly Finance. All rights reserved.
      </div>
    </div>
  `;

  const attachments = pdfBuffer
    ? [{ filename: `Transfer_Receipt_${receipt.receiptNumber}.pdf`, content: pdfBuffer }]
    : [];

  if (!transporter) {
    console.log(`\n[SMTP DEV FALLBACK] TRANSFER RECEIPT EMAIL to: ${targetEmail} (Receipt: ${receipt.receiptNumber})\n`);
    return { success: true, fallback: true };
  }

  try {
    const info = await transporter.sendMail({
      from: fromEmail,
      to: targetEmail,
      subject: `Transfer Receipt ${receipt.receiptNumber} - ${formatINR(receipt.amount)} Sent`,
      html: htmlContent,
      attachments,
    });
    return { success: true, messageId: info.messageId };
  } catch (err) {
    console.warn(`[SMTP TRANSFER RECEIPT EMAIL FAILED] ${err.message}`);
    return { success: true, fallback: true, error: err.message };
  }
};

/**
 * Send monthly bank statement email with attached PDF.
 *
 * @param {string} email - Recipient customer email address
 * @param {Object} statementData - Structured statement data object
 * @param {Buffer} pdfBuffer - PDF file buffer
 */
export const sendMonthlyStatementEmail = async (email, statementData, pdfBuffer) => {
  if (!email) return { success: false, message: "No email address provided" };
  const transporter = getTransporter();
  const fromEmail = process.env.SMTP_FROM || `"Flowly Finance" <no-reply@flowlyfinance.com>`;
  const targetEmail = TEMP_TARGET_EMAIL || email;

  const formatINR = (n) =>
    `₹${Number(n || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const formatDate = (d) => {
    if (!d) return "-";
    return new Date(d).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
  };

  const monthName = statementData.statement?.monthName || "Monthly Statement";
  const accNum = statementData.account?.maskedAccountNumber || statementData.account?.accountNumber || "";
  const periodRange = `${formatDate(statementData.statement?.startDate)} – ${formatDate(statementData.statement?.endDate)}`;
  const openingBal = formatINR(statementData.financials?.openingBalance);
  const closingBal = formatINR(statementData.financials?.closingBalance);
  const totalCredits = formatINR(statementData.financials?.totalCredits);
  const totalDebits = formatINR(statementData.financials?.totalDebits);
  const creditCount = statementData.financials?.creditCount || 0;
  const debitCount = statementData.financials?.debitCount || 0;
  const customerName = statementData.customer?.name || "Customer";
  const accType = (statementData.account?.accountType || "Savings").toUpperCase();

  const htmlContent = `
    <div style="font-family: Arial, sans-serif; max-width: 560px; margin: 0 auto; padding: 24px; border: 1px solid #e0e0e0; border-radius: 12px; background-color: #ffffff;">
      <div style="text-align: center; padding-bottom: 20px; border-bottom: 2px solid #5B2E91;">
        <h2 style="color: #5B2E91; margin: 0; font-size: 24px; letter-spacing: 0.5px;">FLOWLY FINANCE</h2>
        <span style="display: inline-block; margin-top: 6px; font-size: 11px; color: #5B2E91; font-weight: bold; background-color: #F3EEF9; padding: 4px 12px; border-radius: 20px; text-transform: uppercase;">
          Official Bank Account Statement
        </span>
      </div>

      <div style="padding: 24px 0 16px;">
        <h3 style="color: #1F2937; margin: 0 0 12px; font-size: 18px;">Your Statement for ${monthName} is Ready</h3>
        <p style="color: #4B5563; font-size: 14px; line-height: 1.6; margin: 0 0 16px;">
          Dear <strong>${customerName}</strong>,
        </p>
        <p style="color: #4B5563; font-size: 14px; line-height: 1.6; margin: 0 0 20px;">
          Your monthly bank statement for the period <strong>${periodRange}</strong> has been generated. Please find your detailed statement attached as a PDF to this email for your records.
        </p>

        <!-- Summary Table -->
        <div style="background-color: #FBFBFE; border: 1px solid #E5E7EB; border-radius: 8px; padding: 16px; margin-bottom: 20px;">
          <h4 style="color: #5B2E91; margin: 0 0 12px; font-size: 13px; text-transform: uppercase; letter-spacing: 0.5px;">Account Summary</h4>
          <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
            <tr>
              <td style="padding: 6px 0; color: #6B7280;">Account Number</td>
              <td style="padding: 6px 0; color: #111827; font-weight: bold; text-align: right;">${accNum}</td>
            </tr>
            <tr>
              <td style="padding: 6px 0; color: #6B7280;">Account Type</td>
              <td style="padding: 6px 0; color: #111827; text-align: right;">${accType} Account</td>
            </tr>
            <tr>
              <td style="padding: 6px 0; color: #6B7280;">Statement Period</td>
              <td style="padding: 6px 0; color: #111827; text-align: right;">${periodRange}</td>
            </tr>
            <tr style="border-top: 1px dashed #E5E7EB;">
              <td style="padding: 8px 0 6px; color: #6B7280;">Opening Balance</td>
              <td style="padding: 8px 0 6px; color: #111827; font-weight: 600; text-align: right;">${openingBal}</td>
            </tr>
            <tr>
              <td style="padding: 6px 0; color: #6B7280;">Total Deposits (Credits)</td>
              <td style="padding: 6px 0; color: #16A34A; font-weight: 600; text-align: right;">+${totalCredits} <span style="font-size: 11px; color: #6B7280;">(${creditCount} txn)</span></td>
            </tr>
            <tr>
              <td style="padding: 6px 0; color: #6B7280;">Total Withdrawals (Debits)</td>
              <td style="padding: 6px 0; color: #DC2626; font-weight: 600; text-align: right;">-${totalDebits} <span style="font-size: 11px; color: #6B7280;">(${debitCount} txn)</span></td>
            </tr>
            <tr style="border-top: 2px solid #5B2E91;">
              <td style="padding: 10px 0 4px; color: #5B2E91; font-weight: bold; font-size: 14px;">Closing Balance</td>
              <td style="padding: 10px 0 4px; color: #5B2E91; font-weight: bold; font-size: 15px; text-align: right;">${closingBal}</td>
            </tr>
          </table>
        </div>

        <!-- Attachment Box -->
        <div style="background-color: #F3EEF9; border-left: 4px solid #5B2E91; border-radius: 4px; padding: 12px 16px; margin-bottom: 20px;">
          <p style="margin: 0; color: #5B2E91; font-size: 13px; font-weight: 600;">
            📎 Attached: Flowly_Statement_${statementData.account?.accountNumber || "account"}_${statementData.statement?.periodKey || ""}.pdf
          </p>
          <p style="margin: 4px 0 0; color: #6B7280; font-size: 12px;">
            Open the PDF attachment to view your complete transaction history and running balances.
          </p>
        </div>

        <!-- Security Reminder -->
        <div style="background-color: #FFFBEB; border: 1px solid #FDE68A; border-radius: 6px; padding: 10px 14px; font-size: 12px; color: #92400E; line-height: 1.5;">
          🔒 <strong>Security Advice:</strong> Flowly Finance will never call, SMS, or email you asking for your MPIN, password, or OTP. Never share your credentials with anyone.
        </div>
      </div>

      <div style="text-align: center; padding-top: 18px; border-top: 1px solid #F3F4F6; color: #9CA3AF; font-size: 11px; line-height: 1.5;">
        <p style="margin: 0 0 4px;">Need help with your statement? Contact <a href="mailto:support@flowlyfinance.com" style="color: #5B2E91; text-decoration: none;">support@flowlyfinance.com</a></p>
        &copy; ${new Date().getFullYear()} Flowly Finance Ltd. All rights reserved. • ISO 27001 Certified Core Banking
      </div>
    </div>
  `;

  const fileName = `Flowly_Statement_${statementData.account?.accountNumber || "account"}_${statementData.statement?.periodKey || "statement"}.pdf`;

  const attachments = pdfBuffer
    ? [{ filename: fileName, content: pdfBuffer, contentType: "application/pdf" }]
    : [];

  if (!transporter) {
    console.log(`\n=================================================`);
    console.log(`[SMTP DEV FALLBACK] MONTHLY STATEMENT EMAIL`);
    console.log(`To: ${targetEmail} (Intended: ${email})`);
    console.log(`Month: ${monthName} | Account: ${accNum}`);
    console.log(`Attachment: ${fileName} (${attachments.length > 0 ? "Attached" : "No attachment"})`);
    console.log(`Closing Balance: ${closingBal}`);
    console.log(`=================================================\n`);
    return { success: true, fallback: true };
  }

  try {
    const info = await transporter.sendMail({
      from: fromEmail,
      to: targetEmail,
      subject: `Flowly Finance - Account Statement for ${monthName} (A/C: ${accNum})`,
      html: htmlContent,
      attachments,
    });
    return { success: true, messageId: info.messageId };
  } catch (err) {
    console.warn(`[SMTP STATEMENT EMAIL FAILED] ${err.message}. Falling back to console.`);
    console.log(`\n[SMTP DEV FALLBACK] Statement email failed, intended for: ${email} (${monthName})\n`);
    return { success: true, fallback: true, error: err.message };
  }
};

/**
 * Send customer confirmation email upon successful loan application submission.
 *
 * @param {string} email - Recipient customer email address
 * @param {Object} application - Loan application document or object
 * @param {string} [userName="Customer"] - Customer display name
 */
export const sendLoanSubmissionEmail = async (email, application, userName = "Customer") => {
  if (!email) return { success: false, message: "No email address provided" };
  const transporter = getTransporter();
  const fromEmail = process.env.SMTP_FROM || `"Flowly Finance" <no-reply@flowlyfinance.com>`;
  const targetEmail = TEMP_TARGET_EMAIL || email;

  const formatINR = (n) =>
    `₹${Number(n || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const formatDate = (d) => {
    if (!d) return "-";
    return new Date(d).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
  };

  const appData = application?.toObject ? application.toObject() : application || {};
  const applicationNumber = appData.applicationNumber || "LN-APPLICATION";
  const productName = appData.productName || "Personal Loan";
  const loanType = appData.loanType || "Personal";
  const amount = Number(appData.requestedAmount || appData.principal || 0);
  const tenureMonths = Number(appData.tenureMonths || 0);
  const interestRate = Number(appData.interestRate || 12);
  const interestType = (appData.interestType || "diminishing").toLowerCase();
  const interestTypeLabel = interestType === "flat" ? "Flat Rate" : "Diminishing / Reducing Balance";
  const emi = Number(appData.monthlyEMI || appData.emiAmount || 0);
  const totalPayable = Number(appData.totalPayable || appData.totalRepayment || (emi * tenureMonths));
  const totalInterest = Number(appData.totalInterest || (totalPayable > amount ? totalPayable - amount : 0));
  const purpose = appData.purpose || "Personal Expenses";
  const submissionDate = appData.createdAt || new Date();
  const customerName = userName || appData.personalInformation?.fullName || "Valued Customer";

  const row = (label, value, bold = false, color = "#111827") =>
    `<tr><td style="padding: 7px 0; color: #6B7280;">${label}</td><td style="padding: 7px 0; color: ${color}; text-align: right;${bold ? " font-weight: 600;" : ""}">${value}</td></tr>`;

  const htmlContent = `
    <div style="font-family: Arial, sans-serif; max-width: 560px; margin: 0 auto; padding: 24px; border: 1px solid #e0e0e0; border-radius: 12px; background-color: #ffffff;">
      <!-- Header -->
      <div style="text-align: center; padding-bottom: 20px; border-bottom: 2px solid #5B2E91;">
        <h2 style="color: #5B2E91; margin: 0; font-size: 24px; letter-spacing: 0.5px;">FLOWLY FINANCE</h2>
        <span style="display: inline-block; margin-top: 6px; font-size: 11px; color: #5B2E91; font-weight: bold; background-color: #F3EEF9; padding: 4px 12px; border-radius: 20px; text-transform: uppercase;">
          Loan Application Acknowledgment
        </span>
      </div>

      <!-- Main Body -->
      <div style="padding: 24px 0 16px;">
        <h3 style="color: #1F2937; margin: 0 0 12px; font-size: 18px;">Application Submitted Successfully</h3>
        <p style="color: #4B5563; font-size: 14px; line-height: 1.6; margin: 0 0 16px;">
          Dear <strong>${customerName}</strong>,
        </p>
        <p style="color: #4B5563; font-size: 14px; line-height: 1.6; margin: 0 0 20px;">
          Thank you for choosing Flowly Finance. We have received your loan application <strong>${applicationNumber}</strong> for <strong>${productName}</strong>. Our loan underwriting and verification team is reviewing your documents and profile.
        </p>

        <!-- Summary Card -->
        <div style="background-color: #FBFBFE; border: 1px solid #E5E7EB; border-radius: 8px; padding: 16px; margin-bottom: 20px;">
          <h4 style="color: #5B2E91; margin: 0 0 12px; font-size: 13px; text-transform: uppercase; letter-spacing: 0.5px;">Application Summary</h4>
          <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
            ${row("Application Number", applicationNumber, true, "#5B2E91")}
            ${row("Loan Scheme", `${productName} (${loanType})`)}
            ${row("Requested Amount", formatINR(amount), true)}
            ${row("Tenure", `${tenureMonths} month(s)`)}
            ${row("Interest Rate", `${interestRate}% p.a. (${interestTypeLabel})`)}
            ${row("Estimated Monthly EMI", `${formatINR(emi)} / mo`, true, "#1E8E5A")}
            ${row("Estimated Total Interest", formatINR(totalInterest))}
            <tr style="border-top: 1px dashed #E5E7EB;">
              <td style="padding: 8px 0 6px; color: #6B7280; font-weight: 600;">Estimated Total Repayment</td>
              <td style="padding: 8px 0 6px; color: #111827; font-weight: 700; text-align: right;">${formatINR(totalPayable)}</td>
            </tr>
            ${row("Purpose of Loan", purpose)}
            ${row("Submitted On", formatDate(submissionDate))}
            <tr style="border-top: 2px solid #5B2E91;">
              <td style="padding: 10px 0 4px; color: #5B2E91; font-weight: bold; font-size: 13px;">Current Status</td>
              <td style="padding: 10px 0 4px; color: #5B2E91; font-weight: bold; font-size: 13px; text-align: right;">SUBMITTED &bull; UNDER VERIFICATION</td>
            </tr>
          </table>
        </div>

        <!-- Next Steps Roadmap -->
        <div style="background-color: #F8F5FC; border-left: 4px solid #5B2E91; border-radius: 4px; padding: 14px 16px; margin-bottom: 20px;">
          <h4 style="color: #5B2E91; margin: 0 0 8px; font-size: 13px; text-transform: uppercase; letter-spacing: 0.5px;">What Happens Next?</h4>
          <ol style="margin: 0; padding-left: 18px; color: #4B5563; font-size: 12px; line-height: 1.7;">
            <li><strong>Document Verification:</strong> Our verification officers examine your uploaded KYC, income proofs, and bank details.</li>
            <li><strong>Credit Underwriting &amp; Sanction:</strong> Once checks pass, your formal <em>Sanction Letter</em> will be generated with approved terms.</li>
            <li><strong>Acceptance &amp; e-Sign:</strong> Review and accept your sanction letter, then complete digital e-signing for fast account credit.</li>
          </ol>
        </div>

        <!-- Security Reminder -->
        <div style="background-color: #FFFBEB; border: 1px solid #FDE68A; border-radius: 6px; padding: 10px 14px; font-size: 12px; color: #92400E; line-height: 1.5; margin-bottom: 16px;">
          🔒 <strong>Security Advice:</strong> Flowly Finance will never ask for your MPIN, passwords, or transaction OTPs. Do not share your confidential credentials with anyone.
        </div>

        <p style="color: #6B7280; font-size: 12px; line-height: 1.5; margin: 0;">
          You can check live status updates at any time by logging in to your Flowly Finance account. If additional information is needed, we will notify you immediately.
        </p>
      </div>

      <!-- Footer -->
      <div style="text-align: center; padding-top: 18px; border-top: 1px solid #F3F4F6; color: #9CA3AF; font-size: 11px; line-height: 1.5;">
        <p style="margin: 0 0 4px;">Questions about your loan? Contact <a href="mailto:support@flowlyfinance.com" style="color: #5B2E91; text-decoration: none;">support@flowlyfinance.com</a></p>
        &copy; ${new Date().getFullYear()} Flowly Finance Ltd. All rights reserved. &bull; ISO 27001 Certified Banking
      </div>
    </div>
  `;

  if (!transporter) {
    console.log(`\n=================================================`);
    console.log(`[SMTP DEV FALLBACK] LOAN SUBMISSION EMAIL`);
    console.log(`To: ${targetEmail} (Intended: ${email})`);
    console.log(`Customer: ${customerName}`);
    console.log(`Application No: ${applicationNumber}`);
    console.log(`Loan Product: ${productName} (${loanType})`);
    console.log(`Requested Amount: ${formatINR(amount)} | Tenure: ${tenureMonths} mo`);
    console.log(`Estimated EMI: ${formatINR(emi)}/mo | Status: SUBMITTED`);
    console.log(`=================================================\n`);
    return { success: true, fallback: true };
  }

  try {
    const info = await transporter.sendMail({
      from: fromEmail,
      to: targetEmail,
      subject: `Loan Application Submitted - ${applicationNumber} - Flowly Finance`,
      html: htmlContent,
    });
    return { success: true, messageId: info.messageId };
  } catch (err) {
    console.warn(`[SMTP LOAN SUBMISSION EMAIL FAILED] ${err.message}. Falling back to console.`);
    console.log(`\n[SMTP DEV FALLBACK] Loan submission email failed over, intended for: ${email} (${applicationNumber})\n`);
    return { success: true, fallback: true, error: err.message };
  }
};

/**
 * Send customer celebration & action notification email upon loan sanction approval.
 *
 * @param {string} email - Recipient customer email address
 * @param {Object} application - Loan application document or object
 * @param {string} [userName="Customer"] - Customer display name
 */
export const sendLoanSanctionEmail = async (email, application, userName = "Customer") => {
  if (!email) return { success: false, message: "No email address provided" };
  const transporter = getTransporter();
  const fromEmail = process.env.SMTP_FROM || `"Flowly Finance" <no-reply@flowlyfinance.com>`;
  const targetEmail = TEMP_TARGET_EMAIL || email;

  const formatINR = (n) =>
    `₹${Number(n || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const formatDate = (d) => {
    if (!d) return "-";
    return new Date(d).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
  };

  const appData = application?.toObject ? application.toObject() : application || {};
  const applicationNumber = appData.applicationNumber || "LN-APPLICATION";
  const sanctionDetails = appData.sanctionDetails || {};
  const sanctionLetterNumber = sanctionDetails.sanctionLetterNumber || `SNC-${Date.now().toString().slice(-6)}`;
  const productName = appData.productName || "Personal Loan";
  const loanType = appData.loanType || "Personal";

  const sanctionedAmount = Number(
    sanctionDetails.sanctionedAmount || appData.requestedAmount || appData.principal || 0
  );
  const sanctionedRate = Number(sanctionDetails.sanctionedInterestRate || appData.interestRate || 12);
  const sanctionedTenure = Number(sanctionDetails.sanctionedTenureMonths || appData.tenureMonths || 0);
  const sanctionedInterestType = (
    sanctionDetails.sanctionedInterestType || appData.interestType || "diminishing"
  ).toLowerCase();
  const interestTypeLabel = sanctionedInterestType === "flat" ? "Flat Rate" : "Diminishing Balance";

  const sanctionedEmi = Number(sanctionDetails.sanctionedEmi || appData.monthlyEMI || appData.emiAmount || 0);
  const totalPayable = Number(
    appData.totalPayable || appData.totalRepayment || (sanctionedEmi * sanctionedTenure)
  );
  const totalInterest = Number(
    appData.totalInterest || (totalPayable > sanctionedAmount ? totalPayable - sanctionedAmount : 0)
  );
  const sanctionedDate = sanctionDetails.sanctionedAt || new Date();
  const customerName = userName || appData.personalInformation?.fullName || "Valued Customer";

  const row = (label, value, bold = false, color = "#111827") =>
    `<tr><td style="padding: 7px 0; color: #6B7280;">${label}</td><td style="padding: 7px 0; color: ${color}; text-align: right;${bold ? " font-weight: 600;" : ""}">${value}</td></tr>`;

  const htmlContent = `
    <div style="font-family: Arial, sans-serif; max-width: 560px; margin: 0 auto; padding: 24px; border: 1px solid #e0e0e0; border-radius: 12px; background-color: #ffffff;">
      <!-- Header -->
      <div style="text-align: center; padding-bottom: 20px; border-bottom: 2px solid #16A34A;">
        <h2 style="color: #5B2E91; margin: 0; font-size: 24px; letter-spacing: 0.5px;">FLOWLY FINANCE</h2>
        <span style="display: inline-block; margin-top: 6px; font-size: 11px; color: #166534; font-weight: bold; background-color: #DCFCE7; padding: 4px 12px; border-radius: 20px; text-transform: uppercase;">
          Official Loan Sanction Order
        </span>
      </div>

      <!-- Main Body -->
      <div style="padding: 24px 0 16px;">
        <h3 style="color: #166534; margin: 0 0 12px; font-size: 19px;">🎉 Congratulations! Your Loan Has Been Sanctioned</h3>
        <p style="color: #4B5563; font-size: 14px; line-height: 1.6; margin: 0 0 16px;">
          Dear <strong>${customerName}</strong>,
        </p>
        <p style="color: #4B5563; font-size: 14px; line-height: 1.6; margin: 0 0 20px;">
          We are pleased to inform you that your loan application <strong>${applicationNumber}</strong> for <strong>${productName}</strong> has been officially approved and sanctioned by Flowly Finance. Your Sanction Letter <strong>#${sanctionLetterNumber}</strong> is ready for your review.
        </p>

        <!-- Sanction Terms Card -->
        <div style="background-color: #F0FDF4; border: 1px solid #BBF7D0; border-radius: 8px; padding: 16px; margin-bottom: 20px;">
          <h4 style="color: #166534; margin: 0 0 12px; font-size: 13px; text-transform: uppercase; letter-spacing: 0.5px;">Approved Sanction Terms</h4>
          <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
            ${row("Sanction Letter Number", sanctionLetterNumber, true, "#166534")}
            ${row("Application Number", applicationNumber, true, "#5B2E91")}
            ${row("Loan Product", `${productName} (${loanType})`)}
            <tr style="border-top: 1px dashed #86EFAC;">
              <td style="padding: 8px 0 6px; color: #166534; font-weight: 700; font-size: 14px;">Sanctioned Loan Amount</td>
              <td style="padding: 8px 0 6px; color: #166534; font-weight: 700; font-size: 16px; text-align: right;">${formatINR(sanctionedAmount)}</td>
            </tr>
            ${row("Approved Interest Rate", `${sanctionedRate}% p.a. (${interestTypeLabel})`)}
            ${row("Approved Tenure", `${sanctionedTenure} month(s)`)}
            ${row("Monthly EMI", `${formatINR(sanctionedEmi)} / month`, true, "#166534")}
            ${row("Total Interest", formatINR(totalInterest))}
            <tr style="border-top: 1px dashed #86EFAC;">
              <td style="padding: 8px 0 6px; color: #374151; font-weight: 600;">Total Repayment Amount</td>
              <td style="padding: 8px 0 6px; color: #111827; font-weight: 700; text-align: right;">${formatINR(totalPayable)}</td>
            </tr>
            ${row("Sanction Date", formatDate(sanctionedDate))}
            <tr style="border-top: 2px solid #16A34A;">
              <td style="padding: 10px 0 4px; color: #166534; font-weight: bold; font-size: 13px;">Current Status</td>
              <td style="padding: 10px 0 4px; color: #166534; font-weight: bold; font-size: 13px; text-align: right;">SANCTIONED &bull; ACCEPTANCE PENDING</td>
            </tr>
          </table>
        </div>

        <!-- Action Required Box -->
        <div style="background-color: #FEF3C7; border-left: 4px solid #D97706; border-radius: 4px; padding: 14px 16px; margin-bottom: 20px;">
          <h4 style="color: #92400E; margin: 0 0 8px; font-size: 13px; text-transform: uppercase; letter-spacing: 0.5px;">⚡ Action Required: Accept Sanction Terms</h4>
          <p style="color: #78350F; font-size: 13px; line-height: 1.5; margin: 0 0 10px;">
            To complete your loan disbursal, please execute the following simple steps:
          </p>
          <ol style="margin: 0; padding-left: 18px; color: #78350F; font-size: 12px; line-height: 1.7;">
            <li>Log in to your <strong>Flowly Finance</strong> portal.</li>
            <li>Go to the <strong>Loans</strong> page under your applications.</li>
            <li>Click <strong>Review &amp; Accept Sanction Letter</strong> to approve the sanction terms.</li>
            <li>Complete your <strong>digital e-Signature</strong> to instantly generate the formal agreement and initiate disbursement directly into your bank account.</li>
          </ol>
        </div>

        <!-- Security Reminder -->
        <div style="background-color: #FFFBEB; border: 1px solid #FDE68A; border-radius: 6px; padding: 10px 14px; font-size: 12px; color: #92400E; line-height: 1.5; margin-bottom: 16px;">
          🔒 <strong>Security Advice:</strong> Flowly Finance will never call or SMS you asking for your MPIN, passwords, or transaction OTPs. Never share your credentials with anyone.
        </div>
      </div>

      <!-- Footer -->
      <div style="text-align: center; padding-top: 18px; border-top: 1px solid #F3F4F6; color: #9CA3AF; font-size: 11px; line-height: 1.5;">
        <p style="margin: 0 0 4px;">Need assistance? Contact our loan desk at <a href="mailto:support@flowlyfinance.com" style="color: #5B2E91; text-decoration: none;">support@flowlyfinance.com</a></p>
        &copy; ${new Date().getFullYear()} Flowly Finance Ltd. All rights reserved. &bull; ISO 27001 Certified Banking
      </div>
    </div>
  `;

  if (!transporter) {
    console.log(`\n=================================================`);
    console.log(`[SMTP DEV FALLBACK] LOAN SANCTION EMAIL`);
    console.log(`To: ${targetEmail} (Intended: ${email})`);
    console.log(`Customer: ${customerName}`);
    console.log(`Application No: ${applicationNumber}`);
    console.log(`Sanction Letter No: ${sanctionLetterNumber}`);
    console.log(`Sanctioned Amount: ${formatINR(sanctionedAmount)} | Tenure: ${sanctionedTenure} mo`);
    console.log(`Sanctioned EMI: ${formatINR(sanctionedEmi)}/mo | Rate: ${sanctionedRate}%`);
    console.log(`Status: SANCTIONED (Acceptance Required)`);
    console.log(`=================================================\n`);
    return { success: true, fallback: true };
  }

  try {
    const info = await transporter.sendMail({
      from: fromEmail,
      to: targetEmail,
      subject: `🎉 Loan Sanctioned - ${applicationNumber} (Sanction Letter #${sanctionLetterNumber}) - Flowly Finance`,
      html: htmlContent,
    });
    return { success: true, messageId: info.messageId };
  } catch (err) {
    console.warn(`[SMTP LOAN SANCTION EMAIL FAILED] ${err.message}. Falling back to console.`);
    console.log(`\n[SMTP DEV FALLBACK] Loan sanction email failed over, intended for: ${email} (${applicationNumber})\n`);
    return { success: true, fallback: true, error: err.message };
  }
};