import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import PDFDocument from "pdfkit";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const uploadsDir = path.join(__dirname, "..", "uploads");

if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

export function createSamplePdf({ title, docType, docNumber, holderName, details, filename }) {
  return new Promise((resolve, reject) => {
    const filePath = path.join(uploadsDir, filename);
    const doc = new PDFDocument({ size: "A4", margin: 40 });
    const stream = fs.createWriteStream(filePath);

    doc.pipe(stream);

    const primaryColor = "#5B2E91";
    const darkColor = "#1F2937";
    const grayColor = "#4B5563";
    const accentGreen = "#059669";

    // Outer decorative border
    doc
      .rect(20, 20, doc.page.width - 40, doc.page.height - 40)
      .lineWidth(2)
      .strokeColor(primaryColor)
      .stroke();

    doc
      .rect(24, 24, doc.page.width - 48, doc.page.height - 48)
      .lineWidth(0.5)
      .strokeColor("#D1D5DB")
      .stroke();

    // Top Header Banner
    doc
      .fillColor(primaryColor)
      .fontSize(22)
      .font("Helvetica-Bold")
      .text("FLOWLY NATIONAL BANK", 40, 50, { align: "center" });

    doc
      .fillColor(grayColor)
      .fontSize(9)
      .font("Helvetica")
      .text("DIGITAL BANKING REPOSITORY • VERIFIED CUSTOMER ATTACHMENT", { align: "center" });

    doc.moveDown(0.8);

    // Document Type Banner
    doc
      .rect(40, 95, doc.page.width - 80, 36)
      .fillColor("#F3EEF9")
      .fill();

    doc
      .fillColor(primaryColor)
      .fontSize(14)
      .font("Helvetica-Bold")
      .text(title.toUpperCase(), 45, 107, { align: "center" });

    doc.moveDown(2);

    // Document Details Box
    doc
      .roundedRect(40, 150, doc.page.width - 80, 220, 8)
      .lineWidth(1)
      .strokeColor("#E5E7EB")
      .fillColor("#FAFAFA")
      .fillAndStroke();

    let curY = 170;
    const drawRow = (label, val, isHighlight = false) => {
      doc
        .fillColor(grayColor)
        .fontSize(11)
        .font("Helvetica")
        .text(label, 60, curY);

      doc
        .fillColor(isHighlight ? accentGreen : darkColor)
        .fontSize(11)
        .font(isHighlight ? "Helvetica-Bold" : "Helvetica-Bold")
        .text(val, 240, curY);

      curY += 24;
    };

    drawRow("Document Classification:", docType);
    drawRow("Reference Identifier:", docNumber, true);
    drawRow("Document Holder / Applicant:", holderName);
    drawRow("Verification Agency:", "Flowly Secure KYC & Loan Underwriting");
    drawRow("Digital OCR Status:", "VERIFIED (Match 98.4%)", true);
    drawRow("Timestamp of Verification:", new Date().toLocaleDateString("en-IN", { day: "2-digit", month: "long", year: "numeric" }));

    if (details && Array.isArray(details)) {
      details.forEach((d) => {
        drawRow(d.label, d.value);
      });
    }

    // Security & Compliance Stamp Box
    doc
      .roundedRect(40, 390, doc.page.width - 80, 100, 6)
      .fillColor("#F0FDF4")
      .strokeColor("#BBF7D0")
      .fillAndStroke();

    doc
      .fillColor(accentGreen)
      .fontSize(12)
      .font("Helvetica-Bold")
      .text("✓ OFFICIAL COMPLIANCE VERIFICATION PASSED", 60, 405);

    doc
      .fillColor(grayColor)
      .fontSize(9.5)
      .font("Helvetica")
      .text(
        "This copy was digitally validated through automated optical character recognition (OCR) and certified by the central loan processing division. The document has been checked against official registry databases for authenticity and compliance.",
        60,
        425,
        { width: doc.page.width - 120, lineGap: 3 }
      );

    // Official Stamp Simulation
    doc
      .circle(doc.page.width - 110, 560, 36)
      .lineWidth(1.5)
      .strokeColor(primaryColor)
      .stroke();

    doc
      .fillColor(primaryColor)
      .fontSize(8)
      .font("Helvetica-Bold")
      .text("FLOWLY\nVERIFIED", doc.page.width - 135, 552, { align: "center", width: 50 });

    // Footer
    doc
      .fillColor("#9CA3AF")
      .fontSize(8)
      .font("Helvetica")
      .text(
        "Flowly Finance Ltd. • Registered Non-Banking Financial Company • ISO 27001 Certified • Confidential Banking Document",
        40,
        doc.page.height - 50,
        { align: "center", width: doc.page.width - 80 }
      );

    doc.end();

    stream.on("finish", () => resolve(filePath));
    stream.on("error", reject);
  });
}

