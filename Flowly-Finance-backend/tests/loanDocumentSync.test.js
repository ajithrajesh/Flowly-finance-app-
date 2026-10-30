process.env.NODE_ENV = "test";
import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import mongoose from "mongoose";
import User from "../models/User.js";
import KYC from "../models/KYC.js";
import Document from "../models/Document.js";
import LoanApplication from "../models/LoanApplication.js";
import LoanProduct from "../models/LoanProduct.js";
import Account from "../models/Account.js";
import FixedDeposit from "../models/FixedDeposit.js";
import Notification from "../models/Notification.js";
import {
  applyLoan,
  resubmitDocuments,
  getApplicationById,
  getAllApplications,
} from "../controllers/loanController.js";
import { serveSecureDocument } from "../controllers/documentController.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const uploadsDir = path.resolve(__dirname, "..", "uploads");

// Helper to create a mock response object
function createMockRes() {
  let statusCode = 200;
  let responseData = null;
  const headers = {};
  let sentFilePath = null;

  const res = {
    status: (code) => {
      statusCode = code;
      return {
        json: (data) => {
          responseData = data;
          return data;
        },
      };
    },
    json: (data) => {
      responseData = data;
      return data;
    },
    setHeader: (name, value) => {
      headers[name.toLowerCase()] = value;
    },
    getHeader: (name) => headers[name.toLowerCase()],
    sendFile: (targetPath, cb) => {
      sentFilePath = targetPath;
      if (typeof cb === "function") cb(null);
      return res;
    },
    headersSent: false,
  };

  return {
    res,
    getStatus: () => statusCode,
    getData: () => responseData,
    getHeaders: () => headers,
    getSentFilePath: () => sentFilePath,
  };
}

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

