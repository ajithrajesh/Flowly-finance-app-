import mongoose from "mongoose";

const loanProductSchema = new mongoose.Schema(
  {
    productName: {
      type: String,
      required: true,
      trim: true,
    },
    loanType: {
      type: String,
      enum: ["Personal", "Business", "Education", "Emergency", "Vehicle"],
      default: "Personal",
    },
    minAmount: { type: Number, required: true },
    maxAmount: { type: Number, required: true },
    interestRate: { type: Number, required: true },
    interestType: {
      type: String,
      enum: ["diminishing", "flat"],
      default: "diminishing",
    },
    minTenure: { type: Number, default: 6 },
    maxTenure: { type: Number, default: 36 },
    tenure: { type: Number, default: 12 },
    description: { type: String, default: "" },
    badge: { type: String, default: "" },
    requiredDocuments: [
      {
        name: { type: String, required: true },
        description: { type: String, default: "" },
        isMandatory: { type: Boolean, default: true },
      },
    ],
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

export default mongoose.models.LoanProduct || mongoose.model("LoanProduct", loanProductSchema);
