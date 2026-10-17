const multer = require("multer");
const path = require("path");
const fs = require("fs");

const uploadDir = path.join(__dirname, "..", "uploads");
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const unique = Date.now() + "-" + Math.round(Math.random() * 1e9);
    const extensions = {
      "image/jpeg": ".jpg",
      "image/png": ".png",
      "image/webp": ".webp",
      "image/gif": ".gif",
    };
    cb(null, unique + (extensions[file.mimetype] || ""));
  },
});

const fileFilter = (req, file, cb) => {
  const allowedMimeTypes = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);
  const allowedExtensions = new Set([".jpeg", ".jpg", ".png", ".webp", ".gif"]);
  const ok =
    allowedMimeTypes.has(file.mimetype) &&
    allowedExtensions.has(path.extname(file.originalname).toLowerCase());
  if (ok) return cb(null, true);
  const error = new Error("Only image files (jpeg, jpg, png, webp, gif) are allowed");
  error.statusCode = 400; cb(error);
};

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 5 * 1024 * 1024, files: 1, fields: 2, parts: 3, fieldNameSize: 80, fieldSize: 4096 },
});

module.exports = upload;