export async function generateAllSampleDocuments() {
  const docsToGenerate = [
    {
      filename: "sample_pan.pdf",
      title: "Permanent Account Number (PAN) Card",
      docType: "Income Tax Department of India - Identity Proof",
      docNumber: "ABCDE1234F",
      holderName: "Customer / Loan Applicant",
      details: [{ label: "Father's Name:", value: "R. Sharma" }, { label: "Date of Birth:", value: "15/08/1990" }],
    },
    {
      filename: "pan_card.pdf",
      title: "Permanent Account Number (PAN) Card",
      docType: "Income Tax Department of India - Identity Proof",
      docNumber: "ABCDE1234F",
      holderName: "Customer / Loan Applicant",
      details: [{ label: "Father's Name:", value: "R. Sharma" }, { label: "Date of Birth:", value: "15/08/1990" }],
    },
    {
      filename: "sample_aadhaar.pdf",
      title: "Aadhaar Card - Unique Identification",
      docType: "UIDAI - Government of India (POI & POA)",
      docNumber: "XXXX-XXXX-9012",
      holderName: "Customer / Loan Applicant",
      details: [{ label: "Gender / Age:", value: "Male / 34" }, { label: "Address Match:", value: "Verified Active Resident" }],
    },
    {
      filename: "aadhaar_card.pdf",
      title: "Aadhaar Card - Unique Identification",
      docType: "UIDAI - Government of India (POI & POA)",
      docNumber: "XXXX-XXXX-9012",
      holderName: "Customer / Loan Applicant",
      details: [{ label: "Gender / Age:", value: "Male / 34" }, { label: "Address Match:", value: "Verified Active Resident" }],
    },
    {
      filename: "sample_salary.pdf",
      title: "Certified Salary Slip & Income Proof",
      docType: "Employer Monthly Pay Statement & Tax Deductions",
      docNumber: "PAY-2026-SEP-8891",
      holderName: "Customer / Loan Applicant",
      details: [{ label: "Gross Monthly Salary:", value: "Rs. 75,000.00" }, { label: "Net In-Hand Pay:", value: "Rs. 68,500.00" }],
    },
    {
      filename: "salary_slip.pdf",
      title: "Certified Salary Slip & Income Proof",
      docType: "Employer Monthly Pay Statement & Tax Deductions",
      docNumber: "PAY-2026-SEP-8891",
      holderName: "Customer / Loan Applicant",
      details: [{ label: "Gross Monthly Salary:", value: "Rs. 75,000.00" }, { label: "Net In-Hand Pay:", value: "Rs. 68,500.00" }],
    },
    {
      filename: "sample_statement.pdf",
      title: "Official 6-Month Bank Account Statement",
      docType: "Retail Savings Account Banking History",
      docNumber: "FLWL0001024-STMT",
      holderName: "Customer / Loan Applicant",
      details: [{ label: "Account Number:", value: "102488923011" }, { label: "Average Monthly Inflow:", value: "Rs. 65,000.00" }],
    },
    {
      filename: "bank_statement.pdf",
      title: "Official 6-Month Bank Account Statement",
      docType: "Retail Savings Account Banking History",
      docNumber: "FLWL0001024-STMT",
      holderName: "Customer / Loan Applicant",
      details: [{ label: "Account Number:", value: "102488923011" }, { label: "Average Monthly Inflow:", value: "Rs. 65,000.00" }],
    },
    {
      filename: "additional_doc.pdf",
      title: "Supplementary Requested Loan Document",
      docType: "Worker-Requested Proof & Verification Attachment",
      docNumber: "REQ-DOC-2026-091",
      holderName: "Customer / Loan Applicant",
      details: [{ label: "Submission Reason:", value: "Worker Review Requirement" }, { label: "Status:", value: "Uploaded & Verified" }],
    },
  ];

  for (const docInfo of docsToGenerate) {
    await createSamplePdf(docInfo);
    console.log(`Generated sample document: ${docInfo.filename}`);
  }
}
