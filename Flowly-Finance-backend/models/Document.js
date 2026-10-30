import mongoose from "mongoose";

const documentSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    documentType: {
      type: String,
      enum: [
        "aadhaar",
        "pan",
        "selfie",
        "salary_slip",
        "bank_statement",
        "tax_return",
        "business_proof",
        "address_proof",
        "vehicle_quotation",
        "admission_letter",
        "loan_document",
        "passport",
        "voter_id",
        "identity_proof",
        "document",
        "other",
      ],
      required: true,
    },

    // Cloudinary (signed) URL of the stored file
    fileUrl: {
      type: String,
      required: true,
    },

    // Cloudinary details - needed to delete/re-sign the file later
    publicId: {
      type: String,
    },

    resourceType: {
      type: String,
      default: "image",
    },

    storageProvider: {
      type: String,
      enum: ["cloudinary", "local", "external"],
      default: "cloudinary",
    },

    verificationStatus: {
      type: String,
      enum: ["pending", "under_verification", "verified", "rejected"],
      default: "pending",
    },
  },
  {
    timestamps: { createdAt: "uploadedAt", updatedAt: false },
  },
);

export default mongoose.model("Document", documentSchema);