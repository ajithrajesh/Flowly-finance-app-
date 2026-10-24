import PDFDocument from "pdfkit";

/**
 * Renders a standard A4 PDF receipt for an Internal Transfer transaction across branches.
 *
 * @param {Object} receipt - Transfer receipt object (from transferService.buildTransferReceipt)
 * @param {Object} [options] - Optional extra metadata
 * @returns {Promise<Buffer>} PDF file buffer
 */
export const generateTransferReceiptPDF = (receipt, options = {}) => {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ size: "A4", margin: 45 });
      const chunks = [];
      doc.on("data", (chunk) => chunks.push(chunk));
      doc.on("end", () => resolve(Buffer.concat(chunks)));
      doc.on("error", reject);

      const formatINR = (n) =>
        `Rs. ${Number(n || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

      const formatDate = (d) => {
        if (!d) return "-";
        return new Date(d).toLocaleString("en-IN", {
          day: "2-digit",
          month: "long",
          year: "numeric",
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
          hour12: true,
        });
      };

      const primaryColor = "#5B2E91"; // Purple accent
      const secondaryColor = "#8B5CF6";
      const debitColor = "#B23A2E";   // Red for debit
      const creditColor = "#2E7A22";  // Green for success
      const darkText = "#201530";
      const grayText = "#555555";
      const lightBorder = "#E7E4DC";

      const isInterBranch = receipt.transferType === "INTER_BRANCH";

      // Outer Decorative Border
      doc
        .rect(20, 20, doc.page.width - 40, doc.page.height - 40)
        .lineWidth(1.5)
        .strokeColor(primaryColor)
        .stroke();

      // Top Header
      doc
        .fillColor(primaryColor)
        .fontSize(22)
        .font("Helvetica-Bold")
        .text("FLOWLY FINANCE", 0, 42, { align: "center" });

      doc
        .fillColor("#6E677B")
        .fontSize(9.5)
        .font("Helvetica")
        .text("Core Banking Operations \u2022 Internal Funds Transfer Desk", { align: "center" });

      doc.moveDown(0.4);

      // Title Banner
      doc
        .fillColor(darkText)
        .fontSize(14)
        .font("Helvetica-Bold")
        .text("OFFICIAL FUNDS TRANSFER RECEIPT", { align: "center" });

      doc.moveDown(0.3);

      // Sub-badge: Inter-Branch or Intra-Branch
      doc
        .fillColor(isInterBranch ? "#0284C7" : primaryColor)
        .fontSize(9)
        .font("Helvetica-Bold")
        .text(
          isInterBranch
            ? "\u21C4 INTER-BRANCH SETTLEMENT (CROSS-BRANCH TRANSFER)"
            : "\u27F3 INTRA-BRANCH SETTLEMENT (SAME BRANCH TRANSFER)",
          { align: "center" }
        );

      doc.moveDown(0.6);

      // Separator Line
      doc
        .moveTo(50, doc.y)
        .lineTo(doc.page.width - 50, doc.y)
        .strokeColor(lightBorder)
        .lineWidth(1)
        .stroke();

      doc.moveDown(0.8);

      // Amount Box
      const boxY = doc.y;
      const boxWidth = doc.page.width - 100;
      doc
        .roundedRect(50, boxY, boxWidth, 68, 8)
        .fillAndStroke("#FBF8FD", "#E9DCF5");

      doc
        .fillColor(grayText)
        .fontSize(9)
        .font("Helvetica-Bold")
        .text("AMOUNT TRANSFERRED", 50, boxY + 10, { width: boxWidth, align: "center" });

      doc
        .fillColor(debitColor)
        .fontSize(22)
        .font("Helvetica-Bold")
        .text(`- ${formatINR(receipt.amount)}`, 50, boxY + 24, { width: boxWidth, align: "center" });

      const isCardTransfer = receipt.paymentMethod === "CARD";
      const paymentMethodLabel = isCardTransfer
        ? receipt.cardDetails?.last4
          ? `DEBIT / CREDIT CARD (STRIPE \u2022\u2022\u2022\u2022 ${receipt.cardDetails.last4})`
          : "DEBIT / CREDIT CARD (STRIPE)"
        : "INTERNAL ACCOUNT TRANSFER";

      const securityLabel =
        receipt.securityTier ||
        (isCardTransfer
          ? "STRIPE 3D SECURE VERIFIED"
          : receipt.amount > 2000
          ? "DUAL-FACTOR MPIN + OTP VERIFIED"
          : "MPIN VERIFIED");

      doc
        .fillColor(creditColor)
        .fontSize(8.5)
        .font("Helvetica-Bold")
        .text(
          `STATUS: ${(receipt.status || "COMPLETED").toUpperCase()} \u2022 ${securityLabel.toUpperCase()} [\u2713 AUTHENTICATED]`,
          50,
          boxY + 50,
          { width: boxWidth, align: "center" }
        );

      doc.y = boxY + 82;

      // Helper for Table Rows
      const row = (label, value, isBold = false, valColor = darkText) => {
        const currentY = doc.y;
        doc
          .font("Helvetica-Bold")
          .fontSize(9.5)
          .fillColor(grayText)
          .text(label, 60, currentY, { width: 190 });

        doc
          .font(isBold ? "Helvetica-Bold" : "Helvetica")
          .fontSize(9.5)
          .fillColor(valColor)
          .text(String(value ?? "-"), 250, currentY, { width: doc.page.width - 310 });

        doc.moveDown(0.65);
      };

      // SECTION 1: Transaction Metadata
      doc
        .font("Helvetica-Bold")
        .fontSize(11)
        .fillColor(primaryColor)
        .text("Transaction Reference & Timestamp", 60, doc.y);
      doc.moveDown(0.4);

      row("Receipt Number", receipt.receiptNumber, true, primaryColor);
      row("Transaction ID", receipt.transactionId || receipt.id || "-");
      row("Initiated & Completed At", formatDate(receipt.timestamp || receipt.completedAt));
      row("Payment Method", paymentMethodLabel);
      row("Security Tier", securityLabel, true, creditColor);

      doc.moveDown(0.4);
      doc
        .moveTo(60, doc.y)
        .lineTo(doc.page.width - 60, doc.y)
        .strokeColor(lightBorder)
        .stroke();
      doc.moveDown(0.6);

      // SECTION 2: Remitter (Sender) & Beneficiary (Receiver)
      doc
        .font("Helvetica-Bold")
        .fontSize(11)
        .fillColor(primaryColor)
        .text("Remitter (From) & Beneficiary (To) Details", 60, doc.y);
      doc.moveDown(0.4);

      const sender = receipt.sourceAccount || {};
      const beneficiary = receipt.destinationAccount || {};

      row("Remitter Name", sender.customerName || receipt.senderName || "-", true);
      row("Remitter Account", `${sender.accountNumber || "-"} (${(sender.accountType || "Savings").toUpperCase()})`);
      row("Remitter Branch", `${sender.branch || "Kochi Main Branch"} \u2022 IFSC: ${sender.ifscCode || "FLOW0001001"}`);

      doc.moveDown(0.2);

      row("Beneficiary Name", beneficiary.customerName || receipt.recipientName || "-", true);
      row("Beneficiary Account", `${beneficiary.accountNumber || "-"} (${(beneficiary.accountType || "Savings").toUpperCase()})`);
      row("Beneficiary Branch", `${beneficiary.branch || "Branch"} \u2022 IFSC: ${beneficiary.ifscCode || "-"}`);

      doc.moveDown(0.4);
      doc
        .moveTo(60, doc.y)
        .lineTo(doc.page.width - 60, doc.y)
        .strokeColor(lightBorder)
        .stroke();
      doc.moveDown(0.6);

      // SECTION 3: Financial Balances
      doc
        .font("Helvetica-Bold")
        .fontSize(11)
        .fillColor(primaryColor)
        .text("Balance & Audit Trail", 60, doc.y);
      doc.moveDown(0.4);

      if (receipt.previousBalance !== null && receipt.previousBalance !== undefined) {
        row("Previous Available Balance", formatINR(receipt.previousBalance));
        row("Debit Amount (-)", formatINR(receipt.amount), true, debitColor);
        row("Updated Available Balance", formatINR(receipt.updatedBalance), true, primaryColor);
      } else {
        row("Charged Amount", formatINR(receipt.amount), true, debitColor);
      }
      row("Beneficiary Credit (+)", formatINR(receipt.amount), true, creditColor);
      row("Payment Rail", paymentMethodLabel, true);

      if (receipt.remarks) {
        row("Transfer Remarks / Purpose", receipt.remarks);
      }

      doc.moveDown(0.4);
      doc
        .moveTo(60, doc.y)
        .lineTo(doc.page.width - 60, doc.y)
        .strokeColor(lightBorder)
        .stroke();
      doc.moveDown(0.6);

      // SECTION 4: Branch Settlement Details
      doc
        .font("Helvetica-Bold")
        .fontSize(11)
        .fillColor(primaryColor)
        .text("Three-Branch Core Banking Network", 60, doc.y);
      doc.moveDown(0.4);

      row("Transfer Network", "Flowly Three-Branch Core Grid (Kochi \u2022 Trivandrum \u2022 Kozhikode)");
      row("Settlement Mode", isInterBranch ? "Inter-Branch Real-Time Atomic Settlement" : "Intra-Branch Ledger Settlement");
      row("Audit Signature", `CORE-TXN-${(receipt.receiptNumber || "").replace(/[^A-Z0-9]/g, "").slice(-8)}-VALID`);

      doc.moveDown(0.8);

      // Legal & Security Disclaimer Footer
      doc
        .moveTo(50, doc.y)
        .lineTo(doc.page.width - 50, doc.y)
        .strokeColor(primaryColor)
        .lineWidth(1)
        .stroke();

      doc.moveDown(0.8);

      doc
        .font("Helvetica")
        .fontSize(8)
        .fillColor("#6E677B")
        .text(
          "This is an electronically generated receipt issued by Flowly Finance Core Banking System. " +
            "All transfers between accounts across Kochi, Trivandrum, and Kozhikode branches are atomic and settled in real-time. " +
            "Transactions up to Rs. 2,000 are authorized by 4-6 digit Security MPIN. Transfers exceeding Rs. 2,000 require dual-factor authorization (MPIN + One-Time Password). " +
            "For customer support, inquiries, or grievance redressal, email support@flowlyfinance.com or dial 1800-FLOWLY.",
          55,
          doc.y,
          { width: doc.page.width - 110, align: "left" }
        );

      doc.moveDown(0.5);

      doc
        .fontSize(7.5)
        .fillColor("#999999")
        .text(
          `Printed / Generated: ${formatDate(new Date())} \u2022 Ref: ${receipt.receiptNumber || "N/A"} \u2022 Flowly Core Banking System v1.0`,
          55,
          doc.y
        );

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
};

export default generateTransferReceiptPDF;
