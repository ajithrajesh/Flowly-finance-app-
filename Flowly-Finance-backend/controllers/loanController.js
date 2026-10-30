import path from "path";
import mongoose from "mongoose";
import LoanProduct from "../models/LoanProduct.js";
import LoanApplication from "../models/LoanApplication.js";
import User from "../models/User.js";
import Account from "../models/Account.js";
import KYC from "../models/KYC.js";
import Document from "../models/Document.js";
import Notification from "../models/Notification.js";
import { notifyUser, notifyWorkers, notifyAdmins } from "../services/notificationService.js";
import { generateScheduleOnDisbursal } from "./repaymentController.js";
import { calculateEMI, round2 } from "../utils/emiCalculator.js";
import { sendLoanSubmissionEmail, sendLoanSanctionEmail } from "../utils/mailer.js";
import { uploadLoanFile } from "../services/cloudinaryService.js";

const sanitizeDocUrl = (url) => {
  if (!url || typeof url !== "string") return "";
  const trimmed = url.trim();
  if (
    trimmed.startsWith("/uploads/sample_") ||
    trimmed.includes("sample_") ||
    trimmed.includes("example.test") ||
    trimmed.includes("dummy") ||
    trimmed.includes("via.placeholder") ||
    trimmed === "/uploads/pan_card.pdf" ||
    trimmed === "/uploads/aadhaar_card.pdf" ||
    trimmed === "/uploads/salary_slip.pdf" ||
    trimmed === "/uploads/bank_statement.pdf" ||
    trimmed === "/uploads/additional_doc.pdf"
  ) {
    return "";
  }
  return trimmed;
};

/**
 * Maps a human-readable scheme requirement or document title to a valid Document documentType enum.
 */
export const determineLoanDocType = (name = "") => {
  const lower = String(name).toLowerCase();
  if (lower.includes("pan")) return "pan";
  if (lower.includes("aadhaar") || lower.includes("national id") || lower.includes("uidai")) return "aadhaar";
  if (lower.includes("passport")) return "passport";
  if (lower.includes("voter")) return "voter_id";
  if (lower.includes("selfie") || lower.includes("photo") || lower.includes("photograph")) return "selfie";
  if (lower.includes("salary") || lower.includes("pay slip") || lower.includes("payslip") || lower.includes("income proof") || lower.includes("income")) return "salary_slip";
  if (lower.includes("bank statement") || lower.includes("account statement") || lower.includes("bank account")) return "bank_statement";
  if (lower.includes("itr") || lower.includes("tax return") || lower.includes("form 16") || lower.includes("balance sheet")) return "tax_return";
  if (lower.includes("gst") || lower.includes("business") || lower.includes("msme") || lower.includes("udyam") || lower.includes("trade license") || lower.includes("partnership") || lower.includes("shop")) return "business_proof";
  if (lower.includes("vehicle") || lower.includes("quotation") || lower.includes("proforma") || lower.includes("invoice") || lower.includes("dealer")) return "vehicle_quotation";
  if (lower.includes("admission") || lower.includes("offer letter") || lower.includes("fee") || lower.includes("marksheet") || lower.includes("degree") || lower.includes("exam") || lower.includes("transcript") || lower.includes("academic")) return "admission_letter";
  if (lower.includes("address") || lower.includes("rent") || lower.includes("electricity") || lower.includes("utility") || lower.includes("bill") || lower.includes("deed") || lower.includes("domicile")) return "address_proof";
  if (lower.includes("driving license") || lower.includes("driving")) return "identity_proof";
  if (lower.includes("id card") || lower.includes("identity") || lower.includes("badge")) return "identity_proof";
  return "loan_document";
};

export const getLoanProducts = async (req, res) => {
  try {
    const products = await LoanProduct.find({ isActive: true });
    return res.status(200).json({ products });
  } catch (error) {
    return res.status(500).json({
      message: "Failed to fetch loan products",
      error: error.message,
    });
  }
};

export const getAllLoanProductsAdmin = async (req, res) => {
  try {
    const products = await LoanProduct.find().sort({ createdAt: -1 });
    return res.status(200).json({ products });
  } catch (error) {
    return res.status(500).json({
      message: "Failed to fetch loan products",
      error: error.message,
    });
  }
};

export const getLoanProductById = async (req, res) => {
  try {
    const product = await LoanProduct.findById(req.params.id);
    if (!product) return res.status(404).json({ message: "Loan product not found" });
    return res.status(200).json({ product });
  } catch (error) {
    return res.status(500).json({
      message: "Failed to fetch loan product",
      error: error.message,
    });
  }
};

export const createLoanProduct = async (req, res) => {
  try {
    const {
      productName,
      loanType = "Personal",
      interestRate,
      interestType = "diminishing",
      minAmount,
      maxAmount,
      minTenure = 6,
      maxTenure = 36,
      tenure = 12,
      description = "",
      badge = "",
      requiredDocuments = [],
      isActive = true,
    } = req.body;

    if (!productName || !interestRate || !minAmount || !maxAmount) {
      return res.status(400).json({ message: "Please provide product name, interest rate, min and max amounts." });
    }

    const product = await LoanProduct.create({
      productName: productName.trim(),
      loanType,
      interestRate: Number(interestRate),
      interestType: interestType === "flat" ? "flat" : "diminishing",
      minAmount: Number(minAmount),
      maxAmount: Number(maxAmount),
      minTenure: Number(minTenure),
      maxTenure: Number(maxTenure),
      tenure: Number(tenure),
      description: description.trim(),
      badge: badge.trim(),
      requiredDocuments: Array.isArray(requiredDocuments) ? requiredDocuments : [],
      isActive: Boolean(isActive),
    });

    return res.status(201).json({
      message: "Loan product created successfully",
      product,
    });
  } catch (error) {
    return res.status(500).json({
      message: "Failed to create loan product",
      error: error.message,
    });
  }
};

export const updateLoanProduct = async (req, res) => {
  try {
    const { id } = req.params;
    const product = await LoanProduct.findById(id);
    if (!product) return res.status(404).json({ message: "Loan product not found" });

    const {
      productName,
      loanType,
      interestRate,
      interestType,
      minAmount,
      maxAmount,
      minTenure,
      maxTenure,
      tenure,
      description,
      badge,
      requiredDocuments,
      isActive,
    } = req.body;

    if (productName !== undefined) product.productName = productName.trim();
    if (loanType !== undefined) product.loanType = loanType;
    if (interestRate !== undefined) product.interestRate = Number(interestRate);
    if (interestType !== undefined) product.interestType = interestType === "flat" ? "flat" : "diminishing";
    if (minAmount !== undefined) product.minAmount = Number(minAmount);
    if (maxAmount !== undefined) product.maxAmount = Number(maxAmount);
    if (minTenure !== undefined) product.minTenure = Number(minTenure);
    if (maxTenure !== undefined) product.maxTenure = Number(maxTenure);
    if (tenure !== undefined) product.tenure = Number(tenure);
    if (description !== undefined) product.description = description.trim();
    if (badge !== undefined) product.badge = badge.trim();
    if (requiredDocuments !== undefined) product.requiredDocuments = requiredDocuments;
    if (isActive !== undefined) product.isActive = Boolean(isActive);

    await product.save();

    return res.status(200).json({
      message: "Loan product updated successfully",
      product,
    });
  } catch (error) {
    return res.status(500).json({
      message: "Failed to update loan product",
      error: error.message,
    });
  }
};

export const toggleLoanProductActive = async (req, res) => {
  try {
    const { id } = req.params;
    const product = await LoanProduct.findById(id);
    if (!product) return res.status(404).json({ message: "Loan product not found" });

    product.isActive = !product.isActive;
    await product.save();

    return res.status(200).json({
      message: `Loan product ${product.isActive ? "activated" : "deactivated"} successfully`,
      product,
    });
  } catch (error) {
    return res.status(500).json({
      message: "Failed to toggle loan product",
      error: error.message,
    });
  }
};

export const deleteLoanProduct = async (req, res) => {
  try {
    const { id } = req.params;
    const product = await LoanProduct.findByIdAndDelete(id);
    if (!product) return res.status(404).json({ message: "Loan product not found" });

    return res.status(200).json({ message: "Loan product deleted successfully" });
  } catch (error) {
    return res.status(500).json({
      message: "Failed to delete loan product",
      error: error.message,
    });
  }
};

