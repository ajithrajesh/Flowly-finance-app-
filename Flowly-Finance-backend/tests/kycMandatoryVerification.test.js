import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import User from "../models/User.js";
import KYC from "../models/KYC.js";
import Document from "../models/Document.js";
import Account from "../models/Account.js";
import VideoKycSession from "../models/VideoKycSession.js";
import Notification from "../models/Notification.js";
import {
  approveKyc,
  rejectKyc,
  getKycQueue,
  getKycDetail,
  getKYCStatus,
  updateKycVideoChecklist,
} from "../controllers/kycController.js";
import { updateChecklist } from "../controllers/videoKycController.js";
import { uploadKycFile } from "../services/cloudinaryService.js";

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

describe("Mandatory KYC Checks and Verification Flow", () => {
  const originals = {};

  beforeEach(() => {
    originals.userFind = User.find;
    originals.userFindOne = User.findOne;
    originals.userFindById = User.findById;
    originals.userFindByIdAndUpdate = User.findByIdAndUpdate;

    originals.kycFind = KYC.find;
    originals.kycFindOne = KYC.findOne;
    originals.kycFindById = KYC.findById;
    originals.kycCountDocuments = KYC.countDocuments;

    originals.docFind = Document.find;
    originals.docCreate = Document.create;
    originals.docUpdateMany = Document.updateMany;

    originals.accountFind = Account.find;
    originals.accountFindOne = Account.findOne;
    originals.accountCreate = Account.create;

    originals.sessionFindById = VideoKycSession.findById;
    originals.sessionFindOne = VideoKycSession.findOne;
    originals.sessionCreate = VideoKycSession.create;
    originals.kycFindByIdAndUpdate = KYC.findByIdAndUpdate;

    originals.notifCreate = Notification.create;
    originals.notifCount = Notification.countDocuments;
    originals.notifInsertMany = Notification.insertMany;
    originals.notifSave = Notification.prototype.save;

    // Default safe stubs
    User.find = () => mockQuery([]);
    User.findOne = () => mockQuery(null);
    User.findById = (id) => mockQuery({ _id: id, name: "Customer", role: "customer", email: "cust@example.com" });
    User.findByIdAndUpdate = async () => ({ _id: new mongoose.Types.ObjectId() });

    Account.find = () => mockQuery([]);
    Account.findOne = () => mockQuery(null);
    Account.create = async (d) => ({ _id: new mongoose.Types.ObjectId(), accountNumber: "5010010001", ...d });

    Notification.create = async (d) => ({ _id: new mongoose.Types.ObjectId(), ...d });
    Notification.countDocuments = async () => 0;
    Notification.insertMany = async () => [];
    Notification.prototype.save = async function () {
      return this;
    };
  });

  afterEach(() => {
    User.find = originals.userFind;
    User.findOne = originals.userFindOne;
    User.findById = originals.userFindById;
    User.findByIdAndUpdate = originals.userFindByIdAndUpdate;

    KYC.find = originals.kycFind;
    KYC.findOne = originals.kycFindOne;
    KYC.findById = originals.kycFindById;
    KYC.countDocuments = originals.kycCountDocuments;

    Document.find = originals.docFind;
    Document.create = originals.docCreate;
    Document.updateMany = originals.docUpdateMany;

    Account.find = originals.accountFind;
    Account.findOne = originals.accountFindOne;
    Account.create = originals.accountCreate;

    VideoKycSession.findById = originals.sessionFindById;
    VideoKycSession.findOne = originals.sessionFindOne;
    VideoKycSession.create = originals.sessionCreate;
    KYC.findByIdAndUpdate = originals.kycFindByIdAndUpdate;

    Notification.create = originals.notifCreate;
    Notification.countDocuments = originals.notifCount;
    Notification.insertMany = originals.notifInsertMany;
    Notification.prototype.save = originals.notifSave;
  });

  it("MANDATORY CHECK: prevents approval if Aadhaar/ID document is missing", async () => {
    const kycId = new mongoose.Types.ObjectId();
    const userId = new mongoose.Types.ObjectId();

    KYC.findById = () =>
      mockQuery({
        _id: kycId,
        user: userId,
        verificationStatus: "under_verification",
        idType: "aadhaar",
        idNumber: "123456789012",
        address: "123 MG Road, Kochi",
        // No aadhaarDocument or document
        panDocument: new mongoose.Types.ObjectId(),
        panUrl: "https://res.cloudinary.com/flowly/pan.png",
        selfieDocument: new mongoose.Types.ObjectId(),
        selfieUrl: "https://res.cloudinary.com/flowly/selfie.png",
        videoKycSession: null,
      });

    const { res, state } = createMockRes();
    const req = {
      params: { id: String(kycId) },
      user: { _id: new mongoose.Types.ObjectId(), role: "worker", name: "Officer" },
    };

    await approveKyc(req, res);

    assert.equal(state.statusCode, 422);
    assert.equal(state.body.success, false);
    assert.equal(state.body.missingCheck, "aadhaar_document");
    assert.match(state.body.message, /Aadhaar\/Identity document is missing/i);
  });

  it("MANDATORY CHECK: prevents approval if PAN document is missing", async () => {
    const kycId = new mongoose.Types.ObjectId();
    const userId = new mongoose.Types.ObjectId();

    KYC.findById = () =>
      mockQuery({
        _id: kycId,
        user: userId,
        verificationStatus: "under_verification",
        idType: "aadhaar",
        idNumber: "123456789012",
        address: "123 MG Road, Kochi",
        aadhaarDocument: new mongoose.Types.ObjectId(),
        aadhaarUrl: "https://res.cloudinary.com/flowly/aadhaar.png",
        // No panDocument or panUrl
        selfieDocument: new mongoose.Types.ObjectId(),
        selfieUrl: "https://res.cloudinary.com/flowly/selfie.png",
        videoKycSession: null,
      });

    const { res, state } = createMockRes();
    const req = {
      params: { id: String(kycId) },
      user: { _id: new mongoose.Types.ObjectId(), role: "worker", name: "Officer" },
    };

    await approveKyc(req, res);

    assert.equal(state.statusCode, 422);
    assert.equal(state.body.success, false);
    assert.equal(state.body.missingCheck, "pan_document");
    assert.match(state.body.message, /PAN card document is missing/i);
  });

  it("MANDATORY CHECK: prevents approval if Selfie photo is missing", async () => {
    const kycId = new mongoose.Types.ObjectId();
    const userId = new mongoose.Types.ObjectId();

    KYC.findById = () =>
      mockQuery({
        _id: kycId,
        user: userId,
        verificationStatus: "under_verification",
        idType: "aadhaar",
        idNumber: "123456789012",
        address: "123 MG Road, Kochi",
        aadhaarDocument: new mongoose.Types.ObjectId(),
        aadhaarUrl: "https://res.cloudinary.com/flowly/aadhaar.png",
        panDocument: new mongoose.Types.ObjectId(),
        panUrl: "https://res.cloudinary.com/flowly/pan.png",
        // No selfie
        selfieDocument: null,
        selfieUrl: "",
        videoKycSession: null,
      });

    const { res, state } = createMockRes();
    const req = {
      params: { id: String(kycId) },
      user: { _id: new mongoose.Types.ObjectId(), role: "worker", name: "Officer" },
    };

    await approveKyc(req, res);

    assert.equal(state.statusCode, 422);
    assert.equal(state.body.success, false);
    assert.equal(state.body.missingCheck, "selfie_photo");
    assert.match(state.body.message, /live selfie photo is missing/i);
  });

  it("MANDATORY CHECK: prevents approval if Video KYC verification is incomplete or failed", async () => {
    const kycId = new mongoose.Types.ObjectId();
    const userId = new mongoose.Types.ObjectId();
    const sessionId = new mongoose.Types.ObjectId();

    KYC.findById = () =>
      mockQuery({
        _id: kycId,
        user: userId,
        verificationStatus: "under_verification",
        idType: "aadhaar",
        idNumber: "123456789012",
        address: "123 MG Road, Kochi",
        aadhaarDocument: new mongoose.Types.ObjectId(),
        aadhaarUrl: "https://res.cloudinary.com/flowly/aadhaar.png",
        panDocument: new mongoose.Types.ObjectId(),
        panUrl: "https://res.cloudinary.com/flowly/pan.png",
        selfieDocument: new mongoose.Types.ObjectId(),
        selfieUrl: "https://res.cloudinary.com/flowly/selfie.png",
        // Session exists and call ended, but checklist was NOT ticked by officer!
        videoKycSession: {
          _id: sessionId,
          status: "completed",
          checklist: {
            faceVerified: false,
            documentVerified: false,
            livenessPassed: false,
          },
          recordingConsent: { given: true },
          recording: { url: "" },
        },
      });

    const { res, state } = createMockRes();
    const req = {
      params: { id: String(kycId) },
      user: { _id: new mongoose.Types.ObjectId(), role: "worker", name: "Officer" },
    };

    await approveKyc(req, res);

    assert.equal(state.statusCode, 422);
    assert.equal(state.body.success, false);
    assert.equal(state.body.missingCheck, "video_kyc");
    assert.match(state.body.message, /Video KYC verification is incomplete/i);
    assert.ok(Array.isArray(state.body.missing));
    assert.ok(state.body.missing.includes("Face verification"));
    assert.ok(state.body.missing.includes("Document verification"));
    assert.ok(state.body.missing.includes("Liveness check"));
  });

  it("SUCCESSFUL APPROVAL: updates KYC and all Document statuses to 'verified' when all checks pass", async () => {
    const kycId = new mongoose.Types.ObjectId();
    const userId = new mongoose.Types.ObjectId();
    const docId1 = new mongoose.Types.ObjectId();
    const docId2 = new mongoose.Types.ObjectId();
    const docId3 = new mongoose.Types.ObjectId();

    let savedKyc = null;
    let updatedDocsFilter = null;
    let updatedDocsUpdate = null;
    let updatedUserKycStatus = null;

    KYC.findById = () =>
      mockQuery({
        _id: kycId,
        user: userId,
        verificationStatus: "under_verification",
        idType: "aadhaar",
        idNumber: "123456789012",
        address: "123 MG Road, Kochi",
        aadhaarDocument: docId1,
        aadhaarUrl: "https://res.cloudinary.com/flowly/aadhaar.png",
        panDocument: docId2,
        panUrl: "https://res.cloudinary.com/flowly/pan.png",
        selfieDocument: docId3,
        selfieUrl: "https://res.cloudinary.com/flowly/selfie.png",
        videoKycSession: {
          _id: new mongoose.Types.ObjectId(),
          status: "completed",
          checklist: {
            faceVerified: true,
            documentVerified: true,
            livenessPassed: true,
          },
          recordingConsent: { given: true },
          recording: { url: "https://res.cloudinary.com/flowly/video.mp4" },
        },
        save: async function () {
          savedKyc = this;
          return this;
        },
      });

    Document.updateMany = async (filter, update) => {
      updatedDocsFilter = filter;
      updatedDocsUpdate = update;
      return { modifiedCount: 3 };
    };

    User.findByIdAndUpdate = async (id, update) => {
      updatedUserKycStatus = update.kycStatus;
      return { _id: id, kycStatus: update.kycStatus };
    };

    Account.findOne = () => mockQuery(null);
    Account.create = async (accData) => ({
      _id: new mongoose.Types.ObjectId(),
      accountNumber: "100020003000",
      ...accData,
    });

    const { res, state } = createMockRes();
    const req = {
      params: { id: String(kycId) },
      user: { _id: new mongoose.Types.ObjectId(), role: "worker", name: "Officer" },
    };

    await approveKyc(req, res);

    assert.equal(state.statusCode, 200);
    assert.equal(state.body.success, true);
    assert.equal(savedKyc.verificationStatus, "verified");
    assert.equal(updatedUserKycStatus, "verified");
    assert.equal(updatedDocsUpdate.verificationStatus, "verified");
  });

  it("REJECTION: updates KYC and all Document statuses to 'rejected'", async () => {
    const kycId = new mongoose.Types.ObjectId();
    const userId = new mongoose.Types.ObjectId();
    const docId1 = new mongoose.Types.ObjectId();
    const docId2 = new mongoose.Types.ObjectId();

    let savedKyc = null;
    let updatedDocsUpdate = null;
    let updatedUserKycStatus = null;

    KYC.findById = () =>
      mockQuery({
        _id: kycId,
        user: userId,
        verificationStatus: "under_verification",
        aadhaarDocument: docId1,
        panDocument: docId2,
        save: async function () {
          savedKyc = this;
          return this;
        },
      });

    Document.updateMany = async (filter, update) => {
      updatedDocsUpdate = update;
      return { modifiedCount: 2 };
    };

    User.findByIdAndUpdate = async (id, update) => {
      updatedUserKycStatus = update.kycStatus;
      return { _id: id, kycStatus: update.kycStatus };
    };

    const { res, state } = createMockRes();
    const req = {
      params: { id: String(kycId) },
      user: { _id: new mongoose.Types.ObjectId(), role: "worker", name: "Officer" },
      body: { reason: "ID photo is blurry and unreadable" },
    };

    await rejectKyc(req, res);

    assert.equal(state.statusCode, 200);
    assert.equal(state.body.success, true);
    assert.equal(savedKyc.verificationStatus, "rejected");
    assert.equal(savedKyc.rejectionReason, "ID photo is blurry and unreadable");
    assert.equal(updatedDocsUpdate.verificationStatus, "rejected");
    assert.equal(updatedUserKycStatus, "rejected");
  });

  it("KYC QUEUE & DETAIL: enriches response with accurate videoKycVerified boolean and evaluation", async () => {
    const kycId1 = new mongoose.Types.ObjectId();
    const kycId2 = new mongoose.Types.ObjectId();

    const unverifiedRecord = {
      _id: kycId1,
      verificationStatus: "under_verification",
      videoKycSession: {
        status: "completed",
        checklist: { faceVerified: false, documentVerified: false, livenessPassed: false },
        recordingConsent: { given: true },
        recording: { url: "" },
      },
    };

    const verifiedRecord = {
      _id: kycId2,
      verificationStatus: "under_verification",
      videoKycSession: {
        status: "completed",
        checklist: { faceVerified: true, documentVerified: true, livenessPassed: true },
        recordingConsent: { given: true },
        recording: { url: "https://res.cloudinary.com/video.mp4" },
      },
    };

    KYC.find = () => mockQuery([unverifiedRecord, verifiedRecord]);
    KYC.countDocuments = async () => 2;

    const { res, state } = createMockRes();
    const req = { query: {} };

    await getKycQueue(req, res);

    assert.equal(state.statusCode, 200);
    assert.equal(state.body.data.length, 2);
    // Unverified video session:
    assert.equal(state.body.data[0].videoKycVerified, false);
    assert.equal(state.body.data[0].videoKycEvaluation.passed, false);
    // Verified video session:
    assert.equal(state.body.data[1].videoKycVerified, true);
    assert.equal(state.body.data[1].videoKycEvaluation.passed, true);
  });

  it("VIDEO KYC CHECKLIST: updateKycVideoChecklist updates worker ticks persistently and re-evaluates KYC readiness", async () => {
    const kycId = new mongoose.Types.ObjectId();
    const sessionId = new mongoose.Types.ObjectId();
    const userId = new mongoose.Types.ObjectId();

    const mockSession = {
      _id: sessionId,
      kyc: kycId,
      customer: userId,
      status: "in_progress",
      checklist: { faceVerified: false, documentVerified: false, livenessPassed: false, remarks: "" },
      recordingConsent: { given: true },
      recording: { url: "" },
      save: async function () {
        return this;
      },
    };

    const mockKyc = {
      _id: kycId,
      user: userId,
      verificationStatus: "under_verification",
      videoKycSession: sessionId,
      videoKycStatus: "in_progress",
      save: async function () {
        return this;
      },
    };

    KYC.findById = () => mockQuery(mockKyc);
    VideoKycSession.findById = async () => mockSession;

    const { res, state } = createMockRes();
    const req = {
      params: { id: String(kycId) },
      user: { _id: new mongoose.Types.ObjectId(), role: "worker", name: "Worker 1" },
      body: {
        faceVerified: true,
        documentVerified: true,
        livenessPassed: true,
        remarks: "Customer face and physical PAN confirmed on camera",
        recordingUrl: "https://res.cloudinary.com/flowly/video.mp4",
        recordingConsentGiven: true,
      },
    };

    await updateKycVideoChecklist(req, res);

    assert.equal(state.statusCode, 200);
    assert.equal(state.body.success, true);
    assert.equal(mockSession.checklist.faceVerified, true);
    assert.equal(mockSession.checklist.documentVerified, true);
    assert.equal(mockSession.checklist.livenessPassed, true);
    assert.equal(mockSession.status, "completed");
    assert.equal(mockSession.recording.url, "https://res.cloudinary.com/flowly/video.mp4");
    assert.equal(state.body.data.videoKycVerified, true);
    assert.equal(state.body.data.videoKycEvaluation.passed, true);
  });

  it("VIDEO KYC CHECKLIST: updateChecklist in videoKycController saves officer ticks and syncs with KYC status", async () => {
    const sessionId = new mongoose.Types.ObjectId();
    const kycId = new mongoose.Types.ObjectId();
    const officerId = new mongoose.Types.ObjectId();

    const mockSession = {
      _id: sessionId,
      kyc: kycId,
      officer: officerId,
      status: "completed",
      checklist: { faceVerified: false, documentVerified: false, livenessPassed: false, remarks: "" },
      recordingConsent: { given: true },
      recording: { url: "https://res.cloudinary.com/flowly/session.mp4" },
      save: async function () {
        return this;
      },
    };

    VideoKycSession.findById = async () => mockSession;
    KYC.findByIdAndUpdate = async () => ({});

    const { res, state } = createMockRes();
    const req = {
      params: { id: String(sessionId) },
      user: { _id: officerId, role: "worker" },
      body: {
        faceVerified: true,
        documentVerified: true,
        livenessPassed: true,
        remarks: "All checks verified by worker",
      },
    };

    await updateChecklist(req, res);

    assert.equal(state.statusCode, 200);
    assert.equal(state.body.success, true);
    assert.equal(mockSession.checklist.faceVerified, true);
    assert.equal(mockSession.checklist.documentVerified, true);
    assert.equal(mockSession.checklist.livenessPassed, true);
    assert.equal(state.body.readyForDecision, true);
    assert.equal(state.body.missing.length, 0);
  });
});
