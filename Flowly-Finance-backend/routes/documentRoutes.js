import express from "express";
import { protect } from "../middleware/authMiddleware.js";
import { serveSecureDocument } from "../controllers/documentController.js";

const router = express.Router();

// Document preview and download routes (authenticated, ownership verified, role authorized)
router.get("/:filename", protect, serveSecureDocument);
router.get("/", protect, (req, res) => {
  return res.status(404).json({ success: false, message: "Document not specified" });
});

export default router;
