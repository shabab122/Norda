const m = require("mongoose");
module.exports = m.model("Warehouse", new m.Schema({ name: { type: String, required: true, maxlength: 80 }, code: { type: String, required: true, unique: true }, address: { type: String, maxlength: 300 }, active: { type: Boolean, default: true } }, { timestamps: true }));