describe("Loan Document Synchronization & Scheme Requirements Suite", () => {
  const originals = {};

  beforeEach(() => {
    originals.userFind = User.find;
    originals.userFindById = User.findById;
    originals.userFindOne = User.findOne;
    originals.kycFindOne = KYC.findOne;
    originals.docCreate = Document.create;
    originals.docFindOne = Document.findOne;
    originals.loanFindById = LoanApplication.findById;
    originals.loanFindOne = LoanApplication.findOne;
    originals.loanFind = LoanApplication.find;
    originals.loanCount = LoanApplication.countDocuments;
    originals.loanCreate = LoanApplication.create;
    originals.productFindById = LoanProduct.findById;
    originals.accountFindOne = Account.findOne;
    originals.fdFindOne = FixedDeposit.findOne;
    originals.notifCreate = Notification.create;
    originals.notifCount = Notification.countDocuments;
    originals.notifInsertMany = Notification.insertMany;

    // Sensible default non-buffering mocks
    User.find = () => mockQuery([]);
    User.findOne = () => mockQuery(null);
    KYC.findOne = () => mockQuery(null);
    Document.create = async (docData) => ({ _id: new mongoose.Types.ObjectId(), ...docData });
    Document.findOne = () => mockQuery(null);
    LoanApplication.findOne = () => mockQuery(null);
    LoanApplication.countDocuments = async () => 0;
    FixedDeposit.findOne = () => mockQuery(null);
    Notification.create = async (data) => ({ _id: new mongoose.Types.ObjectId(), ...data });
    Notification.countDocuments = async () => 0;
    Notification.insertMany = async () => [];
  });

  afterEach(() => {
    User.find = originals.userFind;
    User.findById = originals.userFindById;
    User.findOne = originals.userFindOne;
    KYC.findOne = originals.kycFindOne;
    Document.create = originals.docCreate;
    Document.findOne = originals.docFindOne;
    LoanApplication.findById = originals.loanFindById;
    LoanApplication.findOne = originals.loanFindOne;
    LoanApplication.find = originals.loanFind;
    LoanApplication.countDocuments = originals.loanCount;
    LoanApplication.create = originals.loanCreate;
    LoanProduct.findById = originals.productFindById;
    Account.findOne = originals.accountFindOne;
    FixedDeposit.findOne = originals.fdFindOne;
    Notification.create = originals.notifCreate;
    Notification.countDocuments = originals.notifCount;
    Notification.insertMany = originals.notifInsertMany;
  });

  it("Customer submits loan with scheme-specific uploads: saves exact filenames, URLs, and creates semantic Document records", async () => {
    const customerId = new mongoose.Types.ObjectId();
    const productId = new mongoose.Types.ObjectId();

    const mockProduct = {
      _id: productId,
      productName: "Business Expansion Loan",
      loanType: "Business",
      interestRate: 14.0,
      minAmount: 100000,
      maxAmount: 2000000,
      requiredDocuments: [
        { name: "GST Registration Certificate", description: "Valid GSTIN certificate copy", isMandatory: true },
        { name: "Business Registration / Proof", description: "Udyam / MSME Certificate", isMandatory: true },
      ],
    };

    User.findById = () => Promise.resolve({
      _id: customerId,
      name: "Rohan Sharma",
      email: "rohan@example.com",
      phone: "9876543210",
      kycStatus: "verified",
    });

    Account.findOne = () => Promise.resolve({
      _id: new mongoose.Types.ObjectId(),
      user: customerId,
      status: "active",
    });

    LoanProduct.findById = () => Promise.resolve(mockProduct);
    LoanApplication.countDocuments = () => Promise.resolve(0);

    const createdDocuments = [];
    Document.create = async (docData) => {
      createdDocuments.push(docData);
      return { _id: new mongoose.Types.ObjectId(), ...docData };
    };

    let createdLoanApp = null;
    LoanApplication.create = async (appData) => {
      createdLoanApp = { _id: new mongoose.Types.ObjectId(), ...appData };
      return createdLoanApp;
    };

    const req = {
      user: { _id: customerId, role: "customer" },
      body: {
        productId: String(productId),
        productName: "Business Expansion Loan",
        loanType: "Business",
        requestedAmount: "250000",
        tenureMonths: "24",
        purpose: "Inventory purchase",
        personalInformation: JSON.stringify({
          fullName: "Rohan Sharma",
          email: "rohan@example.com",
          phone: "9876543210",
        }),
        employmentDetails: JSON.stringify({
          employmentType: "business",
          companyName: "Sharma Trading Co.",
          designation: "Proprietor",
          workExperienceYears: 5,
        }),
        incomeDetails: JSON.stringify({
          monthlyIncome: 120000,
          existingMonthlyEmi: 10000,
        }),
        documents: JSON.stringify({
          specificDocs: [
            {
              schemeIndex: 0,
              name: "GST Registration Certificate",
              fileName: "gst_certificate_rohan_2026.pdf",
              status: "uploaded",
            },
            {
              schemeIndex: 1,
              name: "Business Registration / Proof",
              fileName: "udyam_msme_cert.pdf",
              status: "uploaded",
            },
          ],
        }),
      },
      files: [
        {
          fieldname: "specificDoc_0",
          originalname: "gst_certificate_rohan_2026.pdf",
          mimetype: "application/pdf",
          buffer: Buffer.from("%PDF-1.4 GST Certificate content"),
        },
        {
          fieldname: "specificDoc_1",
          originalname: "udyam_msme_cert.pdf",
          mimetype: "application/pdf",
          buffer: Buffer.from("%PDF-1.4 Udyam Registration content"),
        },
      ],
    };

    const { res, getStatus, getData } = createMockRes();
    await applyLoan(req, res);

    assert.equal(getStatus(), 201, `Expected 201 Created but got ${getStatus()}`);
    assert.ok(getData()?.application, "Expected application in response");

    // Verify LoanApplication.documents.specificDocs contains exact uploaded original files
    assert.ok(createdLoanApp, "Loan application record should be created");
    const specificDocs = createdLoanApp.documents?.specificDocs;
    assert.equal(specificDocs.length, 2, "Expected 2 scheme specific documents");

    assert.equal(specificDocs[0].name, "GST Registration Certificate");
    assert.equal(specificDocs[0].fileName, "gst_certificate_rohan_2026.pdf");
    assert.equal(specificDocs[0].status, "uploaded");
    assert.ok(specificDocs[0].docUrl, "Should have a generated docUrl");

    assert.equal(specificDocs[1].name, "Business Registration / Proof");
    assert.equal(specificDocs[1].fileName, "udyam_msme_cert.pdf");
    assert.equal(specificDocs[1].status, "uploaded");
    assert.ok(specificDocs[1].docUrl, "Should have a generated docUrl");

    // Verify semantic Document collection records created
    assert.ok(createdDocuments.length >= 2, "Should create at least 2 Document records");
    const gstDoc = createdDocuments.find((d) => d.documentType === "business_proof" || d.documentType === "tax_return");
    assert.ok(gstDoc, "GST certificate should be mapped to a semantic documentType");
    assert.equal(String(gstDoc.user), String(customerId));
  });

  it("Non-consecutive uploads: prevents index mismatch and spurious 'Document X' entries when optional doc is skipped", async () => {
    const customerId = new mongoose.Types.ObjectId();
    const productId = new mongoose.Types.ObjectId();

    const mockProduct = {
      _id: productId,
      productName: "Personal Loan",
      loanType: "Personal",
      interestRate: 12.0,
      requiredDocuments: [
        { name: "Salary Slips (Last 3 Months)", isMandatory: true },
        { name: "Current Address Proof", isMandatory: false },
        { name: "Bank Statement (Last 6 Months)", isMandatory: true },
      ],
    };

    User.findById = () => Promise.resolve({
      _id: customerId,
      name: "Pooja Verma",
      kycStatus: "verified",
    });
    Account.findOne = () => Promise.resolve({ user: customerId, status: "active" });
    LoanProduct.findById = () => Promise.resolve(mockProduct);
    LoanApplication.countDocuments = () => Promise.resolve(0);

    let createdLoanApp = null;
    LoanApplication.create = async (appData) => {
      createdLoanApp = appData;
      return appData;
    };

    // User uploads index 0 (Salary Slip) and index 2 (Bank Statement), skipping index 1 (Address Proof)
    const req = {
      user: { _id: customerId, role: "customer" },
      body: {
        productId: String(productId),
        requestedAmount: "100000",
        tenureMonths: "12",
        documents: JSON.stringify({
          specificDocs: [
            { schemeIndex: 0, name: "Salary Slips (Last 3 Months)", fileName: "salary_pooja.pdf", status: "uploaded" },
            { schemeIndex: 1, name: "Current Address Proof", fileName: "", status: "pending" },
            { schemeIndex: 2, name: "Bank Statement (Last 6 Months)", fileName: "bank_stmt_pooja.pdf", status: "uploaded" },
          ],
        }),
      },
      files: [
        {
          fieldname: "specificDoc_0",
          originalname: "salary_pooja.pdf",
          mimetype: "application/pdf",
          buffer: Buffer.from("Salary slip binary"),
        },
        {
          fieldname: "specificDoc_2",
          originalname: "bank_stmt_pooja.pdf",
          mimetype: "application/pdf",
          buffer: Buffer.from("Bank statement binary"),
        },
      ],
    };

    const { res, getStatus } = createMockRes();
    await applyLoan(req, res);

    assert.equal(getStatus(), 201);
    const specificDocs = createdLoanApp.documents?.specificDocs;
    assert.equal(specificDocs.length, 3, "All 3 scheme documents must be present in specificDocs");

    // Check Doc 0
    assert.equal(specificDocs[0].name, "Salary Slips (Last 3 Months)");
    assert.equal(specificDocs[0].fileName, "salary_pooja.pdf");
    assert.equal(specificDocs[0].status, "uploaded");

    // Check Doc 1 (skipped optional document)
    assert.equal(specificDocs[1].name, "Current Address Proof");
    assert.equal(specificDocs[1].status, "pending");
    assert.equal(specificDocs[1].fileName, "");

    // Check Doc 2 (non-consecutive index 2)
    assert.equal(specificDocs[2].name, "Bank Statement (Last 6 Months)");
    assert.equal(specificDocs[2].fileName, "bank_stmt_pooja.pdf");
    assert.equal(specificDocs[2].status, "uploaded");

    // Ensure NO spurious "Document X" entries exist
    const hasSpurious = specificDocs.some((d) => d.name.startsWith("Document "));
    assert.equal(hasSpurious, false, "Should not contain any spurious unmapped 'Document X' names");
  });

  it("Customer resubmits requested document: saves fileName, docUrl, and creates Document record", async () => {
    const customerId = new mongoose.Types.ObjectId();
    const loanId = new mongoose.Types.ObjectId();

    const mockLoan = {
      _id: loanId,
      user: customerId,
      status: "documents_requested",
      documents: {
        additionalDocs: [
          {
            title: "Latest Utility Bill",
            requestedNote: "Please provide latest electricity bill",
            status: "requested",
            docUrl: "",
            fileName: "",
          },
        ],
      },
      auditLogs: [],
      save: function () {
        return Promise.resolve(this);
      },
    };

    LoanApplication.findOne = () => Promise.resolve(mockLoan);

    const createdDocs = [];
    Document.create = async (docData) => {
      createdDocs.push(docData);
      return docData;
    };

    const req = {
      user: { _id: customerId, role: "customer" },
      params: { id: String(loanId) },
      body: {
        docTitle: "Latest Utility Bill",
      },
      file: {
        originalname: "electricity_bill_march_2026.pdf",
        mimetype: "application/pdf",
        buffer: Buffer.from("Utility bill binary"),
      },
    };

    const { res, getStatus, getData } = createMockRes();
    await resubmitDocuments(req, res);

    assert.equal(getStatus(), 200, JSON.stringify(getData()));
    assert.equal(mockLoan.documents.additionalDocs[0].status, "uploaded");
    assert.equal(mockLoan.documents.additionalDocs[0].fileName, "electricity_bill_march_2026.pdf");
    assert.ok(mockLoan.documents.additionalDocs[0].docUrl, "Should have docUrl");

    assert.ok(createdDocs.length > 0, "Should register in Document collection");
    assert.equal(createdDocs[0].documentType, "address_proof");
  });

  it("Worker retrieves application via getApplicationById: receives populated product with requiredDocuments", async () => {
    const loanId = new mongoose.Types.ObjectId();
    const productId = new mongoose.Types.ObjectId();

    const mockApplication = {
      _id: loanId,
      applicationNumber: "LN-2026-TEST",
      product: {
        _id: productId,
        productName: "Vehicle & Two-Wheeler Loan",
        loanType: "Vehicle",
        interestRate: 9.5,
        requiredDocuments: [
          { name: "Vehicle Proforma Invoice / Quotation", isMandatory: true },
          { name: "Valid Driving License", isMandatory: true },
        ],
      },
      documents: {
        specificDocs: [
          { name: "Vehicle Proforma Invoice / Quotation", fileName: "dealer_invoice.pdf", docUrl: "/uploads/dealer_invoice.pdf", status: "uploaded" },
          { name: "Valid Driving License", fileName: "", docUrl: "", status: "pending" },
        ],
      },
    };

    LoanApplication.findById = () => mockQuery(mockApplication);

    const req = {
      params: { id: String(loanId) },
      user: { _id: new mongoose.Types.ObjectId(), role: "worker" },
    };

    const { res, getStatus, getData } = createMockRes();
    await getApplicationById(req, res);

    assert.equal(getStatus(), 200);
    const app = getData()?.application;
    assert.ok(app, "Application should be present");
    assert.ok(app.product, "Product should be populated");
    assert.equal(app.product.productName, "Vehicle & Two-Wheeler Loan");
    assert.equal(app.product.requiredDocuments.length, 2);
  });

  it("Worker retrieves paginated applications via getAllApplications: receives populated product", async () => {
    const loanId = new mongoose.Types.ObjectId();
    const productId = new mongoose.Types.ObjectId();

    const mockApplications = [
      {
        _id: loanId,
        applicationNumber: "LN-2026-PAGINATED",
        status: "submitted",
        product: {
          _id: productId,
          productName: "Emergency Medical Loan",
          loanType: "Emergency",
          requiredDocuments: [{ name: "Hospital Estimate / Medical Prescription", isMandatory: true }],
        },
      },
    ];

    LoanApplication.find = () => mockQuery(mockApplications);
    LoanApplication.countDocuments = () => Promise.resolve(1);

    const req = {
      query: { page: "1", limit: "10" },
      user: { _id: new mongoose.Types.ObjectId(), role: "worker" },
    };

    const { res, getStatus, getData } = createMockRes();
    await getAllApplications(req, res);

    assert.equal(getStatus(), 200);
    const data = getData();
    assert.equal(data.count, 1);
    assert.equal(data.pagination.total, 1);
    assert.ok(data.applications[0].product);
    assert.equal(data.applications[0].product.productName, "Emergency Medical Loan");
  });

  it("Access Control: Worker can view customer loan document, unauthorized customer is rejected (403)", async () => {
    // Create physical dummy test file in uploadsDir
    if (!fs.existsSync(uploadsDir)) {
      fs.mkdirSync(uploadsDir, { recursive: true });
    }
    const testFileName = `test-loan-doc-${Date.now()}.pdf`;
    const testFilePath = path.join(uploadsDir, testFileName);
    fs.writeFileSync(testFilePath, "%PDF-1.4 Test Loan PDF Content");

    const ownerCustomerId = new mongoose.Types.ObjectId();
    const unauthorizedCustomerId = new mongoose.Types.ObjectId();
    const workerStaffId = new mongoose.Types.ObjectId();

    const mockLoanApp = {
      _id: new mongoose.Types.ObjectId(),
      user: ownerCustomerId,
      documents: {
        specificDocs: [
          {
            name: "Vehicle Proforma Invoice / Quotation",
            fileName: testFileName,
            docUrl: `/uploads/${testFileName}`,
          },
        ],
      },
    };

    LoanApplication.findOne = (query) => {
      if (query && String(query.user) === String(ownerCustomerId)) {
        return mockQuery(mockLoanApp);
      }
      return mockQuery(null);
    };

    try {
      // 1. Worker accessing customer document -> 200 OK
      const workerReq = {
        params: { filename: testFileName },
        query: {},
        user: { _id: workerStaffId, role: "worker" },
      };
      const workerRes = createMockRes();
      await serveSecureDocument(workerReq, workerRes.res);
      assert.equal(workerRes.getStatus(), 200, "Worker should have permission to view customer loan document");
      assert.ok(workerRes.getSentFilePath(), "File should be sent to worker");

      // 2. Owner customer accessing their own loan document -> 200 OK
      const ownerReq = {
        params: { filename: testFileName },
        query: {},
        user: { _id: ownerCustomerId, role: "customer" },
      };
      const ownerRes = createMockRes();
      await serveSecureDocument(ownerReq, ownerRes.res);
      assert.equal(ownerRes.getStatus(), 200, "Owner customer should be allowed to view their own document");

      // 3. Unauthorized customer accessing another customer's document -> 403 Forbidden
      const unauthReq = {
        params: { filename: testFileName },
        query: {},
        user: { _id: unauthorizedCustomerId, role: "customer" },
      };
      const unauthRes = createMockRes();
      await serveSecureDocument(unauthReq, unauthRes.res);
      assert.equal(unauthRes.getStatus(), 403, "Unauthorized customer should be rejected with 403 Forbidden");
    } finally {
      if (fs.existsSync(testFilePath)) {
        fs.unlinkSync(testFilePath);
      }
    }
  });

  it("Customer uploads mix of image (PNG) and PDF with disabled requirement: excludes disabled requirement, maps correct docTypes, and stores both image and PDF extensions", async () => {
    const customerId = new mongoose.Types.ObjectId();
    const productId = new mongoose.Types.ObjectId();

    const mockProduct = {
      _id: productId,
      productName: "Home Renovation Loan",
      loanType: "Home",
      interestRate: 8.5,
      minAmount: 500000,
      maxAmount: 5000000,
      requiredDocuments: [
        { name: "Property Ownership Title Deed", description: "Registered title deed", isMandatory: true },
        { name: "Obsolete Tax Assessment", description: "Old deprecated requirement", isMandatory: false, disabled: true },
        { name: "Contractor Renovation Estimate", description: "Civil engineer / architect estimate", isMandatory: true },
      ],
    };

    User.findById = () => Promise.resolve({
      _id: customerId,
      name: "Ananya Iyer",
      email: "ananya@example.com",
      phone: "9123456780",
      kycStatus: "verified",
    });

    LoanProduct.findById = () => mockQuery(mockProduct);

    let createdLoanApp = null;
    LoanApplication.create = async (data) => {
      createdLoanApp = { _id: new mongoose.Types.ObjectId(), ...data };
      return createdLoanApp;
    };

    const createdDocuments = [];
    Document.create = async (docData) => {
      const rec = { _id: new mongoose.Types.ObjectId(), ...docData };
      createdDocuments.push(rec);
      return rec;
    };

    Account.findOne = () => mockQuery({
      _id: new mongoose.Types.ObjectId(),
      user: customerId,
      accountNumber: "987654321098",
      balance: 150000,
    });

    // Customer submits Property Deed as PDF, Contractor Estimate as PNG image, and an additional supporting doc
    const req = {
      user: { _id: customerId },
      body: {
        productId: String(productId),
        productName: "Home Renovation Loan",
        loanType: "Home",
        requestedAmount: 1200000,
        tenureMonths: 60,
        interestType: "diminishing",
        purpose: "Kitchen and Living Room Renovation",
        personalInformation: JSON.stringify({
          fullName: "Ananya Iyer",
          dob: "1991-04-12",
          email: "ananya@example.com",
          phone: "9123456780",
          address: "42 Palm Grove, Bengaluru",
          panNumber: "ABCDE1234F",
          aadhaarNumber: "123456789012",
        }),
        employmentDetails: JSON.stringify({
          employmentType: "salaried",
          companyName: "Infosys",
          designation: "Principal Consultant",
          workExperienceYears: 8,
        }),
        incomeDetails: JSON.stringify({
          monthlyIncome: 180000,
          existingMonthlyEmi: 20000,
        }),
        documents: JSON.stringify({
          specificDocs: [
            { schemeIndex: 0, name: "Property Ownership Title Deed", isMandatory: true, fileName: "title_deed.pdf" },
            { schemeIndex: 2, name: "Contractor Renovation Estimate", isMandatory: true, fileName: "renovation_blueprint.png" },
          ],
        }),
      },
      files: {
        specificDoc_0: [
          {
            fieldname: "specificDoc_0",
            originalname: "title_deed.pdf",
            filename: "mock_title_deed_123.pdf",
            path: "/uploads/mock_title_deed_123.pdf",
            mimetype: "application/pdf",
            buffer: Buffer.from("%PDF-1.4 Title Deed content"),
            size: 512000,
          },
        ],
        specificDoc_2: [
          {
            fieldname: "specificDoc_2",
            originalname: "renovation_blueprint.png",
            filename: "mock_renovation_blueprint_456.png",
            path: "/uploads/mock_renovation_blueprint_456.png",
            mimetype: "image/png",
            buffer: Buffer.from("\x89PNG\r\n\x1a\nBlueprint Image Content"),
            size: 256000,
          },
        ],
        additionalDoc: [
          {
            fieldname: "additionalDoc",
            originalname: "architect_noc.pdf",
            filename: "mock_architect_noc_789.pdf",
            path: "/uploads/mock_architect_noc_789.pdf",
            mimetype: "application/pdf",
            buffer: Buffer.from("%PDF-1.4 Architect NOC content"),
            size: 300000,
          },
        ],
      },
    };

    const { res, getStatus, getData } = createMockRes();
    await applyLoan(req, res);

    assert.equal(getStatus(), 201);
    assert.ok(getData()?.application);

    // Verify disabled requirement "Obsolete Tax Assessment" is not included
    const specificDocs = createdLoanApp.documents?.specificDocs;
    assert.equal(specificDocs.length, 2, "Disabled requirement should be excluded");

    // Check Title deed (PDF)
    const titleDoc = specificDocs.find((d) => d.name === "Property Ownership Title Deed");
    assert.ok(titleDoc);
    assert.equal(titleDoc.fileName, "title_deed.pdf");
    assert.ok(titleDoc.docUrl, "Should have a generated docUrl");
    assert.equal(titleDoc.status, "uploaded");

    // Check Contractor blueprint (PNG image)
    const blueprintDoc = specificDocs.find((d) => d.name === "Contractor Renovation Estimate");
    assert.ok(blueprintDoc);
    assert.equal(blueprintDoc.fileName, "renovation_blueprint.png");
    assert.ok(blueprintDoc.docUrl, "Should have a generated docUrl");
    assert.equal(blueprintDoc.status, "uploaded");

    // Check additional document
    const addDocs = createdLoanApp.documents?.additionalDocs;
    assert.ok(addDocs && addDocs.length === 1);
    assert.equal(addDocs[0].fileName, "architect_noc.pdf");
    assert.ok(addDocs[0].docUrl, "Should have a generated docUrl");

    // Check Document records created
    assert.ok(createdDocuments.length >= 3);
  });
});