export const seedLoanProducts = async (req, res) => {
  try {
    const defaultProducts = [
      {
        productName: "Personal Loan",
        loanType: "Personal",
        interestRate: 12.0,
        minAmount: 10000,
        maxAmount: 500000,
        minTenure: 6,
        maxTenure: 36,
        tenure: 24,
        description: "Instant personal loan for weddings, vacations, gadgets, or emergency expenses with minimal paperwork.",
        badge: "Fast Approval",
        requiredDocuments: [
          { name: "Salary Slips (Last 3 Months)", description: "Latest 3 months salary slips from employer", isMandatory: true },
          { name: "Bank Statement (Last 6 Months)", description: "Salary credit bank statement", isMandatory: true },
          { name: "Current Address Proof", description: "Electricity bill, rental agreement, or broadband bill", isMandatory: false },
        ],
        isActive: true,
      },
      {
        productName: "Business Expansion Loan",
        loanType: "Business",
        interestRate: 14.0,
        minAmount: 100000,
        maxAmount: 2000000,
        minTenure: 12,
        maxTenure: 48,
        tenure: 36,
        description: "Working capital, inventory purchase, or machinery acquisition for small and medium enterprises.",
        badge: "High Limit",
        requiredDocuments: [
          { name: "GST Registration Certificate", description: "Valid GSTIN certificate copy", isMandatory: true },
          { name: "2 Years Income Tax Returns (ITR)", description: "ITR acknowledgment with computation of business income", isMandatory: true },
          { name: "12 Months Current Account Statement", description: "Primary operating current bank account statement", isMandatory: true },
          { name: "Business Registration / Proof", description: "Udyam / MSME Certificate, Shop Act, or Partnership Deed", isMandatory: true },
        ],
        isActive: true,
      },
      {
        productName: "Education & Higher Studies Loan",
        loanType: "Education",
        interestRate: 8.5,
        minAmount: 25000,
        maxAmount: 1000000,
        minTenure: 12,
        maxTenure: 60,
        tenure: 48,
        description: "Subsidized interest rate loans for domestic and international university courses, tuition, and living costs.",
        badge: "Lowest APR",
        requiredDocuments: [
          { name: "University Admission Offer Letter", description: "Official acceptance letter from university/college", isMandatory: true },
          { name: "Course Fee Structure Document", description: "Breakdown of semester tuition, hostel, and exam fees on college letterhead", isMandatory: true },
          { name: "Academic Marksheets & Certificates", description: "10th, 12th, and graduation degree transcripts", isMandatory: true },
          { name: "Co-borrower / Parent Income Proof", description: "Parent or guardian salary slips / ITR and bank statement", isMandatory: true },
        ],
        isActive: true,
      },
      {
        productName: "Vehicle & Two-Wheeler Loan",
        loanType: "Vehicle",
        interestRate: 9.5,
        minAmount: 50000,
        maxAmount: 1500000,
        minTenure: 12,
        maxTenure: 48,
        tenure: 36,
        description: "Competitive financing for brand new or pre-owned cars, scooters, bikes, and electric commercial vehicles.",
        badge: "Quick Disbursal",
        requiredDocuments: [
          { name: "Vehicle Proforma Invoice / Quotation", description: "Official dealer on-road price quotation", isMandatory: true },
          { name: "Valid Driving License", description: "Applicant's valid driving license copy", isMandatory: true },
          { name: "Income Proof (Salary Slips / ITR)", description: "Recent 3 months salary slips or last year ITR", isMandatory: true },
          { name: "Bank Statement (Last 6 Months)", description: "Bank account statement showing regular transactions", isMandatory: true },
        ],
        isActive: true,
      },
      {
        productName: "Emergency Medical Loan",
        loanType: "Emergency",
        interestRate: 10.0,
        minAmount: 5000,
        maxAmount: 50000,
        minTenure: 3,
        maxTenure: 12,
        tenure: 6,
        description: "Rapid relief financing for medical emergencies, treatments, hospital deposits, and urgent family needs.",
        badge: "Disbursed in 1 Hr",
        requiredDocuments: [
          { name: "Hospital Estimate / Medical Prescription", description: "Doctor's prescription, hospital estimate, or treatment bill", isMandatory: true },
          { name: "Bank Statement (Last 3 Months)", description: "Recent bank statement of applicant", isMandatory: true },
        ],
        isActive: true,
      },
    ];

    const isForce = req.query.force === "true" || req.body?.force === true;
    const count = await LoanProduct.countDocuments();
    if (count > 0 && !isForce) {
      const existing = await LoanProduct.find();
      for (const prod of existing) {
        if (!prod.requiredDocuments || prod.requiredDocuments.length === 0) {
          const match = defaultProducts.find((d) => d.loanType === prod.loanType);
          if (match) {
            prod.requiredDocuments = match.requiredDocuments;
            if (!prod.description) prod.description = match.description;
            if (!prod.badge) prod.badge = match.badge;
            await prod.save();
          }
        }
      }
      const updated = await LoanProduct.find();
      return res.status(200).json({
        message: "Loan schemes populated with required document specifications",
        products: updated,
      });
    }

    if (isForce) {
      await LoanProduct.deleteMany({});
    }

    const created = await LoanProduct.insertMany(defaultProducts);
    return res.status(201).json({
      message: "Default loan products seeded successfully with document requirements",
      products: created,
    });
  } catch (error) {
    return res.status(500).json({
      message: "Failed to seed loan products",
      error: error.message,
    });
  }
};

/**
 * Customer submits loan application following the wizard flow:
 * Personal Info -> Employment Details -> Income Details -> Bank Verification -> Document Upload -> OCR -> Eligibility Check -> SUBMITTED
 */
