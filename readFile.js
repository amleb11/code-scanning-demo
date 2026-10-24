const fs = require("fs");
const path = require("path");

function requestedFilename(queryFilename) {
  const raw = Array.isArray(queryFilename) ? queryFilename[0] : queryFilename;
  if (typeof raw !== "string" || raw.length === 0) {
    return "index.html";
  }
  return raw;
}

function isInsideRoot(root, resolved) {
  const relative = path.relative(root, resolved);
  return (
    relative !== "" &&
    relative !== ".." &&
    !relative.startsWith(`..${path.sep}`) &&
    !path.isAbsolute(relative)
  );
}

function resolveSafeFilePath(baseDir, filename) {
  const name = requestedFilename(filename);
  const normalized = name.replace(/\\/g, "/");

  if (
    name.includes("\0") ||
    path.isAbsolute(name) ||
    path.isAbsolute(normalized) ||
    path.basename(normalized) !== normalized
  ) {
    return null;
  }

  const root = path.resolve(baseDir);
  const resolved = path.resolve(root, normalized);
  if (!isInsideRoot(root, resolved)) {
    return null;
  }
  return resolved;
}

function createReadFileHandler(baseDir, readFileFn = fs.readFile) {
  return function readFileHandler(req, res) {
    const queryFilename = req.query && req.query.filename;
    const filePath = resolveSafeFilePath(baseDir, queryFilename);
    if (!filePath) {
      return res.status(400).send("Invalid filename");
    }

    readFileFn(filePath, "utf8", (error, data) => {
      if (error) {
        return res.status(404).send("File not found");
      }
      if (typeof res.type === "function") {
        res.type("text/plain");
      }
      res.send(data);
    });
  };
}

module.exports = {
  requestedFilename,
  resolveSafeFilePath,
  isInsideRoot,
  createReadFileHandler,
};
