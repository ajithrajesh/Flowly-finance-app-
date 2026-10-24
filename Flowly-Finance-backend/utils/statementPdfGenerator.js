import PDFDocument from "pdfkit";

/**
 * Format currency in Indian Rupees format (e.g. ₹ 25,000.00)
 */
const formatINR = (n) =>
  `₹ ${Number(n || 0).toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

/**
 * Format date in readable format (e.g. 17 Oct 2026)
 */
const formatDate = (d) => {
  if (!d) return "-";
  return new Date(d).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
};

/**
 * Format time in readable format (e.g. 11:30 AM)
 */
const formatTime = (d) => {
  if (!d) return "";
  return new Date(d).toLocaleTimeString("en-IN", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
};

/**
 * Format date and time (e.g. 17 Oct 2026, 11:30 AM)
 */
const formatDateTime = (d) => {
  if (!d) return "-";
  return `${formatDate(d)}, ${formatTime(d)}`;
};

/**
 * Generates an A4 Official Bank Account Statement PDF Buffer using PDFKit.
 *
 * @param {Object} data - Structured statement data
 * @param {Object} data.customer - Complete Customer details (name, email, phone, address, kycStatus, cifNumber)
 * @param {Object} data.account - Complete Bank Account details (accountNumber, maskedAccountNumber, accountType, status, branch, ifscCode, micrCode, currency, currentBalance)
 * @param {Object} data.statement - Statement metadata (statementId, monthName, periodKey, startDate, endDate, generatedAt, isAllTime)
 * @param {Object} data.financials - Balances & totals (openingBalance, closingBalance, totalCredits, creditCount, totalDebits, debitCount, netChange, transactionCount)
 * @param {Array} data.transactions - Array of transactions in the period (date, description, receiptNumber, type, status, isCredit, amount, balance)
 * @returns {Promise<Buffer>}
 */
export const generateStatementPDF = (data) => {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({
        size: "A4",
        margin: 32,
        bufferPages: true,
        autoFirstPage: true,
      });

      const chunks = [];
      doc.on("data", (chunk) => chunks.push(chunk));
      doc.on("end", () => resolve(Buffer.concat(chunks)));
      doc.on("error", reject);

      const { customer = {}, account = {}, statement = {}, financials = {}, transactions = [] } = data;

      // Color Palette
      const primaryColor = "#5B2E91";    // Flowly Brand Purple
      const secondaryColor = "#7C3AED";  // Accent Violet
      const darkText = "#0F172A";        // Slate 900
      const grayText = "#334155";        // Slate 700
      const mutedText = "#64748B";       // Slate 500
      const lightBorder = "#E2E8F0";     // Slate 200
      const cardBg = "#F8FAFC";          // Slate 50
      const creditColor = "#16A34A";     // Emerald Green
      const debitColor = "#DC2626";      // Rose Red
      const headerBg = "#F3EEF9";        // Table header purple tint

      const pageWidth = doc.page.width;
      const pageHeight = doc.page.height;
      const leftMargin = 32;
      const rightMargin = pageWidth - 32;
      const contentWidth = rightMargin - leftMargin; // ~531.28 pt

      // Helper function to render table headers
      const renderTableHeader = (currentY) => {
        doc.roundedRect(leftMargin, currentY, contentWidth, 22, 4).fill(headerBg);

        doc.fillColor(primaryColor).fontSize(7.5).font("Helvetica-Bold");

        doc.text("DATE & TIME", leftMargin + 6, currentY + 7, { width: 70 });
        doc.text("DESCRIPTION / DETAILS", leftMargin + 78, currentY + 7, { width: 120 });
        doc.text("REF / TXN ID", leftMargin + 200, currentY + 7, { width: 84 });
        doc.text("TYPE", leftMargin + 286, currentY + 7, { width: 62, align: "center" });
        doc.text("STATUS", leftMargin + 350, currentY + 7, { width: 44, align: "center" });
        doc.text("DEBIT (₹)", leftMargin + 396, currentY + 7, { width: 44, align: "right" });
        doc.text("CREDIT (₹)", leftMargin + 442, currentY + 7, { width: 44, align: "right" });
        doc.text("BALANCE (₹)", leftMargin + 488, currentY + 7, { width: 40, align: "right" });

        return currentY + 26;
      };

      // Helper function for continuation header on subsequent pages
      const renderContinuationHeader = () => {
        // Top accent line
        doc.rect(leftMargin, 16, contentWidth, 3).fill(primaryColor);

        doc.fillColor(primaryColor).fontSize(11).font("Helvetica-Bold").text("FLOWLY FINANCE", leftMargin, 24);
        doc
          .fillColor(mutedText)
          .fontSize(8)
          .font("Helvetica")
          .text(
            `Account: ${account.accountNumber || ""} • ${statement.monthName || "Comprehensive Bank Statement"} (Continued)`,
            leftMargin,
            37
          );

        doc
          .moveTo(leftMargin, 48)
          .lineTo(rightMargin, 48)
          .strokeColor(lightBorder)
          .lineWidth(0.8)
          .stroke();

        return renderTableHeader(54);
      };

      // --- PAGE 1: HEADER ---
      // Top colored accent bar
      doc.rect(leftMargin, 14, contentWidth, 4).fill(primaryColor);

      // Bank Brand & Title
      doc.fillColor(primaryColor).fontSize(18).font("Helvetica-Bold").text("FLOWLY FINANCE", leftMargin, 25);
      doc
        .fillColor(mutedText)
        .fontSize(8)
        .font("Helvetica")
        .text("Licensed Core Banking & Unified Financial Services • ISO 27001 Certified", leftMargin, 46);

      // Statement Title on the right
      doc
        .fillColor(darkText)
        .fontSize(12)
        .font("Helvetica-Bold")
        .text("OFFICIAL BANK STATEMENT", leftMargin + 260, 25, { width: contentWidth - 260, align: "right" });

      doc
        .fillColor(primaryColor)
        .fontSize(8.5)
        .font("Helvetica-Bold")
        .text(statement.monthName || "All Recorded Transactions", leftMargin + 260, 40, {
          width: contentWidth - 260,
          align: "right",
        });

      doc
        .fillColor(mutedText)
        .fontSize(7.5)
        .font("Helvetica")
        .text(
          `Period: ${formatDate(statement.startDate)} to ${formatDate(statement.endDate)}`,
          leftMargin + 260,
          53,
          { width: contentWidth - 260, align: "right" }
        )
        .text(
          `Generated: ${formatDateTime(statement.generatedAt || new Date())}`,
          leftMargin + 260,
          64,
          { width: contentWidth - 260, align: "right" }
        );

      // Separator Line
      doc
        .moveTo(leftMargin, 77)
        .lineTo(rightMargin, 77)
        .strokeColor(lightBorder)
        .lineWidth(1)
        .stroke();

      // --- CUSTOMER & ACCOUNT DETAILS (TWO SIDE-BY-SIDE CARDS) ---
      const detailsY = 85;
      const boxWidth = (contentWidth - 12) / 2;
      const boxHeight = 90;

      // Left Box: Account Holder Details
      doc
        .roundedRect(leftMargin, detailsY, boxWidth, boxHeight, 6)
        .fillAndStroke(cardBg, lightBorder);

      doc
        .fillColor(primaryColor)
        .fontSize(8)
        .font("Helvetica-Bold")
        .text("ACCOUNT HOLDER DETAILS", leftMargin + 10, detailsY + 8);

      doc
        .fillColor(darkText)
        .fontSize(10)
        .font("Helvetica-Bold")
        .text(customer.name || "Customer", leftMargin + 10, detailsY + 22);

      const kycLabel = customer.kycStatus === "verified" ? "Verified Customer ✓" : customer.kycStatus || "Active";

      doc
        .fillColor(grayText)
        .fontSize(8)
        .font("Helvetica")
        .text(`Email: ${customer.email || "-"}`, leftMargin + 10, detailsY + 36)
        .text(`Phone: ${customer.phone ? `+91 ${customer.phone}` : "-"}`, leftMargin + 10, detailsY + 48)
        .text(`Customer CIF: ${customer.cifNumber || "-"}`, leftMargin + 10, detailsY + 60)
        .text(
          `KYC Status: ${kycLabel}   |   Address: ${customer.address || "Registered Branch Address"}`,
          leftMargin + 10,
          detailsY + 72,
          { width: boxWidth - 20, height: 14, ellipsis: true }
        );

      // Right Box: Complete Bank Account Details
      const rightBoxX = leftMargin + boxWidth + 12;
      doc
        .roundedRect(rightBoxX, detailsY, boxWidth, boxHeight, 6)
        .fillAndStroke(cardBg, lightBorder);

      doc
        .fillColor(primaryColor)
        .fontSize(8)
        .font("Helvetica-Bold")
        .text("COMPLETE BANK ACCOUNT DETAILS", rightBoxX + 10, detailsY + 8);

      doc
        .fillColor(darkText)
        .fontSize(10)
        .font("Helvetica-Bold")
        .text(`A/C: ${account.accountNumber || "-"}`, rightBoxX + 10, detailsY + 22);

      doc
        .fillColor(grayText)
        .fontSize(8)
        .font("Helvetica")
        .text(`Account Type: ${account.accountType || "Savings Account"}`, rightBoxX + 10, detailsY + 36)
        .text(`Account Status: ${account.status || "ACTIVE"} ✓`, rightBoxX + 10, detailsY + 48)
        .text(`IFSC: ${account.ifscCode || "FLOW0001001"}   |   MICR: ${account.micrCode || "682001005"}`, rightBoxX + 10, detailsY + 60)
        .text(`Branch: ${account.branch || "Kochi Main Branch"}`, rightBoxX + 10, detailsY + 72);

      // --- FINANCIAL SUMMARY CARDS (4 COLUMNS) ---
      const summaryY = detailsY + boxHeight + 10;
      const cardWidth = (contentWidth - 18) / 4;
      const cardHeight = 48;

      const summaryCards = [
        {
          title: "OPENING BALANCE",
          value: formatINR(financials.openingBalance),
          subtext: `as of ${formatDate(statement.startDate)}`,
          color: darkText,
          bg: "#F8FAFC",
        },
        {
          title: "TOTAL CREDITS",
          value: `+ ${formatINR(financials.totalCredits)}`,
          subtext: `${financials.creditCount || 0} movement(s)`,
          color: creditColor,
          bg: "#F0FDF4",
        },
        {
          title: "TOTAL DEBITS",
          value: `- ${formatINR(financials.totalDebits)}`,
          subtext: `${financials.debitCount || 0} movement(s)`,
          color: debitColor,
          bg: "#FEF2F2",
        },
        {
          title: "AVAILABLE BALANCE",
          value: formatINR(financials.closingBalance),
          subtext: `Current Account Balance`,
          color: primaryColor,
          bg: "#F3EEF9",
        },
      ];

      summaryCards.forEach((card, idx) => {
        const cardX = leftMargin + idx * (cardWidth + 6);
        doc
          .roundedRect(cardX, summaryY, cardWidth, cardHeight, 5)
          .fillAndStroke(card.bg, lightBorder);

        doc
          .fillColor(mutedText)
          .fontSize(6.8)
          .font("Helvetica-Bold")
          .text(card.title, cardX + 6, summaryY + 7, { width: cardWidth - 12, align: "center" });

        doc
          .fillColor(card.color)
          .fontSize(9.5)
          .font("Helvetica-Bold")
          .text(card.value, cardX + 4, summaryY + 19, { width: cardWidth - 8, align: "center" });

        doc
          .fillColor(mutedText)
          .fontSize(6.5)
          .font("Helvetica")
          .text(card.subtext, cardX + 6, summaryY + 33, { width: cardWidth - 12, align: "center" });
      });

      // --- TRANSACTIONS SECTION ---
      let currentY = summaryY + cardHeight + 14;

      doc
        .fillColor(primaryColor)
        .fontSize(9.5)
        .font("Helvetica-Bold")
        .text("STATEMENT OF TRANSACTIONS", leftMargin, currentY);

      doc
        .fillColor(mutedText)
        .fontSize(7.5)
        .font("Helvetica")
        .text(
          `Showing all ${transactions.length} transaction(s) recorded in database`,
          leftMargin + 180,
          currentY + 1,
          { width: contentWidth - 180, align: "right" }
        );

      currentY += 14;
      currentY = renderTableHeader(currentY);

      // Check for zero transactions
      if (!transactions || transactions.length === 0) {
        doc
          .roundedRect(leftMargin, currentY + 6, contentWidth, 54, 4)
          .fillAndStroke("#F8FAFC", lightBorder);

        doc
          .fillColor(grayText)
          .fontSize(9)
          .font("Helvetica-Bold")
          .text(
            "No financial transactions recorded for this account.",
            leftMargin,
            currentY + 18,
            { width: contentWidth, align: "center" }
          );

        doc
          .fillColor(mutedText)
          .fontSize(8)
          .font("Helvetica")
          .text(
            `The available balance is ${formatINR(financials.closingBalance)}. Transactions will appear as deposits, withdrawals, or transfers occur.`,
            leftMargin,
            currentY + 33,
            { width: contentWidth, align: "center" }
          );

        currentY += 66;
      } else {
        // Render transaction rows
        const rowHeight = 24;

        transactions.forEach((txn, index) => {
          // Check for page overflow
          if (currentY + rowHeight > pageHeight - 65) {
            doc.addPage();
            currentY = renderContinuationHeader();
          }

          // Alternating row background
          if (index % 2 === 1) {
            doc.rect(leftMargin, currentY, contentWidth, rowHeight).fill("#FAFAFC");
          }

          // Row separator line
          doc
            .moveTo(leftMargin, currentY + rowHeight)
            .lineTo(rightMargin, currentY + rowHeight)
            .strokeColor("#F1F5F9")
            .lineWidth(0.5)
            .stroke();

          const datePart = formatDate(txn.date);
          const timePart = formatTime(txn.date);
          const descStr = (txn.description || "Account transaction").replace(/\n/g, " ");
          const refStr = txn.receiptNumber || txn.refId || "-";
          const typeLabel = txn.type ? String(txn.type).toUpperCase() : txn.isCredit ? "CREDIT" : "DEBIT";
          const statusText = txn.status ? String(txn.status).toUpperCase() : "COMPLETED";

          // Date & Time (two lines)
          doc.fillColor(darkText).fontSize(7.2).font("Helvetica-Bold").text(datePart, leftMargin + 6, currentY + 4, { width: 70 });
          doc.fillColor(mutedText).fontSize(6.5).font("Helvetica").text(timePart, leftMargin + 6, currentY + 13, { width: 70 });

          // Description / Details
          doc.fillColor(darkText).fontSize(7.2).font("Helvetica").text(descStr, leftMargin + 78, currentY + 4, {
            width: 120,
            height: 18,
            ellipsis: true,
          });

          // Reference ID
          doc.fillColor(mutedText).fontSize(6.8).font("Helvetica").text(refStr, leftMargin + 200, currentY + 6, {
            width: 84,
            height: 14,
            ellipsis: true,
          });

          // Type
          doc
            .fillColor(primaryColor)
            .fontSize(6.5)
            .font("Helvetica-Bold")
            .text(typeLabel, leftMargin + 286, currentY + 6, { width: 62, align: "center" });

          // Status Badge Pill
          const statusBg = statusText === "FAILED" ? "#FEF2F2" : statusText === "PENDING" ? "#FFFBEB" : "#ECFDF5";
          const statusColor = statusText === "FAILED" ? debitColor : statusText === "PENDING" ? "#D97706" : creditColor;

          doc.roundedRect(leftMargin + 350, currentY + 4, 44, 15, 3).fill(statusBg);
          doc
            .fillColor(statusColor)
            .fontSize(6.2)
            .font("Helvetica-Bold")
            .text(statusText, leftMargin + 350, currentY + 7, { width: 44, align: "center" });

          // Debit Amount
          if (!txn.isCredit && txn.amount > 0) {
            doc
              .fillColor(debitColor)
              .fontSize(7.5)
              .font("Helvetica-Bold")
              .text(`-${formatINR(txn.amount).replace("₹ ", "")}`, leftMargin + 396, currentY + 6, {
                width: 44,
                align: "right",
              });
          } else {
            doc.fillColor(mutedText).fontSize(7.2).font("Helvetica").text("-", leftMargin + 396, currentY + 6, {
              width: 44,
              align: "right",
            });
          }

          // Credit Amount
          if (txn.isCredit && txn.amount > 0) {
            doc
              .fillColor(creditColor)
              .fontSize(7.5)
              .font("Helvetica-Bold")
              .text(`+${formatINR(txn.amount).replace("₹ ", "")}`, leftMargin + 442, currentY + 6, {
                width: 44,
                align: "right",
              });
          } else {
            doc.fillColor(mutedText).fontSize(7.2).font("Helvetica").text("-", leftMargin + 442, currentY + 6, {
              width: 44,
              align: "right",
            });
          }

          // Running Balance
          doc
            .fillColor(primaryColor)
            .fontSize(7.5)
            .font("Helvetica-Bold")
            .text(formatINR(txn.balance).replace("₹ ", ""), leftMargin + 488, currentY + 6, {
              width: 40,
              align: "right",
            });

          currentY += rowHeight;
        });
      }

      // --- STATEMENT SUMMARY FOOTER / RECONCILIATION BLOCK ---
      if (currentY + 75 > pageHeight - 65) {
        doc.addPage();
        currentY = 36;
      } else {
        currentY += 12;
      }

      doc
        .roundedRect(leftMargin, currentY, contentWidth, 48, 5)
        .fillAndStroke("#FBFBFE", lightBorder);

      doc
        .fillColor(primaryColor)
        .fontSize(8)
        .font("Helvetica-Bold")
        .text("STATEMENT RECONCILIATION & CERTIFICATION", leftMargin + 10, currentY + 7);

      const netDelta = (financials.totalCredits || 0) - (financials.totalDebits || 0);
      const netDeltaStr =
        netDelta >= 0 ? `+ ${formatINR(netDelta)}` : `- ${formatINR(Math.abs(netDelta))}`;

      doc
        .fillColor(grayText)
        .fontSize(7.5)
        .font("Helvetica")
        .text(
          `Opening Balance: ${formatINR(financials.openingBalance)}   |   Total Credits: +${formatINR(
            financials.totalCredits
          )}   |   Total Debits: -${formatINR(financials.totalDebits)}   |   Net Flow: ${netDeltaStr}`,
          leftMargin + 10,
          currentY + 20
        )
        .text(
          `Official Statement ID: ${statement.statementId || "FLWSTM-ALL-" + account.accountNumber}   •   Certified by Flowly Automated Core Banking Ledger`,
          leftMargin + 10,
          currentY + 32
        );

      // Important Disclaimers block
      currentY += 56;
      doc
        .fillColor(mutedText)
        .fontSize(6.8)
        .font("Helvetica")
        .text(
          "• Important Note: Please verify all entries in this bank statement promptly. Report any discrepancies to support@flowlyfinance.com within 14 calendar days.",
          leftMargin,
          currentY,
          { width: contentWidth }
        )
        .text(
          "• Security Reminder: Flowly Finance representatives will never request your MPIN, Passwords, or OTP. Never disclose sensitive banking credentials.",
          leftMargin,
          currentY + 10,
          { width: contentWidth }
        )
        .text(
          "• This is a system-generated electronic document issued pursuant to core banking guidelines and does not require a physical signature.",
          leftMargin,
          currentY + 20,
          { width: contentWidth }
        );

      // --- ADD PAGE NUMBERS AND RUNNING FOOTERS TO ALL PAGES ---
      const totalPages = doc.bufferedPageRange().count;
      for (let i = 0; i < totalPages; i++) {
        doc.switchToPage(i);

        // Footer separator line
        doc
          .moveTo(leftMargin, pageHeight - 30)
          .lineTo(rightMargin, pageHeight - 30)
          .strokeColor(lightBorder)
          .lineWidth(0.6)
          .stroke();

        doc
          .fillColor(mutedText)
          .fontSize(7)
          .font("Helvetica")
          .text(
            "Flowly Finance • 24x7 Customer Support: support@flowlyfinance.com • www.flowlyfinance.com",
            leftMargin,
            pageHeight - 22
          );

        doc
          .fillColor(mutedText)
          .fontSize(7)
          .font("Helvetica")
          .text(`Page ${i + 1} of ${totalPages}`, leftMargin + 300, pageHeight - 22, {
            width: contentWidth - 300,
            align: "right",
          });
      }

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
};

export default generateStatementPDF;