export const applyLoan = async (req, res) => {
  try {
    const parseField = (val) => {
      if (typeof val === "string") {
        try {
          return JSON.parse(val);
        } catch {
          return val;
        }
      }
      return val;
    };

    const {
      productId,
      productName,
      loanType,
      requestedAmount,
      amount: bodyAmount,
      tenureMonths,
      tenure: bodyTenure,
      interestType: bodyInterestType,
      purpose,
    } = req.body;

    const personalInformation = parseField(req.body.personalInformation) || {};
    const employmentDetails = parseField(req.body.employmentDetails) || {};
    const incomeDetails = parseField(req.body.incomeDetails) || {};
    const documents = parseField(req.body.documents) || {};

    const amount = Number(requestedAmount || bodyAmount);
    const months = Number(tenureMonths || bodyTenure);

    if (!amount || amount <= 0 || !months || months <= 0) {
      return res.status(400).json({
        message: "Please provide valid requested amount and tenure in months",
      });
    }

    const user = await User.findById(req.user._id);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // Check KYC status - Require verified KYC
    if (user.kycStatus !== "verified") {
      return res.status(403).json({
        message: `KYC verification is required before applying for a loan. Current KYC status: '${user.kycStatus}'. Please complete your KYC verification first.`,
      });
    }

    // Fetch account if exists
    const account = await Account.findOne({ user: user._id });

    // Fetch Product & Interest Rate
    let interestRate = 12.0;
    let selectedProductName = productName || "Personal Loan";
    let selectedLoanType = loanType || "Personal";
    let loanProduct = null;
    let productInterestType = "diminishing";

    if (productId && mongoose.Types.ObjectId.isValid(productId)) {
      loanProduct = await LoanProduct.findById(productId).catch(() => null);
      if (loanProduct) {
        interestRate = loanProduct.interestRate;
        selectedProductName = loanProduct.productName;
        selectedLoanType = loanProduct.loanType || "Personal";
        productInterestType = loanProduct.interestType || "diminishing";
      }
    }

    if (!loanProduct && selectedLoanType) {
      loanProduct = (await LoanProduct.findOne({ loanType: selectedLoanType, isActive: true }).catch(() => null)) ||
                    (await LoanProduct.findOne({ loanType: selectedLoanType }).catch(() => null));
      if (loanProduct) {
        if (!productName) selectedProductName = loanProduct.productName;
        interestRate = loanProduct.interestRate || interestRate;
        productInterestType = loanProduct.interestType || productInterestType;
      }
    }

    const chosenInterestType = (bodyInterestType || productInterestType || "diminishing").toLowerCase() === "flat" ? "flat" : "diminishing";

    // Calculations based on chosen Interest Type (Flat vs Diminishing)
    const monthlyEMI = calculateEMI(amount, interestRate, months, chosenInterestType);
    let totalInterest = 0;
    let totalPayable = 0;

    if (chosenInterestType === "flat") {
      totalInterest = round2((amount * (interestRate / 100) * months) / 12);
      totalPayable = round2(amount + totalInterest);
    } else {
      totalPayable = round2(monthlyEMI * months);
      totalInterest = round2(totalPayable - amount);
    }

    // Financial Eligibility Calculations
    const monthlyIncome = Number(incomeDetails?.monthlyIncome || 50000);
    const existingEmi = Number(incomeDetails?.existingMonthlyEmi || 0);
    const totalEmiObligation = existingEmi + monthlyEMI;
    const emiToIncomeRatio = monthlyIncome > 0 ? (totalEmiObligation / monthlyIncome) * 100 : 50;

    const incomeEligible = emiToIncomeRatio <= 50;
    const emiCapacityCheck = totalEmiObligation < monthlyIncome * 0.55;

    // Existing Loans check
    const existingActiveLoans = await LoanApplication.countDocuments({
      user: user._id,
      status: { $in: ["submitted", "under_worker_review", "approved", "disbursed", "active"] },
    });
    const existingLoanCheck = existingActiveLoans < 3;

    // Risk Assessment score (0 - 100)
    let riskScore = 85;
    if (emiToIncomeRatio > 40) riskScore -= 15;
    if (existingActiveLoans > 1) riskScore -= 10;
    if (!account) riskScore -= 5;
    const riskAssessment = riskScore >= 75 ? "LOW_RISK" : riskScore >= 55 ? "MEDIUM_RISK" : "HIGH_RISK";

    // OCR Verification Simulation
    const ocrVerification = {
      panVerified: true,
      aadhaarVerified: true,
      nameMatchScore: 98,
      ocrStatus: "passed",
    };

    // Automated Eligibility Check summary
    const eligibilityCheck = {
      kycVerified: true,
      accountActive: account ? account.status === "active" : true,
      incomeEligible,
      existingLoanCheck,
      emiCapacityCheck,
      riskAssessment,
      riskScore,
      passedAutomatedChecks: incomeEligible && existingLoanCheck && emiCapacityCheck,
    };

    // Application Number Generation
    const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, "");
    const randomSuffix = Math.floor(1000 + Math.random() * 9000);
    const applicationNumber = `LN-${dateStr}-${randomSuffix}`;

    // Document processing: upload customer files or map from verified KYC
    const allFilesList = Array.isArray(req.files)
      ? req.files
      : (req.files && typeof req.files === "object"
          ? Object.entries(req.files).flatMap(([fieldname, files]) =>
              (Array.isArray(files) ? files : [files]).map((f) => ({ ...f, fieldname: f.fieldname || fieldname }))
            )
          : []);

    const filesByField = req.filesByField || {};
    for (const f of allFilesList) {
      if (f && f.fieldname && !filesByField[f.fieldname]) {
        filesByField[f.fieldname] = [f];
      }
    }

    const kyc = await KYC.findOne({ user: user._id });

    let panCardUrl = sanitizeDocUrl(documents?.panCardUrl);
    let panCardFileName = "";
    let aadhaarCardUrl = sanitizeDocUrl(documents?.aadhaarCardUrl);
    let aadhaarCardFileName = "";
    let salarySlipUrl = sanitizeDocUrl(documents?.salarySlipUrl);
    let salarySlipFileName = "";
    let bankStatementUrl = sanitizeDocUrl(documents?.bankStatementUrl);
    let bankStatementFileName = "";

    // Scheme required documents definition from loan product (exclude disabled)
    const schemeReqDocs = (Array.isArray(loanProduct?.requiredDocuments) ? loanProduct.requiredDocuments : [])
      .filter((doc) => !doc.disabled && doc.isActive !== false);

    // Build base specificDocs array aligning with scheme requirements
    let specificDocs = (Array.isArray(documents?.specificDocs) ? [...documents.specificDocs] : [])
      .filter((d) => !d.disabled && d.status !== "disabled")
      .map((d) => ({
        ...d,
        name: d?.name || "",
        fileName: d?.fileName || "",
        docUrl: sanitizeDocUrl(d?.docUrl),
        status: d?.docUrl ? "uploaded" : (d?.status || "pending"),
      }));

    // Ensure all defined scheme requirements are represented in specificDocs
    if (schemeReqDocs.length > 0) {
      schemeReqDocs.forEach((reqDoc, idx) => {
        const originalIdx = Array.isArray(loanProduct?.requiredDocuments)
          ? loanProduct.requiredDocuments.findIndex((r) => r.name === reqDoc.name)
          : idx;
        const schemeIdx = originalIdx >= 0 ? originalIdx : idx;

        const found = specificDocs.find(
          (d) => d.name === reqDoc.name || (d.schemeIndex !== undefined && (d.schemeIndex === schemeIdx || d.schemeIndex === idx))
        );
        if (!found) {
          specificDocs.push({
            schemeIndex: schemeIdx,
            name: reqDoc.name,
            description: reqDoc.description || "",
            isMandatory: Boolean(reqDoc.isMandatory),
            fileName: "",
            docUrl: "",
            status: "pending",
            uploadedAt: null,
          });
        } else {
          found.name = reqDoc.name;
          found.schemeIndex = schemeIdx;
          if (reqDoc.isMandatory !== undefined) found.isMandatory = reqDoc.isMandatory;
          if (reqDoc.description && !found.description) found.description = reqDoc.description;
        }
      });

      // Filter out mismatched or disabled document entries that don't belong to active scheme requirements and have no uploaded file
      specificDocs = specificDocs.filter((d) => {
        if (d.disabled || d.status === "disabled") return false;
        if (!d.docUrl && (d.name?.startsWith("Document ") || !d.name)) return false;
        const matchesDisabled = Array.isArray(loanProduct?.requiredDocuments) &&
          loanProduct.requiredDocuments.some((req) => (req.disabled || req.isActive === false) && req.name === d.name);
        if (matchesDisabled && !d.docUrl) return false;

        const matchesScheme = schemeReqDocs.some(
          (req) => req.name === d.name || (d.schemeIndex !== undefined && d.schemeIndex === req.schemeIndex)
        );
        return matchesScheme || Boolean(d.docUrl || d.fileName);
      });
    }

    const panFile = filesByField.panCard?.[0] || filesByField.pan?.[0];
    const aadhaarFile = filesByField.aadhaarCard?.[0] || filesByField.aadhaar?.[0];
    const salaryFile = filesByField.salarySlip?.[0] || filesByField.salary?.[0];
    const bankFile = filesByField.bankStatement?.[0] || filesByField.bank?.[0];
    const additionalFile = filesByField.additionalDoc?.[0] || filesByField.additional?.[0];

    if (panFile) {
      const up = await uploadLoanFile(panFile.buffer, {
        userId: String(user._id),
        kind: "loan-pan",
        originalName: panFile.originalname,
        mimeType: panFile.mimetype,
      });
      panCardUrl = up.url;
      panCardFileName = panFile.originalname;
      await Document.create({
        user: user._id,
        documentType: "pan",
        fileUrl: up.url,
        publicId: up.publicId,
        storageProvider: up.storageProvider || "cloudinary",
        verificationStatus: "pending",
      }).catch(() => {});
    } else if (!panCardUrl && kyc) {
      panCardUrl = sanitizeDocUrl(kyc.panUrl) || (kyc.idType === "pan" ? sanitizeDocUrl(kyc.documentUrl) : "") || "";
      if (panCardUrl) panCardFileName = panCardUrl.split("/").pop().split("?")[0] || "pan_card.pdf";
    }

    if (aadhaarFile) {
      const up = await uploadLoanFile(aadhaarFile.buffer, {
        userId: String(user._id),
        kind: "loan-aadhaar",
        originalName: aadhaarFile.originalname,
        mimeType: aadhaarFile.mimetype,
      });
      aadhaarCardUrl = up.url;
      aadhaarCardFileName = aadhaarFile.originalname;
      await Document.create({
        user: user._id,
        documentType: "aadhaar",
        fileUrl: up.url,
        publicId: up.publicId,
        storageProvider: up.storageProvider || "cloudinary",
        verificationStatus: "pending",
      }).catch(() => {});
    } else if (!aadhaarCardUrl && kyc) {
      aadhaarCardUrl = sanitizeDocUrl(kyc.aadhaarUrl) || (kyc.idType === "aadhaar" ? sanitizeDocUrl(kyc.documentUrl) : "") || "";
      if (aadhaarCardUrl) aadhaarCardFileName = aadhaarCardUrl.split("/").pop().split("?")[0] || "aadhaar_card.pdf";
    }

    if (salaryFile) {
      const up = await uploadLoanFile(salaryFile.buffer, {
        userId: String(user._id),
        kind: "loan-salary",
        originalName: salaryFile.originalname,
        mimeType: salaryFile.mimetype,
      });
      salarySlipUrl = up.url;
      salarySlipFileName = salaryFile.originalname;
      await Document.create({
        user: user._id,
        documentType: "salary_slip",
        fileUrl: up.url,
        publicId: up.publicId,
        storageProvider: up.storageProvider || "cloudinary",
        verificationStatus: "pending",
      }).catch(() => {});
    }

    if (bankFile) {
      const up = await uploadLoanFile(bankFile.buffer, {
        userId: String(user._id),
        kind: "loan-bank-statement",
        originalName: bankFile.originalname,
        mimeType: bankFile.mimetype,
      });
      bankStatementUrl = up.url;
      bankStatementFileName = bankFile.originalname;
      await Document.create({
        user: user._id,
        documentType: "bank_statement",
        fileUrl: up.url,
        publicId: up.publicId,
        storageProvider: up.storageProvider || "cloudinary",
        verificationStatus: "pending",
      }).catch(() => {});
    }

    let initialAdditionalDocs = [];
    if (additionalFile) {
      const up = await uploadLoanFile(additionalFile.buffer, {
        userId: String(user._id),
        kind: "loan-additional",
        originalName: additionalFile.originalname,
        mimeType: additionalFile.mimetype,
      });
      const docType = determineLoanDocType(additionalFile.originalname);
      await Document.create({
        user: user._id,
        documentType: docType,
        fileUrl: up.url,
        publicId: up.publicId,
        storageProvider: up.storageProvider || "cloudinary",
        verificationStatus: "pending",
      }).catch(() => {});
      initialAdditionalDocs.push({
        title: additionalFile.originalname.replace(/\.[^/.]+$/, "") || "Additional Document",
        docUrl: up.url,
        fileName: additionalFile.originalname,
        status: "uploaded",
        uploadedAt: new Date(),
      });
    }

    // Process any scheme-specific uploaded files
    for (const f of allFilesList) {
      if (f && f.fieldname && f.fieldname.startsWith("specificDoc_")) {
        const idx = parseInt(f.fieldname.replace("specificDoc_", ""), 10);
        const docNameFromBody = req.body[`specificDocName_${idx}`] || req.body[`name_${idx}`];
        const originalReq = loanProduct?.requiredDocuments?.[idx];
        const targetReq = (originalReq && !originalReq.disabled && originalReq.isActive !== false)
          ? originalReq
          : schemeReqDocs[idx];
        const targetName = docNameFromBody || targetReq?.name || specificDocs[idx]?.name || specificDocs.find((d) => d.schemeIndex === idx)?.name || `Document ${idx + 1}`;

        const up = await uploadLoanFile(f.buffer, {
          userId: String(user._id),
          kind: `loan-specific-${idx}`,
          originalName: f.originalname,
          mimeType: f.mimetype,
        });

        let matchedDoc = specificDocs.find(
          (d, i) => (docNameFromBody && d.name === docNameFromBody) ||
                    (targetName && d.name === targetName) ||
                    (d.schemeIndex !== undefined && d.schemeIndex === idx) ||
                    i === idx
        );
        if (matchedDoc) {
          matchedDoc.name = matchedDoc.name || targetName;
          matchedDoc.schemeIndex = idx;
          matchedDoc.docUrl = up.url;
          matchedDoc.fileName = f.originalname;
          matchedDoc.status = "uploaded";
          matchedDoc.uploadedAt = new Date();
        } else {
          matchedDoc = {
            schemeIndex: idx,
            name: targetName,
            description: targetReq?.description || "",
            isMandatory: Boolean(targetReq?.isMandatory),
            fileName: f.originalname,
            docUrl: up.url,
            status: "uploaded",
            uploadedAt: new Date(),
          };
          specificDocs.push(matchedDoc);
        }

          // Save in Document collection with semantic documentType
          const docType = determineLoanDocType(matchedDoc.name);
          await Document.create({
            user: user._id,
            documentType: docType,
            fileUrl: up.url,
            publicId: up.publicId,
            storageProvider: up.storageProvider || "cloudinary",
            verificationStatus: "pending",
          }).catch((err) => console.error("Error creating Document for scheme doc:", err.message));

          // Auto-sync into standard proof slots if not already populated
          const lowerName = matchedDoc.name.toLowerCase();
          if (!salarySlipUrl && (lowerName.includes("salary") || lowerName.includes("pay slip"))) {
            salarySlipUrl = up.url;
            salarySlipFileName = f.originalname;
          }
          if (!bankStatementUrl && (lowerName.includes("bank statement") || lowerName.includes("account statement"))) {
            bankStatementUrl = up.url;
            bankStatementFileName = f.originalname;
          }
          if (!panCardUrl && lowerName.includes("pan")) {
            panCardUrl = up.url;
            panCardFileName = f.originalname;
          }
          if (!aadhaarCardUrl && lowerName.includes("aadhaar")) {
            aadhaarCardUrl = up.url;
            aadhaarCardFileName = f.originalname;
          }
        }
      }

    const application = await LoanApplication.create({
      applicationNumber,
      user: req.user._id,
      product: loanProduct ? loanProduct._id : undefined,
      account: account ? account._id : undefined,
      productName: selectedProductName,
      loanType: selectedLoanType,

      principal: amount,
      requestedAmount: amount,
      tenureMonths: months,
      interestRate,
      interestType: chosenInterestType,

      emiAmount: monthlyEMI,
      monthlyEMI,
      totalInterest,
      totalPayable,
      totalRepayment: totalPayable,
      outstandingAmount: amount,

      purpose: purpose || "Personal Expenses",

      personalInformation: {
        fullName: personalInformation?.fullName || user.name || "",
        dob: personalInformation?.dob || user.dob || "",
        email: personalInformation?.email || user.email || "",
        phone: personalInformation?.phone || user.phone || "",
        address: personalInformation?.address || user.address || "",
        panNumber: personalInformation?.panNumber || "ABCDE1234F",
        aadhaarNumber: personalInformation?.aadhaarNumber || "123456789012",
      },

      employmentDetails: {
        employmentType: employmentDetails?.employmentType || "salaried",
        companyName: employmentDetails?.companyName || "Acme Corp",
        designation: employmentDetails?.designation || "Executive",
        workExperienceYears: Number(employmentDetails?.workExperienceYears || 3),
      },

      incomeDetails: {
        monthlyIncome,
        existingMonthlyEmi: existingEmi,
      },

      bankDetails: {
        // Always the applicant's own Flowly account (client-sent bank details are ignored)
        accountNumber: account?.accountNumber || "",
        bankName: "Flowly National Bank",
        ifscCode: account?.ifscCode || "FLWL0001024",
        accountHolderName: user.name || "",
        isVerified: true,
      },

      documents: {
        panCardUrl: panCardUrl || "",
        panCardFileName: panCardFileName || "",
        aadhaarCardUrl: aadhaarCardUrl || "",
        aadhaarCardFileName: aadhaarCardFileName || "",
        salarySlipUrl: salarySlipUrl || "",
        salarySlipFileName: salarySlipFileName || "",
        bankStatementUrl: bankStatementUrl || "",
        bankStatementFileName: bankStatementFileName || "",
        specificDocs: specificDocs || [],
        additionalDocs: initialAdditionalDocs || [],
      },

      ocrVerification,
      eligibilityCheck,
      status: "submitted",
    });

    // Role-based real-time notification dispatch
    await notifyUser(req.user._id, {
      type: "loan",
      title: "Loan Application Submitted",
      message: `Your loan application ${applicationNumber} for ₹${amount.toLocaleString("en-IN")} has been submitted successfully. Status: SUBMITTED.`,
      meta: { loanId: application._id, applicationNumber },
    });

    await notifyWorkers({
      type: "loan",
      title: "New Loan Application",
      message: `New loan application ${applicationNumber} for ₹${amount.toLocaleString("en-IN")} submitted by ${req.user.name || "Customer"}.`,
      meta: { loanId: application._id, applicationNumber, amount },
    });

    await notifyAdmins({
      type: "loan",
      title: "Loan Application Received",
      message: `New loan application ${applicationNumber} of ₹${amount.toLocaleString("en-IN")} submitted in system.`,
      meta: { loanId: application._id, applicationNumber, amount },
    });

    // Send customer email notification upon loan submission
    const customerEmail = user?.email || personalInformation?.email;
    const customerName = user?.name || personalInformation?.fullName || "Customer";
    if (customerEmail) {
      try {
        await sendLoanSubmissionEmail(customerEmail, application, customerName);
      } catch (emailErr) {
        console.error("Failed to send loan submission email:", emailErr.message);
      }
    }

    return res.status(201).json({
      message: "Loan application submitted successfully and assigned for worker review.",
      application,
    });
  } catch (error) {
    console.error("applyLoan server error:", error);
    return res.status(500).json({
      message: "Loan application submission failed",
      error: error.message,
    });
  }
};

