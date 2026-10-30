import { describe, it } from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import User from "../models/User.js";
import Account from "../models/Account.js";
import { updateProfile, uploadAvatar, deleteAvatar } from "../controllers/authController.js";

describe("User Profile & Avatar Management", () => {
  it("should update user personal and contact details in updateProfile", async () => {
    const fakeUserId = new mongoose.Types.ObjectId();
    const mockUser = {
      _id: fakeUserId,
      name: "Original Name",
      phone: "9876543210",
      address: "123 Old Street",
      personalDetails: { occupation: "Student" },
      contactDetails: { city: "Kochi" },
      profileImage: "",
      avatar: "",
      save: async function () {
        return this;
      },
    };

    const originalFindById = User.findById;
    const originalFindOneUser = User.findOne;
    const originalFindOneAccount = Account.findOne;

    User.findById = async (id) => (String(id) === String(fakeUserId) ? mockUser : null);
    User.findOne = async () => null; // No duplicate phone
    Account.findOne = async () => ({ accountNumber: "5010010001", balance: 5000 });

    try {
      const req = {
        user: { _id: fakeUserId },
        body: {
          name: "Johnathan Doe",
          phone: "9123456780",
          address: "456 Modern Ave, Apt 4B",
          personalDetails: { occupation: "Software Engineer", gender: "Male" },
          contactDetails: { city: "Ernakulam", state: "Kerala", pincode: "682001" },
        },
      };

      let statusCode = null;
      let body = null;
      const res = {
        status: (code) => {
          statusCode = code;
          return {
            json: (data) => {
              body = data;
              return data;
            },
          };
        },
      };

      await updateProfile(req, res);

      assert.equal(statusCode, 200);
      assert.equal(body.success, true);
      assert.equal(mockUser.name, "Johnathan Doe");
      assert.equal(mockUser.phone, "9123456780");
      assert.equal(mockUser.address, "456 Modern Ave, Apt 4B");
      assert.equal(mockUser.personalDetails.occupation, "Software Engineer");
      assert.equal(mockUser.personalDetails.gender, "Male");
      assert.equal(mockUser.contactDetails.city, "Ernakulam");
    } finally {
      User.findById = originalFindById;
      User.findOne = originalFindOneUser;
      Account.findOne = originalFindOneAccount;
    }
  });

  it("should reject invalid name length less than 2 characters", async () => {
    const fakeUserId = new mongoose.Types.ObjectId();
    const mockUser = {
      _id: fakeUserId,
      name: "Original Name",
      save: async function () { return this; },
    };

    const originalFindById = User.findById;
    User.findById = async () => mockUser;

    try {
      const req = {
        user: { _id: fakeUserId },
        body: { name: "A" },
      };

      let statusCode = null;
      let body = null;
      const res = {
        status: (code) => {
          statusCode = code;
          return {
            json: (data) => {
              body = data;
              return data;
            },
          };
        },
      };

      await updateProfile(req, res);

      assert.equal(statusCode, 400);
      assert.equal(body.success, false);
      assert.match(body.message, /at least 2 characters/i);
    } finally {
      User.findById = originalFindById;
    }
  });

  it("should reject duplicate phone number registered by another user", async () => {
    const fakeUserId = new mongoose.Types.ObjectId();
    const otherUserId = new mongoose.Types.ObjectId();
    const mockUser = {
      _id: fakeUserId,
      name: "John Doe",
      phone: "9876543210",
      save: async function () { return this; },
    };

    const originalFindById = User.findById;
    const originalFindOne = User.findOne;

    User.findById = async () => mockUser;
    User.findOne = async () => ({ _id: otherUserId, phone: "9999999999" });

    try {
      const req = {
        user: { _id: fakeUserId },
        body: { phone: "9999999999" },
      };

      let statusCode = null;
      let body = null;
      const res = {
        status: (code) => {
          statusCode = code;
          return {
            json: (data) => {
              body = data;
              return data;
            },
          };
        },
      };

      await updateProfile(req, res);

      assert.equal(statusCode, 400);
      assert.equal(body.success, false);
      assert.match(body.message, /already associated/i);
    } finally {
      User.findById = originalFindById;
      User.findOne = originalFindOne;
    }
  });

  it("should handle profile avatar upload and update user profileImage/avatar fields", async () => {
    const fakeUserId = new mongoose.Types.ObjectId();
    const mockUser = {
      _id: fakeUserId,
      profileImage: "",
      avatar: "",
      save: async function () { return this; },
    };

    const originalFindById = User.findById;
    const originalFindOneAccount = Account.findOne;

    User.findById = async () => mockUser;
    Account.findOne = async () => ({ accountNumber: "5010010001" });

    try {
      const imageBuffer = Buffer.from("fake-image-bytes");
      const req = {
        user: { _id: fakeUserId },
        file: {
          mimetype: "image/png",
          buffer: imageBuffer,
        },
      };

      let statusCode = null;
      let body = null;
      const res = {
        status: (code) => {
          statusCode = code;
          return {
            json: (data) => {
              body = data;
              return data;
            },
          };
        },
      };

      await uploadAvatar(req, res);

      assert.equal(statusCode, 200);
      assert.equal(body.success, true);
      assert.ok(mockUser.profileImage);
      assert.equal(mockUser.profileImage, mockUser.avatar);
      assert.match(mockUser.profileImage, /^data:image\/png;base64,/);
    } finally {
      User.findById = originalFindById;
      Account.findOne = originalFindOneAccount;
    }
  });

  it("should remove avatar and reset user profileImage/avatar fields in deleteAvatar", async () => {
    const fakeUserId = new mongoose.Types.ObjectId();
    const mockUser = {
      _id: fakeUserId,
      profileImage: "https://example.com/photo.jpg",
      avatar: "https://example.com/photo.jpg",
      save: async function () { return this; },
    };

    const originalFindById = User.findById;
    const originalFindOneAccount = Account.findOne;

    User.findById = async () => mockUser;
    Account.findOne = async () => ({ accountNumber: "5010010001" });

    try {
      const req = {
        user: { _id: fakeUserId },
      };

      let statusCode = null;
      let body = null;
      const res = {
        status: (code) => {
          statusCode = code;
          return {
            json: (data) => {
              body = data;
              return data;
            },
          };
        },
      };

      await deleteAvatar(req, res);

      assert.equal(statusCode, 200);
      assert.equal(body.success, true);
      assert.equal(mockUser.profileImage, "");
      assert.equal(mockUser.avatar, "");
    } finally {
      User.findById = originalFindById;
      Account.findOne = originalFindOneAccount;
    }
  });
});
