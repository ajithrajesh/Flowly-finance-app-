/**
 * seedBranchAccounts.js
 *
 * Seeds or verifies customer accounts across the three official Flowly branches:
 * 1. Kochi Main Branch (IFSC: FLOW0001001)
 * 2. Trivandrum Branch (IFSC: FLOW0001002)
 * 3. Kozhikode Branch (IFSC: FLOW0001003)
 *
 * Configures verified KYC, active status, default MPIN (1234), and starting balances
 * to test intra-branch and inter-branch transfers effortlessly.
 *
 * Usage:
 *   node seedBranchAccounts.js
 */

import "dotenv/config";
import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import connectDB from "./config/db.js";
import User from "./models/User.js";
import Account from "./models/Account.js";
import { SUPPORTED_BRANCHES } from "./utils/branchConstants.js";

const DEFAULT_MPIN = "1234";

const BRANCH_CUSTOMERS = [
  {
    name: "Ajith Kumar",
    email: "ajithsriraj@gmail.com",
    phone: "8921057876",
    branch: "Kochi Main Branch",
    ifscCode: "FLOW0001001",
    accountNumber: "5010010006",
    initialBalance: 25000,
  },
  {
    name: "Meera Nambiar",
    email: "meera.tvm@flowly.test",
    phone: "9847012345",
    branch: "Trivandrum Branch",
    ifscCode: "FLOW0001002",
    accountNumber: "5010010020",
    initialBalance: 15000,
  },
  {
    name: "Fahad Kabeer",
    email: "fahad.clt@flowly.test",
    phone: "9847054321",
    branch: "Kozhikode Branch",
    ifscCode: "FLOW0001003",
    accountNumber: "5010010030",
    initialBalance: 20000,
  },
];

async function seedBranchAccounts() {
  await connectDB();
  console.log("=== Seeding / Updating Three-Branch Customer Accounts ===");

  const mpinHash = await bcrypt.hash(DEFAULT_MPIN, 10);

  for (const c of BRANCH_CUSTOMERS) {
    let user = await User.findOne({
      $or: [{ email: c.email.toLowerCase() }, { phone: c.phone }],
    });

    if (!user) {
      user = await User.create({
        name: c.name,
        email: c.email.toLowerCase(),
        phone: c.phone,
        role: "customer",
        kycStatus: "verified",
        status: "active",
        isEmailVerified: true,
        isMpinSet: true,
        mpinHash,
        failedLoginAttempts: 0,
        lockUntil: null,
      });
      console.log(`[+] Created customer: ${c.name} (${c.email})`);
    } else {
      user.name = c.name;
      user.role = "customer";
      user.kycStatus = "verified";
      user.status = "active";
      user.isEmailVerified = true;
      user.isMpinSet = true;
      user.mpinHash = mpinHash;
      user.failedLoginAttempts = 0;
      user.lockUntil = null;
      await user.save();
      console.log(`[*] Updated customer: ${c.name} (${c.email}) with MPIN: ${DEFAULT_MPIN}`);
    }

    let account = await Account.findOne({ user: user._id });

    if (!account) {
      account = await Account.create({
        user: user._id,
        accountNumber: c.accountNumber,
        accountType: "savings",
        balance: c.initialBalance,
        branch: c.branch,
        ifscCode: c.ifscCode,
        status: "active",
      });
      console.log(`[+] Created account: ${c.accountNumber} in ${c.branch} with Balance: ₹${c.initialBalance}`);
    } else {
      account.branch = c.branch;
      account.ifscCode = c.ifscCode;
      account.status = "active";
      if ((account.balance || 0) < 5000) {
        account.balance = c.initialBalance;
      }
      await account.save();
      console.log(
        `[*] Updated account: ${account.accountNumber} in ${c.branch} (Balance: ₹${account.balance})`
      );
    }
  }

  console.log("\n=======================================================");
  console.log("Three-Branch Test Setup Complete!");
  console.log("Supported Branches:");
  SUPPORTED_BRANCHES.forEach((b) => console.log(` - ${b.name} (${b.ifscCode}) in ${b.city}`));
  console.log(`Default MPIN for all accounts: ${DEFAULT_MPIN}`);
  console.log("=======================================================\n");

  await mongoose.connection.close();
  process.exit(0);
}

seedBranchAccounts().catch((err) => {
  console.error("Seed error:", err);
  process.exit(1);
});