export const getUserApplications = async (req, res) => {
  try {
    const rawApplications = await LoanApplication.find({ user: req.user._id })
      .populate("product")
      .populate("account")
      .sort({ createdAt: -1 })
      .lean();

    const applications = await Promise.all(
      rawApplications.map(async (app) => {
        if (!app.product && app.loanType) {
          app.product = await LoanProduct.findOne({ loanType: app.loanType, isActive: true })
            .select("productName loanType requiredDocuments interestRate")
            .lean();
        }
        return app;
      })
    );

    return res.status(200).json({ applications });
  } catch (error) {
    return res.status(500).json({
      message: "Failed to fetch loan applications",
      error: error.message,
    });
  }
};

/**
 * Customer uploads requested additional documents when status is 'documents_requested'
 */
export const resubmitDocuments = async (req, res) => {
  try {
    const { id } = req.params;
    const { docTitle, docUrl } = req.body;

    const application = await LoanApplication.findOne({ _id: id, user: req.user._id });
    if (!application) {
      return res.status(404).json({ message: "Loan application not found" });
    }

    if (application.status !== "documents_requested") {
      return res.status(400).json({ message: `Cannot upload documents when status is '${application.status}'` });
    }

    let finalUrl = "";
    let originalName = "";
    const uploadFileObj = req.file || (Array.isArray(req.files) ? req.files[0] : null);

    if (uploadFileObj) {
      originalName = uploadFileObj.originalname;
      const up = await uploadLoanFile(uploadFileObj.buffer, {
        userId: String(req.user._id),
        kind: "additional-doc",
        originalName: uploadFileObj.originalname,
        mimeType: uploadFileObj.mimetype,
      });
      finalUrl = up.url;
    } else if (docUrl && typeof docUrl === "string") {
      finalUrl = sanitizeDocUrl(docUrl);
      originalName = finalUrl.split("/").pop() || "document.pdf";
    }

    if (!finalUrl) {
      return res.status(400).json({ message: "Please provide a valid document file to upload" });
    }

    const cleanTitle = (docTitle || "Requested Document").trim();
    const docType = determineLoanDocType(cleanTitle);

    await Document.create({
      user: req.user._id,
      documentType: docType,
      fileUrl: finalUrl,
      publicId: finalUrl.includes("/uploads/") ? path.basename(finalUrl) : undefined,
      storageProvider: finalUrl.startsWith("http") ? "cloudinary" : "local",
      verificationStatus: "pending",
    }).catch(() => {});

    if (!application.documents) application.documents = {};
    if (!application.documents.additionalDocs) application.documents.additionalDocs = [];

    // Deduplicate: check if an existing requested item matches or is pending
    const existingIndex = application.documents.additionalDocs.findIndex(
      (item) =>
        item.status === "requested" &&
        (!docTitle ||
          item.title?.toLowerCase() === cleanTitle.toLowerCase() ||
          item.requestedNote?.toLowerCase().includes(cleanTitle.toLowerCase()))
    );

    if (existingIndex !== -1) {
      application.documents.additionalDocs[existingIndex].title = cleanTitle;
      application.documents.additionalDocs[existingIndex].docUrl = finalUrl;
      application.documents.additionalDocs[existingIndex].fileName = originalName;
      application.documents.additionalDocs[existingIndex].status = "uploaded";
      application.documents.additionalDocs[existingIndex].uploadedAt = new Date();
    } else {
      const anyRequestedIdx = application.documents.additionalDocs.findIndex((item) => item.status === "requested");
      if (anyRequestedIdx !== -1) {
        application.documents.additionalDocs[anyRequestedIdx].title = cleanTitle;
        application.documents.additionalDocs[anyRequestedIdx].docUrl = finalUrl;
        application.documents.additionalDocs[anyRequestedIdx].fileName = originalName;
        application.documents.additionalDocs[anyRequestedIdx].status = "uploaded";
        application.documents.additionalDocs[anyRequestedIdx].uploadedAt = new Date();
      } else {
        application.documents.additionalDocs.push({
          title: cleanTitle,
          docUrl: finalUrl,
          fileName: originalName,
          status: "uploaded",
          requestedNote: application.workerReview?.requestedDocNote || "",
          uploadedAt: new Date(),
        });
      }
    }

    // Update application status back to under_worker_review for re-review
    application.status = "under_worker_review";
    await application.save();

    await notifyUser(req.user._id, {
      type: "loan",
      title: "Additional Document Uploaded",
      message: `You re-submitted requested document '${docTitle || "Requested Document"}' for application ${application.applicationNumber}. Re-review in progress.`,
      meta: { loanId: application._id, applicationNumber: application.applicationNumber },
    });

    await notifyWorkers({
      type: "loan",
      title: "Loan Document Uploaded",
      message: `Customer uploaded requested document '${docTitle || "Requested Document"}' for application ${application.applicationNumber}. Pending re-review.`,
      meta: { loanId: application._id, applicationNumber: application.applicationNumber },
    });

    return res.status(200).json({
      message: "Document uploaded successfully and application moved to Re-Review.",
      application,
    });
  } catch (error) {
    return res.status(500).json({ message: "Failed to upload document", error: error.message });
  }
};

