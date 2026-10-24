import "dotenv/config";
import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import connectDB from "./config/db.js";
import User from "./models/User.js";

async function seedWorker() {
  await connectDB();
  console.log("Seeding Staff/Worker Account...");

  const passwordHash = await bcrypt.hash("Worker@1234", 10);

  const workers = [
    {
      name: "Arjun Nair",
      email: "staff@flowly.com",
      phone: "9876599990",
      password: passwordHash,
      role: "worker",
      status: "active",
      kycStatus: "verified",
      isEmailVerified: true,
    },
    {
      name: "Admin Staff",
      email: "admin@flowly.com",
      phone: "9876599991",
      password: passwordHash,
      role: "admin",
      status: "active",
      kycStatus: "verified",
      isEmailVerified: true,
    },
    // 4 Dedicated Support Team Workers for rotational ticket assignment
    {
      name: "Support Specialist 1",
      email: "support1@flowly.com",
      phone: "9876599981",
      password: passwordHash,
      role: "support",
      workerRole: "support",
      rotationOrder: 1,
      status: "active",
      kycStatus: "verified",
      isEmailVerified: true,
    },
    {
      name: "Support Specialist 2",
      email: "support2@flowly.com",
      phone: "9876599982",
      password: passwordHash,
      role: "support",
      workerRole: "support",
      rotationOrder: 2,
      status: "active",
      kycStatus: "verified",
      isEmailVerified: true,
    },
    {
      name: "Support Specialist 3",
      email: "support3@flowly.com",
      phone: "9876599983",
      password: passwordHash,
      role: "support",
      workerRole: "support",
      rotationOrder: 3,
      status: "active",
      kycStatus: "verified",
      isEmailVerified: true,
    },
    {
      name: "Support Specialist 4",
      email: "support4@flowly.com",
      phone: "9876599984",
      password: passwordHash,
      role: "support",
      workerRole: "support",
      rotationOrder: 4,
      status: "active",
      kycStatus: "verified",
      isEmailVerified: true,
    },
  ];

  for (const w of workers) {
    let user = await User.findOne({ $or: [{ email: w.email }, { phone: w.phone }] });
    if (!user) {
      user = await User.create(w);
      console.log(`Created ${w.role} user: ${w.email} (Password: Worker@1234)`);
    } else {
      user.role = w.role;
      user.workerRole = w.workerRole || "general";
      user.rotationOrder = w.rotationOrder || 0;
      user.status = "active";
      user.password = passwordHash;
      user.phone = w.phone;
      await user.save();
      console.log(`Updated ${w.role} user: ${w.email} (Password: Worker@1234)`);
    }
  }

  console.log("Worker seeding completed successfully!");
  await mongoose.connection.close();
  process.exit(0);
}

seedWorker().catch((err) => {
  console.error("Worker seed failed:", err);
  process.exit(1);
});
