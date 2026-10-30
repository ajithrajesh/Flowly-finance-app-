process.env.NODE_ENV = "test";
import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import User from "../models/User.js";
import KYC from "../models/KYC.js";
import Document from "../models/Document.js";
import LoanApplication from "../models/LoanApplication.js";
import LoanProduct from "../models/LoanProduct.js";
import Account from "../models/Account.js";
import Notification from "../models/Notification.js";
import { submitKYC } from "../controllers/kycController.js";
import {
  applyLoan,
  resubmitDocuments,
  sanctionLoan,
  acceptSanctionLetter,
  esignLoanAgreement,
} from "../controllers/loanController.js";

const mockQuery = (val) => ({
  select: () => mockQuery(val),
  lean: () => Promise.resolve(val),
  populate: () => mockQuery(val),
  sort: () => mockQuery(val),
  skip: () => mockQuery(val),
  limit: () => mockQuery(val),
  then: (resolve, reject) => Promise.resolve(val).then(resolve, reject),
  catch: (reject) => Promise.resolve(val).catch(reject),
});

const createMockRes = () => {
  const state = { statusCode: 200, body: null };
  const res = {
    status: (code) => {
      state.statusCode = code;
      return {
        json: (data) => {
          state.body = data;
          return data;
        },
      };
    },
    json: (data) => {
      state.body = data;
      return data;
    },
  };
  return { res, state };
};