/**
 * Customer updates or replaces submitted documents for a loan application.
 * Allowed when status is 'submitted', 'under_worker_review', or 'documents_requested'.
 */
export const updateApplicationDocuments = async (req, res) => {
  try {
    const { id } = req.params;
    const application = await LoanApplication.findOne({ _id: id, user: req.user._id });
    if (!application) {
      return res.status(404).json({ message: "Loan application not found" });
    }

    const editableStatuses = ["submitted", "under_worker_review", "documents_requested"];
    if (!editableStatuses.includes(application.status)) {
      return res.status(400).json({
        message: `Documents cannot be modified when application status is '${application.status}'`,
      });
    }

    const allFilesList = Array.isArray(req.files)
      ? req.files
      : (req.files && typeof req.files === "object"
          ? Object.entries(req.files).flatMap(([fieldname, files]) =>
              (Array.isArray(files) ? files : [files]).map((f) => ({ ...f, fieldname: f.fieldname || fieldname }))
            )
          : req.file ? [req.file] : []);

    const filesByField = req.filesByField || {};
    for (const f of allFilesList) {
      if (f && f.fieldname && !filesByField[f.fieldname]) {
        filesByField[f.fieldname] = [f];
      }
    }

    if (!application.documents) application.documents = {};
    if (!Array.isArray(application.documents.specificDocs)) application.documents.specificDocs = [];
    if (!Array.isArray(application.documents.additionalDocs)) application.documents.additionalDocs = [];

    let updatedCount = 0;
    const updatedDocNames = [];

    // 1. Standard docs
    const panFile = filesByField.panCard?.[0] || filesByField.pan?.[0];
    const aadhaarFile = filesByField.aadhaarCard?.[0] || filesByField.aadhaar?.[0];
    const salaryFile = filesByField.salarySlip?.[0] || filesByField.salary?.[0];
    const bankFile = filesByField.bankStatement?.[0] || filesByField.bank?.[0];
    const additionalFile = filesByField.additionalDoc?.[0] || filesByField.additional?.[0];

    if (panFile) {
      const up = await uploadLoanFile(panFile.buffer, {
        userId: String(req.user._id),
        kind: "loan-pan",
        originalName: panFile.originalname,
        mimeType: panFile.mimetype,
      });
      application.documents.panCardUrl = up.url;
      application.documents.panCardFileName = panFile.originalname;
      updatedCount++;
      updatedDocNames.push("PAN Card");
    }

    if (aadhaarFile) {
      const up = await uploadLoanFile(aadhaarFile.buffer, {
        userId: String(req.user._id),
        kind: "loan-aadhaar",
        originalName: aadhaarFile.originalname,
        mimeType: aadhaarFile.mimetype,
      });
      application.documents.aadhaarCardUrl = up.url;
      application.documents.aadhaarCardFileName = aadhaarFile.originalname;
      updatedCount++;
      updatedDocNames.push("Aadhaar Card");
    }

    if (salaryFile) {
      const up = await uploadLoanFile(salaryFile.buffer, {
        userId: String(req.user._id),
        kind: "loan-salary",
        originalName: salaryFile.originalname,
        mimeType: salaryFile.mimetype,
      });
      application.documents.salarySlipUrl = up.url;
      application.documents.salarySlipFileName = salaryFile.originalname;
      updatedCount++;
      updatedDocNames.push("Salary Slip");
    }

    if (bankFile) {
      const up = await uploadLoanFile(bankFile.buffer, {
        userId: String(req.user._id),
        kind: "loan-bank-statement",
        originalName: bankFile.originalname,
        mimeType: bankFile.mimetype,
      });
      application.documents.bankStatementUrl = up.url;
      application.documents.bankStatementFileName = bankFile.originalname;
      updatedCount++;
      updatedDocNames.push("Bank Statement");
    }

    if (additionalFile) {
      const docTitle = req.body.docTitle || req.body.additionalDocTitle || "Additional Supporting Document";
      const up = await uploadLoanFile(additionalFile.buffer, {
        userId: String(req.user._id),
        kind: "loan-additional",
        originalName: additionalFile.originalname,
        mimeType: additionalFile.mimetype,
      });
      const existingIdx = application.documents.additionalDocs.findIndex(
        (a) => a.title?.toLowerCase() === docTitle.toLowerCase() || a.status === "requested"
      );
      if (existingIdx !== -1) {
        application.documents.additionalDocs[existingIdx].docUrl = up.url;
        application.documents.additionalDocs[existingIdx].fileName = additionalFile.originalname;
        application.documents.additionalDocs[existingIdx].title = docTitle;
        application.documents.additionalDocs[existingIdx].status = "uploaded";
        application.documents.additionalDocs[existingIdx].uploadedAt = new Date();
      } else {
        application.documents.additionalDocs.push({
          title: docTitle,
          docUrl: up.url,
          fileName: additionalFile.originalname,
          status: "uploaded",
          uploadedAt: new Date(),
        });
      }
      updatedCount++;
      updatedDocNames.push(docTitle);
    }

    // 2. Specific doc replacement by name or index
    const targetDocName = req.body.targetDocName || req.body.docName;
    const targetDocIndex = req.body.targetDocIndex !== undefined ? parseInt(req.body.targetDocIndex, 10) : undefined;
    const genericUploadFile = filesByField.file?.[0] || filesByField.document?.[0];

    if (genericUploadFile && (targetDocName || targetDocIndex !== undefined)) {
      const up = await uploadLoanFile(genericUploadFile.buffer, {
        userId: String(req.user._id),
        kind: `loan-doc-${targetDocIndex ?? 0}`,
        originalName: genericUploadFile.originalname,
        mimeType: genericUploadFile.mimetype,
      });

      const lowerTarget = (targetDocName || "").toLowerCase();
      if (lowerTarget.includes("pan card") || lowerTarget === "pan") {
        application.documents.panCardUrl = up.url;
        application.documents.panCardFileName = genericUploadFile.originalname;
      } else if (lowerTarget.includes("aadhaar")) {
        application.documents.aadhaarCardUrl = up.url;
        application.documents.aadhaarCardFileName = genericUploadFile.originalname;
      } else if (lowerTarget.includes("salary") || lowerTarget.includes("pay slip")) {
        application.documents.salarySlipUrl = up.url;
        application.documents.salarySlipFileName = genericUploadFile.originalname;
      } else if (lowerTarget.includes("bank statement")) {
        application.documents.bankStatementUrl = up.url;
        application.documents.bankStatementFileName = genericUploadFile.originalname;
      }

      let matched = application.documents.specificDocs.find(
        (d, i) => (targetDocName && d.name === targetDocName) || (targetDocIndex !== undefined && (d.schemeIndex === targetDocIndex || i === targetDocIndex))
      );
      if (matched) {
        matched.docUrl = up.url;
        matched.fileName = genericUploadFile.originalname;
        matched.status = "uploaded";
        matched.uploadedAt = new Date();
      } else if (targetDocName) {
        application.documents.specificDocs.push({
          schemeIndex: targetDocIndex ?? application.documents.specificDocs.length,
          name: targetDocName,
          docUrl: up.url,
          fileName: genericUploadFile.originalname,
          status: "uploaded",
          uploadedAt: new Date(),
        });
      }
      updatedCount++;
      updatedDocNames.push(targetDocName || genericUploadFile.originalname);
    }

    // 3. Any specificDoc_N files
    for (const f of allFilesList) {
      if (f && f.fieldname && f.fieldname.startsWith("specificDoc_")) {
        const idx = parseInt(f.fieldname.replace("specificDoc_", ""), 10);
        const docNameFromBody = req.body[`specificDocName_${idx}`] || req.body[`name_${idx}`];
        const up = await uploadLoanFile(f.buffer, {
          userId: String(req.user._id),
          kind: `loan-specific-${idx}`,
          originalName: f.originalname,
          mimeType: f.mimetype,
        });

        let matched = application.documents.specificDocs.find(
          (d, i) => (docNameFromBody && d.name === docNameFromBody) || d.schemeIndex === idx || i === idx
        );
        if (matched) {
          matched.docUrl = up.url;
          matched.fileName = f.originalname;
          matched.status = "uploaded";
          matched.uploadedAt = new Date();
          if (docNameFromBody) matched.name = docNameFromBody;
        } else {
          application.documents.specificDocs.push({
            schemeIndex: idx,
            name: docNameFromBody || `Document ${idx + 1}`,
            docUrl: up.url,
            fileName: f.originalname,
            status: "uploaded",
            uploadedAt: new Date(),
          });
        }
        updatedCount++;
        updatedDocNames.push(docNameFromBody || f.originalname);
      }
    }

    if (updatedCount === 0) {
      return res.status(400).json({ message: "No document files were received. Please select a valid file to upload." });
    }

    if (application.status === "documents_requested") {
      application.status = "under_worker_review";
    }

    application.markModified("documents");
    await application.save();

    await notifyWorkers({
      type: "loan",
      title: "Loan Documents Updated",
      message: `Customer updated ${updatedCount} document(s) (${updatedDocNames.join(", ")}) for application ${application.applicationNumber}.`,
      meta: { loanId: application._id, applicationNumber: application.applicationNumber },
    });

    await notifyUser(req.user._id, {
      type: "loan",
      title: "Documents Updated Successfully",
      message: `Your updated documents (${updatedDocNames.join(", ")}) were saved for application ${application.applicationNumber}.`,
      meta: { loanId: application._id, applicationNumber: application.applicationNumber },
    });

    return res.status(200).json({
      message: `Successfully updated ${updatedCount} document(s).`,
      application,
    });
  } catch (error) {
    console.error("updateApplicationDocuments error:", error);
    return res.status(500).json({ message: "Failed to update documents", error: error.message });
  }
};

