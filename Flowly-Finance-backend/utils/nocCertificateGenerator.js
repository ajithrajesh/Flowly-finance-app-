import PDFDocument from "pdfkit";
import crypto from "crypto";

/**
 * Format currency in Indian Rupees format (e.g. Rs. 25,000.00)
 */
const formatINR = (n) =>
  `Rs. ${Number(n || 0).toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

/**
 * Format date in standard official bank document format (e.g. 20 October 2026)
 */
const formatDate = (d) => {
  if (!d) return "-";
  return new Date(d).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
};

/**
 * Format date & time (e.g. 20 Oct 2026, 11:30 AM)
 */
const formatDateTime = (d) => {
  if (!d) return "-";
  return new Date(d).toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
};

/**
 * Generates an official Bank No Objection Certificate (NOC) PDF buffer using PDFKit.
 *
 * @param {Object} loan - Populated LoanApplication document
 * @returns {Promise<Buffer>}
 */
export const generateNOCCertificatePDF = (loan) => {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({
        size: "A4",
        margin: 36,
        bufferPages: true,
        autoFirstPage: true,
      });

      const chunks = [];
      doc.on("data", (chunk) => chunks.push(chunk));
      doc.on("end", () => resolve(Buffer.concat(chunks)));
      doc.on("error", reject);

      const noc = loan.nocCertificate || {};
      const user = loan.user || {};
      const account = loan.account || {};

      const certNumber =
        noc.certificateNumber ||
        `NOC-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}-${Math.floor(1000 + Math.random() * 9000)}`;

      const customerName =
        noc.customerName ||
        user.name ||
        loan.personalInformation?.fullName ||
        "Valued Customer";

      const loanAppNo = loan.applicationNumber || `LN-${loan._id.toString().slice(-8).toUpperCase()}`;
      const issueDate = noc.approvedAt || noc.generatedAt || new Date();
      const settlementDate = noc.fullyPaidAt || loan.disbursedAt || new Date();
      const principalAmt = loan.principal || loan.requestedAmount || noc.loanAmount || 0;
      const totalRepaidAmt =
        loan.totalRepayment ||
        loan.totalPayable ||
        (loan.repayments || []).reduce((sum, r) => sum + (r.paidAmount || r.emiAmount || 0), 0) ||
        principalAmt;

      const adminSignatoryName = noc.approvedByName || "Authorized Bank Administrator";
      const remarks = noc.adminRemarks || "All loan dues and obligations fully reconciled with bank books.";

      // Security hash
      const rawHashData = `${loan._id}-${certNumber}-${issueDate.toString()}`;
      const verificationHash = crypto.createHash("sha256").update(rawHashData).digest("hex").slice(0, 24).toUpperCase();

      // Palette
      const bankPrimary = "#064E3B";   // Deep Emerald Green (Official Banking theme)
      const bankSecondary = "#047857"; // Medium Emerald
      const accentGold = "#B45309";    // Warm Amber / Gold
      const darkSlate = "#0F172A";     // Slate 900
      const bodyColor = "#334155";     // Slate 700
      const mutedColor = "#64748B";    // Slate 500
      const cardBg = "#F0FDF4";        // Emerald Tint 50
      const cardBorder = "#A7F3D0";    // Emerald Border 200
      const lightBorder = "#E2E8F0";

      const pageWidth = doc.page.width;
      const pageHeight = doc.page.height;
      const margin = 36;
      const contentWidth = pageWidth - margin * 2;

      // Outer Double Border
      doc
        .rect(16, 16, pageWidth - 32, pageHeight - 32)
        .lineWidth(2)
        .strokeColor(bankPrimary)
        .stroke();

      doc
        .rect(20, 20, pageWidth - 40, pageHeight - 40)
        .lineWidth(0.8)
        .strokeColor(accentGold)
        .stroke();

      // Top Corner Accents
      const drawCorner = (x, y) => {
        doc.rect(x, y, 6, 6).fill(bankPrimary);
      };
      drawCorner(24, 24);
      drawCorner(pageWidth - 30, 24);
      drawCorner(24, pageHeight - 30);
      drawCorner(pageWidth - 30, pageHeight - 30);

      // --- HEADER SECTION ---
      let y = 38;

      // Bank Title
      doc
        .fillColor(bankPrimary)
        .fontSize(21)
        .font("Helvetica-Bold")
        .text("FLOWLY FINANCE BANK", margin, y, { align: "center", characterSpacing: 1 });

      y += 24;
      doc
        .fillColor(accentGold)
        .fontSize(8.5)
        .font("Helvetica-Bold")
        .text("A SCHEDULED COMMERCIAL BANK  |  LICENSED BY RESERVE BANK OF INDIA", margin, y, { align: "center", characterSpacing: 0.5 });

      y += 13;
      doc
        .fillColor(mutedColor)
        .fontSize(8)
        .font("Helvetica")
        .text("Registered Office: Flowly Financial Towers, BKC, Bandra Kurla Complex, Mumbai - 400051", margin, y, { align: "center" });

      y += 11;
      doc
        .fillColor(mutedColor)
        .fontSize(7.5)
        .font("Helvetica")
        .text("CIN: U65191MH2023PTC10987  •  IFSC: FLWB0001008  •  www.flowlyfinance.com", margin, y, { align: "center" });

      y += 16;
      // Decorative line
      doc
        .moveTo(margin + 20, y)
        .lineTo(pageWidth - margin - 20, y)
        .lineWidth(1.2)
        .strokeColor(bankSecondary)
        .stroke();

      y += 12;

      // --- CERTIFICATE TITLE BANNER ---
      doc
        .roundedRect(margin + 40, y, contentWidth - 80, 28, 4)
        .fill(cardBg)
        .strokeColor(cardBorder)
        .lineWidth(1)
        .stroke();

      doc
        .fillColor(bankPrimary)
        .fontSize(13)
        .font("Helvetica-Bold")
        .text("NO OBJECTION CERTIFICATE (NOC)", margin + 40, y + 5, { align: "center", characterSpacing: 0.8 });

      doc
        .fillColor(accentGold)
        .fontSize(7.5)
        .font("Helvetica-Bold")
        .text("LOAN CLOSURE & FULL LIABILITIES DISCHARGE CERTIFICATE", margin + 40, y + 18, { align: "center" });

      y += 38;

      // Metadata Bar (Certificate No & Issue Date)
      doc.rect(margin, y, contentWidth, 22).fill("#F8FAFC").strokeColor(lightBorder).lineWidth(0.8).stroke();

      doc
        .fillColor(darkSlate)
        .fontSize(8.5)
        .font("Helvetica-Bold")
        .text("Certificate Ref No: ", margin + 10, y + 6);
      doc
        .fillColor(bankPrimary)
        .font("Helvetica-Bold")
        .text(certNumber, margin + 98, y + 6);

      doc
        .fillColor(darkSlate)
        .font("Helvetica-Bold")
        .text("Date of Issuance: ", pageWidth - margin - 190, y + 6);
      doc
        .fillColor(bodyColor)
        .font("Helvetica")
        .text(formatDate(issueDate), pageWidth - margin - 105, y + 6);

      y += 32;

      // Recital / Salutation
      doc
        .fillColor(darkSlate)
        .fontSize(10)
        .font("Helvetica-Bold")
        .text("TO WHOMSOEVER IT MAY CONCERN,", margin, y);

      y += 16;
      const certNotice = `This is to certify that the borrower detailed below had availed of a credit facility from Flowly Finance Bank. The Bank hereby certifies and confirms that the borrower has satisfied, fully repaid, and discharged all equated monthly installments (EMIs), interest, and incidental dues in respect of the loan account in full and final settlement.`;

      doc
        .fillColor(bodyColor)
        .fontSize(8.8)
        .font("Helvetica")
        .text(certNotice, margin, y, { width: contentWidth, lineGap: 3, align: "justify" });

      y += 42;

      // --- BORROWER & LOAN SUMMARY TABLE ---
      doc.roundedRect(margin, y, contentWidth, 126, 4).fill(cardBg).strokeColor(cardBorder).lineWidth(1).stroke();

      // Section Title inside Box
      doc
        .fillColor(bankPrimary)
        .fontSize(9.5)
        .font("Helvetica-Bold")
        .text("BORROWER & LOAN FACILITY PARTICULARS", margin + 12, y + 8);

      doc
        .moveTo(margin + 12, y + 21)
        .lineTo(pageWidth - margin - 12, y + 21)
        .lineWidth(0.5)
        .strokeColor(cardBorder)
        .stroke();

      const col1X = margin + 14;
      const val1X = margin + 115;
      const col2X = margin + 270;
      const val2X = margin + 380;

      let rowY = y + 28;
      const printRow = (lbl1, v1, lbl2, v2, isHighlight2 = false) => {
        doc.font("Helvetica-Bold").fontSize(8).fillColor(mutedColor).text(lbl1, col1X, rowY);
        doc.font("Helvetica-Bold").fontSize(8.5).fillColor(darkSlate).text(String(v1 || "-"), val1X, rowY, { width: 145 });

        doc.font("Helvetica-Bold").fontSize(8).fillColor(mutedColor).text(lbl2, col2X, rowY);
        if (isHighlight2) {
          doc.font("Helvetica-Bold").fontSize(8.5).fillColor(bankPrimary).text(String(v2 || "-"), val2X, rowY, { width: 130 });
        } else {
          doc.font("Helvetica").fontSize(8.5).fillColor(darkSlate).text(String(v2 || "-"), val2X, rowY, { width: 130 });
        }
        rowY += 18;
      };

      printRow("Borrower Name:", customerName, "Loan Account No:", loanAppNo);
      printRow("Registered Mobile:", user.phone || loan.personalInformation?.phone || "On Bank File", "Loan Scheme:", loan.productName || loan.loanType || "Personal Micro-Loan");
      printRow("Savings Account:", account.accountNumber || "FLW-SAVINGS", "Sanctioned Principal:", formatINR(principalAmt));
      printRow("Tenure / EMIs:", `${loan.tenureMonths || 0} Month(s)`, "Total Amount Paid:", formatINR(totalRepaidAmt));
      printRow("Settlement Date:", formatDate(settlementDate), "Outstanding Balance:", "Rs. 0.00 (NIL DUE)", true);

      y += 136;

      // --- LEGAL DECLARATION & NON-OBJECTION TERMS ---
      doc
        .fillColor(darkSlate)
        .fontSize(9)
        .font("Helvetica-Bold")
        .text("TERMS OF CERTIFICATION & DISCHARGE:", margin, y);

      y += 14;
      const clauses = [
        "1. All equated monthly installments (EMIs), interest amounts, administrative charges, and penalties under Loan Account " + loanAppNo + " have been received and credited in full to the books of Flowly Finance Bank.",
        "2. As on " + formatDate(issueDate) + ", there are NO OUTSTANDING DUES, LIABILITIES, OR CLAIMS subsisting against the borrower in respect of this credit facility.",
        "3. Flowly Finance Bank has NO OBJECTION to the borrower submitting this certificate to Credit Information Companies (CIBIL, Experian, CRIF High Mark, Equifax) for updating credit bureau clearance records.",
        "4. Any hypothecation, pledge, or lien held by the Bank specifically in connection with this loan stands discharged and released.",
        "5. This certificate constitutes a full, irrevocable, and final discharge of financial liabilities under the aforementioned loan agreement.",
      ];

      clauses.forEach((cl) => {
        doc
          .fillColor(bodyColor)
          .fontSize(8)
          .font("Helvetica")
          .text(cl, margin, y, { width: contentWidth, lineGap: 2 });
        y += 18;
      });

      y += 10;

      // Admin Remarks Note Box (if provided)
      if (remarks) {
        doc.roundedRect(margin, y, contentWidth, 24, 3).fill("#F8FAFC").strokeColor(lightBorder).lineWidth(0.6).stroke();
        doc
          .fillColor(mutedColor)
          .fontSize(7.5)
          .font("Helvetica-Bold")
          .text("ADMINISTRATIVE VERIFICATION REMARKS: ", margin + 8, y + 7);
        doc
          .fillColor(bodyColor)
          .font("Helvetica-Oblique")
          .text(`"${remarks}"`, margin + 175, y + 7, { width: contentWidth - 185 });
        y += 32;
      }

      // --- AUTHORIZATION & SIGNATURE SECTION ---
      y = Math.max(y, pageHeight - margin - 150);

      // Signatory Box
      const sigBoxWidth = 230;
      const sigBoxX = pageWidth - margin - sigBoxWidth;

      doc
        .rect(sigBoxX, y, sigBoxWidth, 75)
        .strokeColor(lightBorder)
        .lineWidth(0.8)
        .stroke();

      doc
        .fillColor(darkSlate)
        .fontSize(8)
        .font("Helvetica-Bold")
        .text("FOR FLOWLY FINANCE BANK", sigBoxX + 10, y + 8);

      doc
        .fillColor(bankPrimary)
        .fontSize(11)
        .font("Helvetica-Bold")
        .text(adminSignatoryName, sigBoxX + 10, y + 26);

      doc
        .fillColor(bodyColor)
        .fontSize(7.5)
        .font("Helvetica")
        .text("Head of Credit Administration & Regulatory Issuance", sigBoxX + 10, y + 40);

      doc
        .fillColor(mutedColor)
        .fontSize(7)
        .font("Helvetica")
        .text(`Approved & Signed on: ${formatDateTime(issueDate)}`, sigBoxX + 10, y + 52);

      doc
        .fillColor(bankSecondary)
        .fontSize(7)
        .font("Helvetica-Bold")
        .text("AUTHENTICATED DIGITAL SIGNATURE", sigBoxX + 10, y + 63);

      // Security Verification Badge / Seal on Left
      const sealX = margin;
      const sealWidth = 240;

      doc
        .rect(sealX, y, sealWidth, 75)
        .strokeColor(cardBorder)
        .lineWidth(0.8)
        .stroke();

      doc
        .fillColor(bankPrimary)
        .fontSize(8.5)
        .font("Helvetica-Bold")
        .text("OFFICIAL BANK VERIFICATION & DIGITAL SEAL", sealX + 8, y + 8);

      doc
        .fillColor(mutedColor)
        .fontSize(7)
        .font("Helvetica")
        .text("Security Validation Hash:", sealX + 8, y + 23);

      doc
        .fillColor(darkSlate)
        .fontSize(7.5)
        .font("Courier-Bold")
        .text(verificationHash, sealX + 8, y + 34, { width: sealWidth - 16 });

      doc
        .fillColor(mutedColor)
        .fontSize(7)
        .font("Helvetica")
        .text("Status: VERIFIED & OFFICIALLY ISSUED", sealX + 8, y + 49);

      doc
        .fillColor(accentGold)
        .fontSize(7)
        .font("Helvetica-Bold")
        .text("Flowly Core Banking Ledger Reconciled • NIL DUE", sealX + 8, y + 61);

      // Footer notice
      doc
        .fillColor(mutedColor)
        .fontSize(6.8)
        .font("Helvetica")
        .text(
          "Notice: This is an authentic computer-generated official banking document issued under digital authorization. No physical signature is required. Any unauthorized alteration renders this certificate invalid. For verification, visit https://flowlyfinance.com/verify-noc",
          margin,
          pageHeight - margin - 22,
          { align: "center", width: contentWidth }
        );

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
};

export default generateNOCCertificatePDF;
