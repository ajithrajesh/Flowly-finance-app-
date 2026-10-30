import dotenv from "dotenv";
dotenv.config();
import connectDB from "./config/db.js";
import KYC from "./models/KYC.js";
import Document from "./models/Document.js";
import LoanApplication from "./models/LoanApplication.js";

const CLOUDINARY_ASSETS = {
  aadhaar: {
    url: "https://res.cloudinary.com/debacmaqq/image/authenticated/s--JXE6tlyp--/v1793038086/flowly-kyc-backend/template-seed/aadhaar-1793038085597-ypcxvk.png?_a=BAMAROTI0",
    publicId: "flowly-kyc-backend/template-seed/aadhaar-1793038085597-ypcxvk",
    resourceType: "image",
  },
  pan: {
    url: "https://res.cloudinary.com/debacmaqq/image/authenticated/s--XgT8ssEU--/v1793038029/flowly-kyc-backend/template-seed/pan-1793038028740-j3s9ke.png?_a=BAMAROTI0",
    publicId: "flowly-kyc-backend/template-seed/pan-1793038028740-j3s9ke",
    resourceType: "image",
  },
  selfie: {
    url: "https://res.cloudinary.com/debacmaqq/image/authenticated/s--JiPfpeY_--/v1793038091/flowly-kyc-backend/template-seed/selfie-1793038091146-zuwucv.png?_a=BAMAROTI0",
    publicId: "flowly-kyc-backend/template-seed/selfie-1793038091146-zuwucv",
    resourceType: "image",
  },
  salary_slip: {
    url: "https://res.cloudinary.com/debacmaqq/image/authenticated/s--39b4Nnq5--/v1793038093/flowly-kyc-backend/template-seed/salary-slip-1793038094495-kijjvb.png?_a=BAMAROTI0",
    publicId: "flowly-kyc-backend/template-seed/salary-slip-1793038094495-kijjvb",
    resourceType: "image",
  },
  bank_statement: {
    url: "https://res.cloudinary.com/debacmaqq/image/authenticated/s--ytNZYU_g--/v1793038096/flowly-kyc-backend/template-seed/bank-statement-1793038097019-sehi4l.png?_a=BAMAROTI0",
    publicId: "flowly-kyc-backend/template-seed/bank-statement-1793038097019-sehi4l",
    resourceType: "image",
  },
};

const isDummyUrl = (url) => {
  if (!url) return false;
  const str = String(url).toLowerCase();
  return (
    str.includes("example.test") ||
    str.includes("example.com") ||
    str.startsWith("/uploads/") ||
    str.includes("localhost:") ||
    str.includes("dummy") ||
    str.includes("sample_")
  );
};

async function migrate() {
  await connectDB();
  console.log("Connected to MongoDB for Cloudinary URL migration...");

  // 1. Migrate Document records
  const allDocs = await Document.find({});
  let migratedDocsCount = 0;
  for (const doc of allDocs) {
    if (isDummyUrl(doc.fileUrl)) {
      const type = doc.documentType;
      const asset = CLOUDINARY_ASSETS[type] || CLOUDINARY_ASSETS.aadhaar;
      doc.fileUrl = asset.url;
      doc.publicId = asset.publicId;
      doc.resourceType = asset.resourceType;
      doc.storageProvider = "cloudinary";
      await doc.save();
      migratedDocsCount++;
    }
  }
  console.log(`Migrated ${migratedDocsCount} Document records to Cloudinary URLs.`);

  // 2. Migrate KYC records
  const allKycs = await KYC.find({});
  let migratedKycsCount = 0;
  for (const kyc of allKycs) {
    let updated = false;

    // Check primary documentUrl
    if (isDummyUrl(kyc.documentUrl)) {
      const asset = kyc.idType === "pan" ? CLOUDINARY_ASSETS.pan : CLOUDINARY_ASSETS.aadhaar;
      kyc.documentUrl = asset.url;
      updated = true;
    }

    // Check panUrl
    if (isDummyUrl(kyc.panUrl) || (!kyc.panUrl && kyc.idType === "pan")) {
      kyc.panUrl = CLOUDINARY_ASSETS.pan.url;
      updated = true;
    }

    // Check aadhaarUrl
    if (isDummyUrl(kyc.aadhaarUrl) || (!kyc.aadhaarUrl && kyc.idType === "aadhaar")) {
      kyc.aadhaarUrl = CLOUDINARY_ASSETS.aadhaar.url;
      updated = true;
    }

    // Check selfieUrl
    if (isDummyUrl(kyc.selfieUrl)) {
      kyc.selfieUrl = CLOUDINARY_ASSETS.selfie.url;
      updated = true;
    }

    // Ensure documents are populated and linked
    if (kyc.document) {
      const doc = await Document.findById(kyc.document);
      if (doc && isDummyUrl(doc.fileUrl)) {
        const asset = kyc.idType === "pan" ? CLOUDINARY_ASSETS.pan : CLOUDINARY_ASSETS.aadhaar;
        doc.fileUrl = asset.url;
        doc.publicId = asset.publicId;
        doc.storageProvider = "cloudinary";
        await doc.save();
      }
    }

    if (updated) {
      await kyc.save();
      migratedKycsCount++;
    }
  }
  console.log(`Migrated ${migratedKycsCount} KYC records to Cloudinary URLs.`);

  // 3. Migrate LoanApplication records
  const allLoans = await LoanApplication.find({});
  let migratedLoansCount = 0;
  for (const loan of allLoans) {
    let updated = false;
    if (!loan.documents) loan.documents = {};

    if (isDummyUrl(loan.documents.panCardUrl)) {
      loan.documents.panCardUrl = CLOUDINARY_ASSETS.pan.url;
      updated = true;
    }
    if (isDummyUrl(loan.documents.aadhaarCardUrl)) {
      loan.documents.aadhaarCardUrl = CLOUDINARY_ASSETS.aadhaar.url;
      updated = true;
    }
    if (isDummyUrl(loan.documents.salarySlipUrl)) {
      loan.documents.salarySlipUrl = CLOUDINARY_ASSETS.salary_slip.url;
      updated = true;
    }
    if (isDummyUrl(loan.documents.bankStatementUrl)) {
      loan.documents.bankStatementUrl = CLOUDINARY_ASSETS.bank_statement.url;
      updated = true;
    }

    if (Array.isArray(loan.documents.specificDocs)) {
      loan.documents.specificDocs.forEach((d) => {
        if (isDummyUrl(d.docUrl)) {
          d.docUrl = CLOUDINARY_ASSETS.salary_slip.url;
          updated = true;
        }
      });
    }

    if (Array.isArray(loan.documents.additionalDocs)) {
      loan.documents.additionalDocs.forEach((d) => {
        if (isDummyUrl(d.docUrl)) {
          d.docUrl = CLOUDINARY_ASSETS.bank_statement.url;
          updated = true;
        }
      });
    }

    if (updated) {
      loan.markModified("documents");
      await loan.save();
      migratedLoansCount++;
    }
  }
  console.log(`Migrated ${migratedLoansCount} LoanApplication records to Cloudinary URLs.`);

  console.log("Migration complete!");
  process.exit(0);
}

migrate().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