/**
 * Customer accepts sanction letter terms
 */
export const acceptSanctionLetter = async (req, res) => {
  try {
    const { id } = req.params;
    const application = await LoanApplication.findOne({ _id: id, user: req.user._id });

    if (!application) {
      return res.status(404).json({ message: "Loan application not found" });
    }

    if (application.status !== "sanctioned") {
      return res.status(400).json({ message: `Cannot accept sanction letter when status is '${application.status}'` });
    }

    application.sanctionDetails.customerAccepted = true;
    application.sanctionDetails.customerAcceptedAt = new Date();

    // Generate Loan Agreement number
    const agreementNum = `AGR-${Date.now().toString().slice(-6)}`;
    application.agreementDetails = {
      agreementNumber: agreementNum,
      generatedAt: new Date(),
      eSigned: false,
    };

    application.status = "agreement_pending";
    await application.save();

    await notifyUser(req.user._id, {
      type: "loan",
      title: "Sanction Letter Accepted",
      message: `You accepted the loan sanction letter for ${application.applicationNumber}. Loan agreement generated. Please complete digital e-Sign.`,
      meta: { loanId: application._id, applicationNumber: application.applicationNumber },
    });

    await notifyWorkers({
      type: "loan",
      title: "Sanction Letter Accepted",
      message: `Customer accepted terms for loan ${application.applicationNumber}. Agreement generated for e-Sign.`,
      meta: { loanId: application._id, applicationNumber: application.applicationNumber },
    });

    return res.status(200).json({
      message: "Sanction letter accepted successfully. Loan Agreement generated for e-Sign.",
      application,
    });
  } catch (error) {
    return res.status(500).json({ message: "Failed to accept sanction letter", error: error.message });
  }
};