describe("Loan and KYC Document Workflow Integrity", () => {
  // Save original methods
  const originals = {};

  beforeEach(() => {
    originals.userFind = User.find;
    originals.userFindOne = User.findOne;
    originals.userFindById = User.findById;
    originals.userFindByIdAndUpdate = User.findByIdAndUpdate;

    originals.kycFindOne = KYC.findOne;
    originals.kycCreate = KYC.create;
    originals.kycFindByIdAndUpdate = KYC.findByIdAndUpdate;
    originals.kycFindOneAndUpdate = KYC.findOneAndUpdate;
    originals.docCreate = Document.create;
    originals.docUpdateMany = Document.updateMany;

    originals.loanFindOne = LoanApplication.findOne;
    originals.loanFindById = LoanApplication.findById;
    originals.loanCount = LoanApplication.countDocuments;
    originals.loanCreate = LoanApplication.create;

    originals.productFindById = LoanProduct.findById;
    originals.accountFindOne = Account.findOne;

    originals.notifCreate = Notification.create;
    originals.notifCount = Notification.countDocuments;
    originals.notifInsertMany = Notification.insertMany;

    // Default non-buffering stubs
    User.find = () => mockQuery([]);
    User.findOne = () => mockQuery(null);
    User.findById = (id) => mockQuery({ _id: id, name: "Test User", role: "customer", email: "test@example.com" });
    User.findByIdAndUpdate = async () => ({ _id: new mongoose.Types.ObjectId() });

    KYC.findByIdAndUpdate = async () => ({});
    KYC.findOneAndUpdate = async () => ({});

    Document.create = async (doc) => ({ _id: new mongoose.Types.ObjectId(), ...doc });
    Document.updateMany = async () => ({ modifiedCount: 0 });

    Notification.create = async (data) => ({ _id: new mongoose.Types.ObjectId(), ...data });
    Notification.countDocuments = async () => 0;
    Notification.insertMany = async () => [];
  });

  afterEach(() => {
    User.find = originals.userFind;
    User.findOne = originals.userFindOne;
    User.findById = originals.userFindById;
    User.findByIdAndUpdate = originals.userFindByIdAndUpdate;

    KYC.findOne = originals.kycFindOne;
    KYC.create = originals.kycCreate;
    KYC.findByIdAndUpdate = originals.kycFindByIdAndUpdate;
    KYC.findOneAndUpdate = originals.kycFindOneAndUpdate;
    Document.create = originals.docCreate;
    Document.updateMany = originals.docUpdateMany;

    LoanApplication.findOne = originals.loanFindOne;
    LoanApplication.findById = originals.loanFindById;
    LoanApplication.countDocuments = originals.loanCount;
    LoanApplication.create = originals.loanCreate;

    LoanProduct.findById = originals.productFindById;
    Account.findOne = originals.accountFindOne;

    Notification.create = originals.notifCreate;
    Notification.countDocuments = originals.notifCount;
    Notification.insertMany = originals.notifInsertMany;
  });

  it("KYC: stores exact separate original URLs for PAN, Aadhaar, and Selfie", async () => {
    const fakeUserId = new mongoose.Types.ObjectId();
    const fakeKycId = new mongoose.Types.ObjectId();

    let createdDocs = [];
    Document.create = async (docData) => {
      const doc = {
        _id: new mongoose.Types.ObjectId(),
        ...docData,
      };
      createdDocs.push(doc);
      return doc;
    };

    let savedKyc = null;
    KYC.findOne = async () => null;
    KYC.create = async (data) => {
      savedKyc = {
        _id: fakeKycId,
        ...data,
        save: async function () {
          return this;
        },
      };
      return savedKyc;
    };

    const req = {
      user: { _id: fakeUserId, name: "Alice Applicant" },
      body: {
        address: "123 MG Road, Kochi",
        idType: "aadhaar",
        idNumber: "123456789012",
        dob: "1995-05-15",
        gender: "Female",
      },
      files: {
        aadhaar: [
          {
            originalname: "original_aadhaar_card.pdf",
            buffer: Buffer.from("fake-aadhaar-content"),
            mimetype: "application/pdf",
          },
        ],
        pan: [
          {
            originalname: "original_pan_card.jpg",
            buffer: Buffer.from("fake-pan-image-content"),
            mimetype: "image/jpeg",
          },
        ],
        selfie: [
          {
            originalname: "customer_live_selfie.png",
            buffer: Buffer.from("fake-selfie-content"),
            mimetype: "image/png",
          },
        ],
      },
    };

    const { res, state } = createMockRes();
    await submitKYC(req, res);

    assert.equal(state.statusCode, 200);
    assert.ok(savedKyc);

    // Verify Aadhaar and PAN URLs are stored separately and are distinct
    assert.ok(savedKyc.aadhaarUrl, "aadhaarUrl must be populated");
    assert.ok(savedKyc.panUrl, "panUrl must be populated");
    assert.ok(savedKyc.selfieUrl, "selfieUrl must be populated");
    assert.notEqual(savedKyc.aadhaarUrl, savedKyc.panUrl, "Aadhaar and PAN URLs must be completely distinct");

    // Verify Document collection entries
    assert.equal(createdDocs.length, 3);
    const aadhaarEntry = createdDocs.find((d) => d.documentType === "aadhaar");
    const panEntry = createdDocs.find((d) => d.documentType === "pan");
    const selfieEntry = createdDocs.find((d) => d.documentType === "selfie");

    assert.ok(aadhaarEntry);
    assert.ok(panEntry);
    assert.ok(selfieEntry);
    assert.notEqual(aadhaarEntry.fileUrl, panEntry.fileUrl);
  });

  it("KYC: partial update re-uploading PAN preserves existing Aadhaar document", async () => {
    const fakeUserId = new mongoose.Types.ObjectId();
    const existingAadhaarUrl = "https://res.cloudinary.com/flowly/kyc/original_aadhaar.pdf";
    const existingSelfieUrl = "https://res.cloudinary.com/flowly/kyc/original_selfie.png";

    const mockKyc = {
      _id: new mongoose.Types.ObjectId(),
      user: fakeUserId,
      idType: "aadhaar",
      idNumber: "123456789012",
      address: "Old Address",
      documentUrl: existingAadhaarUrl,
      aadhaarUrl: existingAadhaarUrl,
      panUrl: "",
      selfieUrl: existingSelfieUrl,
      save: async function () {
        return this;
      },
    };

    Document.create = async (docData) => ({
      _id: new mongoose.Types.ObjectId(),
      ...docData,
    });

    KYC.findOne = async () => mockKyc;

    const req = {
      user: { _id: fakeUserId, name: "Alice Applicant" },
      body: {
        address: "Updated Address, Kochi",
        idType: "pan",
        idNumber: "ABCDE1234F",
      },
      files: {
        pan: [
          {
            originalname: "new_pan_card.jpg",
            buffer: Buffer.from("fake-pan-buffer"),
            mimetype: "image/jpeg",
          },
        ],
      },
    };

    const { res, state } = createMockRes();
    await submitKYC(req, res);

    assert.equal(state.statusCode, 200);
    assert.ok(mockKyc.panUrl, "panUrl should be updated with new file");
    assert.equal(
      mockKyc.aadhaarUrl,
      existingAadhaarUrl,
      "Existing Aadhaar document must be preserved on PAN re-upload"
    );
    assert.equal(
      mockKyc.selfieUrl,
      existingSelfieUrl,
      "Existing Selfie document must be preserved"
    );
  });

  it("Loans: application stores exact uploaded original files and no sample fallbacks", async () => {
    const fakeUserId = new mongoose.Types.ObjectId();
    const fakeAccountId = new mongoose.Types.ObjectId();

    User.findById = (id) =>
      mockQuery({
        _id: fakeUserId,
        name: "Bob Borrower",
        kycStatus: "verified",
        email: "bob@example.com",
        role: "customer",
      });

    Account.findOne = async () => ({ _id: fakeAccountId, accountNumber: "5010099881", status: "active" });
    LoanProduct.findById = (id) =>
      mockQuery({
        _id: new mongoose.Types.ObjectId(),
        productName: "Personal Express Loan",
        loanType: "Personal",
        interestRate: 11.5,
        interestType: "diminishing",
      });
    LoanApplication.countDocuments = async () => 0;
    KYC.findOne = async () => null;
    Document.create = async (docData) => ({ _id: new mongoose.Types.ObjectId(), ...docData });

    let createdLoanApp = null;
    LoanApplication.create = async (data) => {
      createdLoanApp = data;
      return {
        ...data,
        _id: new mongoose.Types.ObjectId(),
        save: async function () {
          return this;
        },
      };
    };

    const req = {
      user: { _id: fakeUserId, name: "Bob Borrower" },
      body: {
        requestedAmount: 150000,
        tenureMonths: 18,
        purpose: "Home Renovation",
        personalInformation: { fullName: "Bob Borrower", phone: "9876543210" },
        incomeDetails: { monthlyIncome: 65000, existingMonthlyEmi: 5000 },
      },
      files: [
        {
          fieldname: "panCard",
          originalname: "my_original_pan.jpg",
          buffer: Buffer.from("bob-pan-content"),
          mimetype: "image/jpeg",
        },
        {
          fieldname: "aadhaarCard",
          originalname: "my_original_aadhaar.pdf",
          buffer: Buffer.from("bob-aadhaar-content"),
          mimetype: "application/pdf",
        },
        {
          fieldname: "salarySlip",
          originalname: "june_salary_slip.pdf",
          buffer: Buffer.from("bob-salary-content"),
          mimetype: "application/pdf",
        },
        {
          fieldname: "bankStatement",
          originalname: "hfdc_bank_statement.pdf",
          buffer: Buffer.from("bob-bank-statement-content"),
          mimetype: "application/pdf",
        },
      ],
    };

    const { res, state } = createMockRes();
    await applyLoan(req, res);

    assert.equal(state.statusCode, 201);
    assert.ok(createdLoanApp);
    const docs = createdLoanApp.documents;

    // Verify exact URLs and NO sample fallbacks
    assert.ok(docs.panCardUrl && !docs.panCardUrl.includes("sample_"), "Must not use sample_pan.pdf");
    assert.ok(docs.aadhaarCardUrl && !docs.aadhaarCardUrl.includes("sample_"), "Must not use sample_aadhaar.pdf");
    assert.ok(docs.salarySlipUrl && !docs.salarySlipUrl.includes("sample_"), "Must not use sample_salary.pdf");
    assert.ok(docs.bankStatementUrl && !docs.bankStatementUrl.includes("sample_"), "Must not use sample_statement.pdf");

    assert.notEqual(docs.panCardUrl, docs.aadhaarCardUrl);
    assert.notEqual(docs.salarySlipUrl, docs.bankStatementUrl);
  });

  it("Loans: auto-maps verified customer KYC documents when not re-uploaded during application", async () => {
    const fakeUserId = new mongoose.Types.ObjectId();
    const fakeAccountId = new mongoose.Types.ObjectId();
    const kycPanUrl = "https://res.cloudinary.com/flowly/kyc/verified_pan.pdf";
    const kycAadhaarUrl = "https://res.cloudinary.com/flowly/kyc/verified_aadhaar.pdf";

    User.findById = (id) =>
      mockQuery({
        _id: fakeUserId,
        name: "Carol Customer",
        kycStatus: "verified",
        email: "carol@example.com",
        role: "customer",
      });

    Account.findOne = async () => ({ _id: fakeAccountId, accountNumber: "5010099882", status: "active" });
    LoanProduct.findById = () => mockQuery(null);
    LoanApplication.countDocuments = async () => 0;
    KYC.findOne = async () => ({
      user: fakeUserId,
      panUrl: kycPanUrl,
      aadhaarUrl: kycAadhaarUrl,
      idType: "aadhaar",
    });

    let createdLoanApp = null;
    LoanApplication.create = async (data) => {
      createdLoanApp = data;
      return {
        ...data,
        _id: new mongoose.Types.ObjectId(),
        save: async function () {
          return this;
        },
      };
    };

    const req = {
      user: { _id: fakeUserId, name: "Carol Customer" },
      body: {
        requestedAmount: 50000,
        tenureMonths: 12,
        purpose: "Festival Shopping",
        documents: {}, // Customer did not upload separate PAN/Aadhaar
      },
    };

    const { res, state } = createMockRes();
    await applyLoan(req, res);

    assert.equal(state.statusCode, 201);
    assert.ok(createdLoanApp);

    // Verify auto-mapping from user's verified KYC record
    assert.equal(createdLoanApp.documents.panCardUrl, kycPanUrl);
    assert.equal(createdLoanApp.documents.aadhaarCardUrl, kycAadhaarUrl);
    assert.notEqual(createdLoanApp.documents.panCardUrl, "/uploads/sample_pan.pdf");
    assert.notEqual(createdLoanApp.documents.aadhaarCardUrl, "/uploads/sample_aadhaar.pdf");
  });

  it("Loans: resubmitDocuments updates requested document in-place and prevents duplicates", async () => {
    const fakeUserId = new mongoose.Types.ObjectId();
    const fakeLoanId = new mongoose.Types.ObjectId();

    const originalPanUrl = "https://res.cloudinary.com/flowly/loans/original_pan.pdf";
    const originalAadhaarUrl = "https://res.cloudinary.com/flowly/loans/original_aadhaar.pdf";

    const mockLoanApp = {
      _id: fakeLoanId,
      applicationNumber: "LN-20261026-9090",
      user: fakeUserId,
      status: "documents_requested",
      documents: {
        panCardUrl: originalPanUrl,
        aadhaarCardUrl: originalAadhaarUrl,
        salarySlipUrl: "https://res.cloudinary.com/flowly/loans/salary.pdf",
        bankStatementUrl: "https://res.cloudinary.com/flowly/loans/bank.pdf",
        additionalDocs: [
          {
            title: "Updated Rental Agreement",
            status: "requested",
            requestedNote: "Please upload latest notarized rental agreement",
          },
        ],
      },
      workerReview: {
        requestedDocNote: "Please upload latest notarized rental agreement",
      },
      save: async function () {
        return this;
      },
    };

    LoanApplication.findOne = async () => mockLoanApp;

    const req = {
      user: { _id: fakeUserId },
      params: { id: fakeLoanId },
      body: {
        docTitle: "Updated Rental Agreement",
      },
      file: {
        originalname: "rental_agreement_2026.pdf",
        buffer: Buffer.from("rental-doc-content"),
        mimetype: "application/pdf",
      },
    };

    const { res, state } = createMockRes();
    await resubmitDocuments(req, res);

    assert.equal(state.statusCode, 200);

    // Verify NO duplicate items were pushed into additionalDocs
    assert.equal(mockLoanApp.documents.additionalDocs.length, 1);
    const updatedItem = mockLoanApp.documents.additionalDocs[0];
    assert.equal(updatedItem.title, "Updated Rental Agreement");
    assert.equal(updatedItem.status, "uploaded");
    assert.ok(updatedItem.docUrl, "Must have an uploaded URL");
    assert.notEqual(updatedItem.docUrl, "/uploads/additional_doc.pdf");

    // Verify original base documents were preserved untouched
    assert.equal(mockLoanApp.documents.panCardUrl, originalPanUrl);
    assert.equal(mockLoanApp.documents.aadhaarCardUrl, originalAadhaarUrl);
    assert.equal(mockLoanApp.status, "under_worker_review");
  });

  it("Loans: sanctioning and agreement generation do NOT replace customer uploaded originals", async () => {
    const fakeUserId = new mongoose.Types.ObjectId();
    const fakeLoanId = new mongoose.Types.ObjectId();

    const originalPanUrl = "https://res.cloudinary.com/flowly/loans/original_pan.pdf";
    const originalAadhaarUrl = "https://res.cloudinary.com/flowly/loans/original_aadhaar.pdf";
    const originalSalaryUrl = "https://res.cloudinary.com/flowly/loans/original_salary.pdf";
    const originalBankUrl = "https://res.cloudinary.com/flowly/loans/original_statement.pdf";

    const mockLoanApp = {
      _id: fakeLoanId,
      applicationNumber: "LN-20261026-7788",
      user: fakeUserId,
      principal: 200000,
      requestedAmount: 200000,
      interestRate: 12,
      tenureMonths: 24,
      status: "under_worker_review",
      documents: {
        panCardUrl: originalPanUrl,
        aadhaarCardUrl: originalAadhaarUrl,
        salarySlipUrl: originalSalaryUrl,
        bankStatementUrl: originalBankUrl,
        specificDocs: [{ name: "Vehicle Quotation", docUrl: "https://dealers.com/quote.pdf" }],
        additionalDocs: [],
      },
      sanctionDetails: {},
      agreementDetails: {},
      save: async function () {
        return this;
      },
    };

    LoanApplication.findById = () => mockQuery(mockLoanApp);
    LoanApplication.findOne = async () => mockLoanApp;
    User.findById = (id) => mockQuery({ _id: fakeUserId, name: "David Dave", email: "david@example.com", role: "customer" });

    // 1. Worker sanctions the loan
    const sanctionReq = {
      user: { _id: new mongoose.Types.ObjectId(), role: "worker" },
      params: { id: fakeLoanId },
      body: {
        sanctionedAmount: 180000,
        sanctionedInterestRate: 11,
        sanctionedTenureMonths: 24,
      },
    };

    const { res: sanctionRes, state: sanctionState } = createMockRes();
    await sanctionLoan(sanctionReq, sanctionRes);

    assert.equal(sanctionState.statusCode, 200);
    assert.equal(mockLoanApp.status, "sanctioned");
    assert.ok(mockLoanApp.sanctionDetails.sanctionLetterNumber);

    // Customer uploaded documents MUST remain intact
    assert.equal(mockLoanApp.documents.panCardUrl, originalPanUrl);
    assert.equal(mockLoanApp.documents.aadhaarCardUrl, originalAadhaarUrl);
    assert.equal(mockLoanApp.documents.salarySlipUrl, originalSalaryUrl);
    assert.equal(mockLoanApp.documents.bankStatementUrl, originalBankUrl);

    // 2. Customer accepts sanction letter
    const acceptReq = {
      user: { _id: fakeUserId },
      params: { id: fakeLoanId },
    };
    const { res: acceptRes, state: acceptState } = createMockRes();
    await acceptSanctionLetter(acceptReq, acceptRes);

    assert.equal(acceptState.statusCode, 200);
    assert.equal(mockLoanApp.status, "agreement_pending");
    assert.ok(mockLoanApp.agreementDetails.agreementNumber);

    // Documents still untouched
    assert.equal(mockLoanApp.documents.panCardUrl, originalPanUrl);
    assert.equal(mockLoanApp.documents.aadhaarCardUrl, originalAadhaarUrl);

    // 3. Customer e-signs loan agreement
    const esignReq = {
      user: { _id: fakeUserId },
      params: { id: fakeLoanId },
      body: { signatureHash: "DIGI-SIGN-999" },
    };
    const { res: esignRes, state: esignState } = createMockRes();
    await esignLoanAgreement(esignReq, esignRes);

    assert.equal(esignState.statusCode, 200);
    assert.equal(mockLoanApp.status, "approved");
    assert.equal(mockLoanApp.agreementDetails.eSigned, true);

    // Original documents are NEVER overwritten by agreement or sanction letters
    assert.equal(mockLoanApp.documents.panCardUrl, originalPanUrl);
    assert.equal(mockLoanApp.documents.aadhaarCardUrl, originalAadhaarUrl);
    assert.equal(mockLoanApp.documents.salarySlipUrl, originalSalaryUrl);
    assert.equal(mockLoanApp.documents.bankStatementUrl, originalBankUrl);
  });
});
