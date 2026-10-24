const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("path");
const {
  requestedFilename,
  resolveSafeFilePath,
  isInsideRoot,
  createReadFileHandler,
} = require("./readFile");

const ROOT = path.resolve("/workspace-safe");

function mockRes() {
  return {
    statusCode: 200,
    body: undefined,
    contentType: undefined,
    status(code) {
      this.statusCode = code;
      return this;
    },
    type(value) {
      this.contentType = value;
      return this;
    },
    send(body) {
      this.body = body;
      return this;
    },
  };
}

test("defaults a missing or empty filename to index.html", () => {
  assert.equal(requestedFilename(undefined), "index.html");
  assert.equal(requestedFilename(null), "index.html");
  assert.equal(requestedFilename(""), "index.html");
  assert.equal(requestedFilename([]), "index.html");
  assert.equal(requestedFilename([""]), "index.html");
});

test("uses a provided filename, or the first repeated filename", () => {
  assert.equal(requestedFilename("index.html"), "index.html");
  assert.equal(requestedFilename(["notes.txt", "other.txt"]), "notes.txt");
});

test("resolves a bare filename inside the base directory", () => {
  assert.equal(
    resolveSafeFilePath(ROOT, "index.html"),
    path.resolve(ROOT, "index.html")
  );
  assert.equal(
    resolveSafeFilePath(ROOT, undefined),
    path.resolve(ROOT, "index.html")
  );
});

test("rejects parent-directory segments and the root itself", () => {
  assert.equal(resolveSafeFilePath(ROOT, ".."), null);
  assert.equal(resolveSafeFilePath(ROOT, "../outside.txt"), null);
  assert.equal(resolveSafeFilePath(ROOT, "nested/../../outside.txt"), null);
  assert.equal(resolveSafeFilePath(ROOT, "."), null);
});

test("rejects absolute paths and path separators", () => {
  assert.equal(resolveSafeFilePath(ROOT, "/tmp/outside.txt"), null);
  assert.equal(resolveSafeFilePath(ROOT, "subdir/file.txt"), null);
  assert.equal(resolveSafeFilePath(ROOT, "subdir\\file.txt"), null);
});

test("rejects a null byte in the filename", () => {
  assert.equal(resolveSafeFilePath(ROOT, "index.html\0.txt"), null);
});

test("containment treats sibling prefixes as outside the root", () => {
  assert.equal(isInsideRoot(ROOT, `${ROOT}-sibling/secret`), false);
  assert.equal(isInsideRoot(ROOT, path.join(ROOT, "index.html")), true);
});

test("handler sends a contained file as text/plain", (t, done) => {
  const filePath = path.resolve(ROOT, "index.html");
  const handler = createReadFileHandler(ROOT, (requested, encoding, cb) => {
    assert.equal(requested, filePath);
    assert.equal(encoding, "utf8");
    cb(null, "<html>ok</html>");
  });
  const res = mockRes();
  handler({ query: { filename: "index.html" } }, res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.contentType, "text/plain");
  assert.equal(res.body, "<html>ok</html>");
  done();
});

test("handler rejects a filename that escapes the base directory", () => {
  let readCalled = false;
  const handler = createReadFileHandler(ROOT, () => {
    readCalled = true;
  });
  const res = mockRes();
  handler({ query: { filename: "../outside.txt" } }, res);
  assert.equal(res.statusCode, 400);
  assert.equal(res.body, "Invalid filename");
  assert.equal(readCalled, false);
});

test("handler returns 404 when a contained file is missing", (t, done) => {
  const handler = createReadFileHandler(ROOT, (_requested, _encoding, cb) => {
    cb(Object.assign(new Error("ENOENT"), { code: "ENOENT" }));
  });
  const res = mockRes();
  handler({ query: {} }, res);
  assert.equal(res.statusCode, 404);
  assert.equal(res.body, "File not found");
  done();
});