/**
 * Customer digital e-Sign of Loan Agreement
 */
export const esignLoanAgreement = async (req, res) => {
  try {
    const { id } = req.params;
    const { signatureHash } = req.body;

    const application = await LoanApplication.findOne({ _id: id, user: req.user._id });
    if (!application) {
      return res.status(404).json({ message: "Loan application not found" });
    }

    if (application.status !== "agreement_pending") {
      return res.status(400).json({ message: `Cannot e-sign agreement when status is '${application.status}'` });
    }

    const mockHash = signatureHash || `SIG-${Math.random().toString(36).substring(2, 10).toUpperCase()}`;

    application.agreementDetails.eSigned = true;
    application.agreementDetails.eSignedAt = new Date();
    application.agreementDetails.digitalSignatureHash = mockHash;

    // Moves to 'approved' status ready for final disbursement by bank worker
    application.status = "approved";
    await application.save();

    await notifyUser(req.user._id, {
      type: "loan",
      title: "Loan Agreement Signed",
      message: `Loan agreement for ${application.applicationNumber} has been e-signed. Status updated to APPROVED. Pending disbursement.`,
      meta: { loanId: application._id, applicationNumber: application.applicationNumber },
    });

    await notifyWorkers({
      type: "loan",
      title: "Loan Ready for Disbursal",
      message: `Customer signed agreement for loan ${application.applicationNumber}. Approved and waiting for desk disbursement.`,
      meta: { loanId: application._id, applicationNumber: application.applicationNumber },
    });

    await notifyAdmins({
      type: "loan",
      title: "Loan Approved & Signed",
      message: `Loan agreement ${application.agreementDetails.agreementNumber} signed for application ${application.applicationNumber}.`,
      meta: { loanId: application._id, applicationNumber: application.applicationNumber },
    });

    return res.status(200).json({
      message: "Loan agreement e-signed successfully! Loan approved and ready for disbursement.",
      application,
    });
  } catch (error) {
    return res.status(500).json({ message: "Failed to e-sign agreement", error: error.message });
  }
};

// -----------------------------------------------------------------------------
// WORKER / ADMIN API ENDPOINTS
// -----------------------------------------------------------------------------

export const getAllApplications = async (req, res) => {
  try {
    const { status, search } = req.query;
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 10, 1), 100);
    const skip = (page - 1) * limit;

    const filter = {};

    if (status && status !== "all") {
      filter.status = status;
    }

    if (search) {
      const safe = String(search).trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const regex = new RegExp(safe, "i");
      const matchingUsers = await User.find({
        $or: [{ name: regex }, { email: regex }, { phone: regex }],
      }).select("_id").lean();
      const userIds = matchingUsers.map((u) => u._id);

      filter.$or = [
        { applicationNumber: regex },
        { productName: regex },
        { loanType: regex },
        { "personalInformation.fullName": regex },
        { "personalInformation.email": regex },
        { "personalInformation.phone": regex },
        { user: { $in: userIds } },
      ];
    }

    const [rawApplications, total] = await Promise.all([
      LoanApplication.find(filter)
        .populate("user", "name email phone kycStatus")
        .populate("assignedTo", "name email")
        .populate("product", "productName loanType requiredDocuments interestRate")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      LoanApplication.countDocuments(filter),
    ]);

    const applications = await Promise.all(
      rawApplications.map(async (app) => {
        if (!app.product && app.loanType) {
          app.product = await LoanProduct.findOne({ loanType: app.loanType, isActive: true })
            .select("productName loanType requiredDocuments interestRate")
            .lean();
        }
        return app;
      })
    );

    const totalPages = Math.ceil(total / limit) || 0;

    return res.status(200).json({
      count: applications.length,
      pagination: {
        total,
        page,
        limit,
        totalPages,
        hasPrevPage: page > 1,
        hasNextPage: page < totalPages,
      },
      applications,
    });
  } catch (error) {
    return res.status(500).json({
      message: "Failed to fetch loan applications",
      error: error.message,
    });
  }
};

export const getApplicationById = async (req, res) => {
  try {
    const { id } = req.params;
    const application = await LoanApplication.findById(id)
      .populate("user", "name email phone kycStatus address dob")
      .populate("assignedTo", "name email")
      .populate("product", "productName loanType requiredDocuments interestRate")
      .populate("account");

    if (!application) {
      return res.status(404).json({ message: "Loan application not found" });
    }

    if (!application.product && application.loanType) {
      const fallbackProd = await LoanProduct.findOne({ loanType: application.loanType, isActive: true })
        .select("productName loanType requiredDocuments interestRate");
      if (fallbackProd) {
        application.product = fallbackProd;
      }
    }

    return res.status(200).json({ application });
  } catch (error) {
    return res.status(500).json({ message: "Failed to fetch application", error: error.message });
  }
};

export const assignLoanWorker = async (req, res) => {
  try {
    const { id } = req.params;
    const application = await LoanApplication.findById(id);

    if (!application) {
      return res.status(404).json({ message: "Loan application not found" });
    }

    application.assignedTo = req.user._id;
    if (["submitted", "pending"].includes(application.status)) {
      application.status = "under_worker_review";
    }
    await application.save();

    return res.status(200).json({
      message: "Loan application assigned to worker",
      application,
    });
  } catch (error) {
    return res.status(500).json({ message: "Failed to assign worker", error: error.message });
  }
};

/**
 * Worker performs review checklists, requests additional docs, or updates field verification status
 */
export const updateWorkerReview = async (req, res) => {
  try {
    const { id } = req.params;
    const {
      documentsVerified,
      incomeVerified,
      employmentVerified,
      bankStatementsVerified,
      existingLiabilitiesVerified,
      requestAdditionalDocs,
      requestedDocNote,
      fieldVerificationRequired,
      fieldVerificationStatus,
      workerNotes,
      status,
    } = req.body;

    const application = await LoanApplication.findById(id);
    if (!application) {
      return res.status(404).json({ message: "Loan application not found" });
    }

    application.workerReview = {
      documentsVerified: documentsVerified ?? application.workerReview?.documentsVerified ?? false,
      incomeVerified: incomeVerified ?? application.workerReview?.incomeVerified ?? false,
      employmentVerified: employmentVerified ?? application.workerReview?.employmentVerified ?? false,
      bankStatementsVerified: bankStatementsVerified ?? application.workerReview?.bankStatementsVerified ?? false,
      existingLiabilitiesVerified: existingLiabilitiesVerified ?? application.workerReview?.existingLiabilitiesVerified ?? false,
      fieldVerificationRequired: fieldVerificationRequired ?? application.workerReview?.fieldVerificationRequired ?? false,
      fieldVerificationStatus: fieldVerificationStatus || application.workerReview?.fieldVerificationStatus || "not_required",
      workerNotes: workerNotes || application.workerReview?.workerNotes || "",
      requestedDocNote: requestedDocNote || application.workerReview?.requestedDocNote || "",
    };

    const docTitle = req.body.requestedDocTitle || "Additional Requested Document";
    if (requestAdditionalDocs && (requestedDocNote || req.body.requestedDocTitle)) {
      application.status = "documents_requested";
      if (!application.documents.additionalDocs) application.documents.additionalDocs = [];
      application.documents.additionalDocs.push({
        title: docTitle,
        status: "requested",
        requestedNote: requestedDocNote || `Please upload ${docTitle}`,
      });
      await notifyUser(application.user, {
        type: "loan",
        title: `Document Requested: ${docTitle}`,
        message: `Worker reviewing application ${application.applicationNumber} requested: ${docTitle}. Note: ${requestedDocNote || "Please upload this document."}`,
        meta: { loanId: application._id, applicationNumber: application.applicationNumber },
      });
    } else if (status) {
      application.status = status;
    } else if (fieldVerificationStatus === "pending") {
      application.status = "field_verification";
    } else if (
      documentsVerified &&
      incomeVerified &&
      employmentVerified &&
      bankStatementsVerified &&
      existingLiabilitiesVerified
    ) {
      application.status = "credit_assessment";
    }

    application.reviewedBy = req.user._id;
    application.reviewedAt = new Date();
    await application.save();

    return res.status(200).json({
      message: "Worker review updated successfully",
      application,
    });
  } catch (error) {
    return res.status(500).json({ message: "Failed to update worker review", error: error.message });
  }
};

