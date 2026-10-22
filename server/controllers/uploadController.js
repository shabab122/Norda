const fs = require("fs/promises");
const path = require("path");
const Upload = require("../models/Upload");
const { detectImageMime } = require("../utils/imageSignature");

// @route POST /api/uploads (admin) - multipart/form-data field name "image"
const uploadImage = async (req, res, next) => {
  if (!req.file) return res.status(400).json({ message: "No file uploaded" });
  const filePath = "/uploads/" + req.file.filename;
  try {
    const handle = await fs.open(req.file.path, "r");
    const signature = Buffer.alloc(12);
    try {
      await handle.read(signature, 0, signature.length, 0);
    } finally {
      await handle.close();
    }
    if (detectImageMime(signature) !== req.file.mimetype) {
      await fs.unlink(req.file.path).catch(() => {});
      return res.status(400).json({ message: "Uploaded file content is not a supported image" });
    }
    const upload = await require("../services/mediaService").persistUpload(req.file, req.user);
    res.status(201).json({ _id: upload._id, url: upload.url });
  } catch (error) {
    if (!error.keepUploadFile) await fs.unlink(req.file.path).catch(() => {});
    next(error);
  }
};

module.exports = { uploadImage };
