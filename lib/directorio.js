"use strict";

const fs = require("fs");
const path = require("path");

function directorioDatos() {
  const dir = process.env.DATA_DIR || path.join(__dirname, "..", "data");
  fs.mkdirSync(path.join(dir, "claves"), { recursive: true });
  return dir;
}

module.exports = { directorioDatos };