/**
 * Worker sanctions & approves loan application -> Generates Sanction Letter
 */
export const sanctionLoan = async (req, res) => {
  try {
    const { id } = req.params;
    const { sanctionedAmount, sanctionedInterestRate, sanctionedTenureMonths } = req.body;

    const application = await LoanApplication.findById(id);
    if (!application) {
      return res.status(404).json({ message: "Loan application not found" });
    }

    const sAmount = Number(sanctionedAmount || application.requestedAmount || application.principal);
    const sRate = Number(sanctionedInterestRate || application.interestRate);
    const sTenure = Number(sanctionedTenureMonths || application.tenureMonths);
    const sInterestType = (req.body.sanctionedInterestType || req.body.interestType || application.interestType || "diminishing").toLowerCase() === "flat" ? "flat" : "diminishing";

    const sEmi = calculateEMI(sAmount, sRate, sTenure, sInterestType);
    const sanctionLetterNum = `SNC-${Date.now().toString().slice(-6)}`;

    let sTotalInterest = 0;
    let sTotalPayable = 0;

    if (sInterestType === "flat") {
      sTotalInterest = round2((sAmount * (sRate / 100) * sTenure) / 12);
      sTotalPayable = round2(sAmount + sTotalInterest);
    } else {
      sTotalPayable = round2(sEmi * sTenure);
      sTotalInterest = round2(sTotalPayable - sAmount);
    }

    application.principal = sAmount;
    application.requestedAmount = sAmount;
    application.interestRate = sRate;
    application.interestType = sInterestType;
    application.tenureMonths = sTenure;
    application.monthlyEMI = sEmi;
    application.emiAmount = sEmi;
    application.totalInterest = sTotalInterest;
    application.totalPayable = sTotalPayable;
    application.totalRepayment = sTotalPayable;

    application.sanctionDetails = {
      sanctionLetterNumber: sanctionLetterNum,
      sanctionedAmount: sAmount,
      sanctionedInterestRate: sRate,
      sanctionedInterestType: sInterestType,
      sanctionedTenureMonths: sTenure,
      sanctionedEmi: sEmi,
      sanctionedAt: new Date(),
      customerAccepted: false,
    };

    application.status = "sanctioned";
    application.reviewedBy = req.user._id;
    application.reviewedAt = new Date();

    await application.save();

    await notifyUser(application.user, {
      type: "loan",
      title: "Loan Sanctioned!",
      message: `Congratulations! Your loan application ${application.applicationNumber} has been sanctioned for ₹${sAmount.toLocaleString("en-IN")}. Please review and accept your Sanction Letter.`,
      meta: { loanId: application._id, applicationNumber: application.applicationNumber, sanctionedAmount: sAmount },
    });

    await notifyAdmins({
      type: "loan",
      title: "Loan Sanctioned",
      message: `Loan application ${application.applicationNumber} sanctioned for ₹${sAmount.toLocaleString("en-IN")}.`,
      meta: { loanId: application._id, applicationNumber: application.applicationNumber, sanctionedAmount: sAmount },
    });

    // Send customer email notification upon loan sanction
    const applicant = await User.findById(application.user).select("name email");
    const customerEmail = applicant?.email || application.personalInformation?.email;
    const customerName = applicant?.name || application.personalInformation?.fullName || "Customer";
    if (customerEmail) {
      try {
        await sendLoanSanctionEmail(customerEmail, application, customerName);
      } catch (emailErr) {
        console.error("Failed to send loan sanction email:", emailErr.message);
      }
    }

    return res.status(200).json({
      message: `Loan sanctioned successfully for ₹${sAmount}. Sanction Letter ${sanctionLetterNum} generated.`,
      application,
    });
  } catch (error) {
    return res.status(500).json({ message: "Failed to sanction loan", error: error.message });
  }
};

/**
 * Worker rejects loan application & records reason
 */
export const rejectLoan = async (req, res) => {
  try {
    const { id } = req.params;
    const { rejectionReason } = req.body;

    if (!rejectionReason) {
      return res.status(400).json({ message: "Please provide a rejection reason." });
    }

    const application = await LoanApplication.findById(id);
    if (!application) {
      return res.status(404).json({ message: "Loan application not found" });
    }

    application.status = "rejected";
    application.rejectionReason = rejectionReason;
    application.reviewedBy = req.user._id;
    application.reviewedAt = new Date();

    await application.save();

    await notifyUser(application.user, {
      type: "loan",
      title: "Loan Application Rejected",
      message: `Your loan application ${application.applicationNumber} was rejected. Reason: ${rejectionReason}`,
      meta: { loanId: application._id, applicationNumber: application.applicationNumber },
    });

    await notifyAdmins({
      type: "loan",
      title: "Loan Application Rejected",
      message: `Loan application ${application.applicationNumber} rejected by worker. Reason: ${rejectionReason}`,
      meta: { loanId: application._id, applicationNumber: application.applicationNumber },
    });

    return res.status(200).json({
      message: "Loan application rejected",
      application,
    });
  } catch (error) {
    return res.status(500).json({ message: "Failed to reject loan application", error: error.message });
  }
};

export const reviewLoanApplication = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, rejectionReason } = req.body;
    const normalizedStatus = status ? status.toLowerCase() : "";

    if (normalizedStatus === "rejected") {
      return rejectLoan(req, res);
    }

    if (normalizedStatus === "sanctioned" || normalizedStatus === "approved") {
      return sanctionLoan(req, res);
    }

    const application = await LoanApplication.findById(id);
    if (!application) {
      return res.status(404).json({ message: "Loan application not found" });
    }

    application.status = normalizedStatus || application.status;
    application.reviewedBy = req.user._id;
    application.reviewedAt = new Date();
    await application.save();

    return res.status(200).json({
      message: `Loan application updated to '${application.status}'`,
      application,
    });
  } catch (error) {
    return res.status(500).json({ message: "Failed to review loan", error: error.message });
  }
};

/**
 * Worker disburses approved loan -> credits customer account balance and triggers EMI schedule generation
 */
export const disburseLoan = async (req, res) => {
  try {
    const { id } = req.params;
    const application = await LoanApplication.findById(id);

    if (!application) {
      return res.status(404).json({ message: "Loan application not found" });
    }

    if (!["approved", "sanctioned", "agreement_pending"].includes(application.status)) {
      return res.status(400).json({
        message: `Cannot disburse loan with status '${application.status}'. Application must be approved first.`,
      });
    }

    application.status = "disbursed";
    application.disbursedAt = new Date();
    await application.save();

    // Credit user's bank account
    if (application.account || application.user) {
      const account = application.account
        ? await Account.findById(application.account)
        : await Account.findOne({ user: application.user });

      if (account) {
        const disburseAmt = application.principal || application.requestedAmount || 0;
        account.balance += disburseAmt;
        await account.save();
      }
    }

    // Generate EMI repayment schedule
    await generateScheduleOnDisbursal(application._id);

    await notifyUser(application.user, {
      type: "loan",
      title: "🎉 Loan Disbursed!",
      message: `Your loan ${application.applicationNumber} of ₹${(application.principal || application.requestedAmount).toLocaleString(
        "en-IN"
      )} has been disbursed to your account.`,
      meta: { loanId: application._id, applicationNumber: application.applicationNumber },
    });

    await notifyAdmins({
      type: "loan",
      title: "Loan Disbursal Executed",
      message: `Loan ${application.applicationNumber} of ₹${(application.principal || application.requestedAmount).toLocaleString(
        "en-IN"
      )} disbursed to customer account.`,
      meta: { loanId: application._id, applicationNumber: application.applicationNumber },
    });

    const updatedApp = await LoanApplication.findById(id).populate("repayments");

    return res.status(200).json({
      message: "Loan disbursed successfully and EMI schedule generated.",
      application: updatedApp,
    });
  } catch (error) {
    return res.status(500).json({ message: "Failed to disburse loan", error: error.message });
  }
};
