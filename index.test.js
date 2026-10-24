const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const os = require("node:os");
const path = require("node:path");
const {
  isSafeHost,
  resolveSafeFile,
  createPingHandler,
  createReadFileHandler,
  createDebugHandler,
  createApp,
  start,
} = require("./index");

const TEMPLATE = "<p>Hi %%_USER_NAME%%!</p><p>tail</p>";

function mockRes() {
  return {
    statusCode: 200,
    contentType: undefined,
    body: undefined,
    headersSent: false,
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
      this.headersSent = true;
      return this;
    },
  };
}

function get(app, requestPath) {
  return new Promise((resolve, reject) => {
    const server = app.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      const req = http.get(
        { hostname: "127.0.0.1", port, path: requestPath },
        (res) => {
          const chunks = [];
          res.on("data", (chunk) => chunks.push(chunk));
          res.on("end", () => {
            server.close(() => {
              resolve({
                status: res.statusCode,
                type: res.headers["content-type"] || "",
                body: Buffer.concat(chunks).toString("utf8"),
              });
            });
          });
        }
      );
      req.on("error", (error) => {
        server.close(() => reject(error));
      });
    });
  });
}

test("accepts hostnames and IPv4 addresses", () => {
  assert.equal(isSafeHost("example.com"), true);
  assert.equal(isSafeHost("localhost"), true);
  assert.equal(isSafeHost("a-b.com"), true);
  assert.equal(isSafeHost("127.0.0.1"), true);
});

test("rejects values that are not a single hostname", () => {
  const rejected = [
    undefined,
    null,
    "",
    " ",
    "bad host",
    "bad;host",
    "bad|host",
    "bad&host",
    "-c",
    "example.com.",
    "a..b",
    "a".repeat(254),
    ["127.0.0.1"],
  ];

  for (const host of rejected) {
    assert.equal(isSafeHost(host), false, `expected reject: ${String(host)}`);
  }
});

test("does not run ping when the host is rejected", () => {
  let called = false;
  const handler = createPingHandler(() => {
    called = true;
  });
  const res = mockRes();

  handler({ query: { host: "bad host" } }, res);

  assert.equal(called, false);
  assert.equal(res.statusCode, 400);
  assert.equal(res.body, "Invalid host");
});

test("defaults a missing host to localhost and passes it as one argument", () => {
  let captured;
  const handler = createPingHandler((command, args, options) => {
    captured = { command, args, options };
  });

  handler({ query: {} }, mockRes());

  assert.equal(captured.command, "ping");
  assert.deepEqual(captured.args, ["-c", "1", "--", "localhost"]);
  assert.equal(captured.options.timeout, 5000);
});

test("passes a validated host as one argument", () => {
  let captured;
  const handler = createPingHandler((command, args, options) => {
    captured = { command, args, options };
  });

  handler({ query: { host: "example.com" } }, mockRes());

  assert.equal(captured.command, "ping");
  assert.deepEqual(captured.args, ["-c", "1", "--", "example.com"]);
  assert.equal(
    captured.args.some((arg) => /[;&|`$<>]/.test(arg)),
    false
  );
});

test("returns ping output without a shell", () => {
  const handler = createPingHandler((_command, _args, _options, callback) => {
    callback(null, "pong\n");
  });
  const res = mockRes();

  handler({ query: { host: "example.com" } }, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.contentType, "text/plain");
  assert.equal(res.body, "pong\n");
});

test("responds with a generic error when ping fails", () => {
  const handler = createPingHandler((_command, _args, _options, callback) => {
    const error = new Error("ping: hidden command failure");
    callback(error, "", "hidden stderr");
  });
  const res = mockRes();

  assert.doesNotThrow(() => handler({ query: { host: "example.com" } }, res));
  assert.equal(res.statusCode, 502);
  assert.equal(res.body, "Ping failed");
  assert.equal(res.body.includes("hidden"), false);
});

test("accepts a plain file name inside the root", () => {
  assert.equal(resolveSafeFile("/app", "index.html"), path.resolve("/app/index.html"));
  assert.equal(
    resolveSafeFile("/app", "release..notes.txt"),
    path.resolve("/app/release..notes.txt")
  );
});

test("rejects file names that leave the application directory", () => {
  const rejected = [
    undefined,
    null,
    "..",
    "../secret",
    "foo/../../secret",
    "/etc/passwd",
    "subdir/notes.txt",
    ".env",
    "a".repeat(129),
    ["index.html"],
    "index.html\0.txt",
  ];

  for (const filename of rejected) {
    assert.equal(
      resolveSafeFile("/app", filename),
      null,
      `expected reject: ${String(filename)}`
    );
  }
});

test("does not read the filesystem when the file name is rejected", async () => {
  let called = false;
  const handler = createReadFileHandler({
    rootDir: "/app",
    realpathImpl() {
      called = true;
      throw new Error("should not touch the filesystem");
    },
    readFileImpl() {
      called = true;
      throw new Error("should not touch the filesystem");
    },
  });
  const res = mockRes();

  await handler({ query: { filename: "../secret" } }, res);

  assert.equal(called, false);
  assert.equal(res.statusCode, 400);
  assert.equal(res.body, "Invalid filename");
});

test("debug logs the failure and returns a generic error", () => {
  const previous = process.env.REVIEW_SENTINEL;
  process.env.REVIEW_SENTINEL = "super-secret-sentinel";
  let logged;
  const handler = createDebugHandler((error) => {
    logged = error;
  });
  const res = mockRes();

  try {
    handler({}, res);
  } finally {
    if (previous === undefined) {
      delete process.env.REVIEW_SENTINEL;
    } else {
      process.env.REVIEW_SENTINEL = previous;
    }
  }

  assert.equal(res.statusCode, 500);
  assert.equal(res.contentType, "text/plain");
  assert.equal(res.body, "Internal server error");
  assert.equal(res.body.includes("super-secret-sentinel"), false);
  assert.equal(res.body.includes("Demo diagnostic error"), false);
  assert.equal(JSON.stringify(res.body).includes("REVIEW_SENTINEL"), false);
  assert.ok(logged instanceof Error);
});

test("GET / defaults a missing name to Guest", async () => {
  const res = await get(createApp({ template: TEMPLATE }), "/");
  assert.equal(res.status, 200);
  assert.equal(res.body, "<p>Hi Guest!</p><p>tail</p>");
});

test("GET / inserts a provided name", async () => {
  const res = await get(createApp({ template: TEMPLATE }), "/?name=Ada");
  assert.equal(res.body, "<p>Hi Ada!</p><p>tail</p>");
});

test("GET / encodes HTML in the query name", async () => {
  const payload = encodeURIComponent("</p><script>alert(1)</script>");
  const res = await get(createApp({ template: TEMPLATE }), `/?name=${payload}`);
  assert.equal(
    res.body,
    "<p>Hi &lt;/p&gt;&lt;script&gt;alert(1)&lt;/script&gt;!</p><p>tail</p>"
  );
  assert.equal(res.body.includes("<script>"), false);
});

test("GET / keeps replacement patterns literal", async () => {
  const matched = await get(
    createApp({ template: TEMPLATE }),
    `/?name=${encodeURIComponent("$&")}`
  );
  assert.equal(matched.body, "<p>Hi $&amp;!</p><p>tail</p>");

  const suffix = await get(
    createApp({ template: TEMPLATE }),
    `/?name=${encodeURIComponent("$'")}`
  );
  assert.equal(suffix.body, "<p>Hi $&#39;!</p><p>tail</p>");
});

test("GET / uses the first repeated name", async () => {
  const res = await get(
    createApp({ template: TEMPLATE }),
    "/?name=Ada&name=%3Cb%3EGrace%3C%2Fb%3E"
  );
  assert.equal(res.body, "<p>Hi Ada!</p><p>tail</p>");
});

test("HTTP /ping rejects an unsafe host without running ping", async () => {
  let called = false;
  const app = createApp({
    template: "",
    execFileImpl() {
      called = true;
    },
  });
  const response = await get(app, "/ping?host=bad%20host");

  assert.equal(called, false);
  assert.equal(response.status, 400);
  assert.equal(response.body, "Invalid host");
});

test("HTTP /read-file serves only a file inside the root", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "read-file-"));
  const outside = path.join(os.tmpdir(), `read-file-secret-${process.pid}.txt`);
  fs.writeFileSync(path.join(root, "index.html"), "hello page");
  fs.writeFileSync(path.join(root, "notes.txt"), "notes");
  fs.writeFileSync(outside, "secret-contents");
  fs.symlinkSync(outside, path.join(root, "link.txt"));

  const app = createApp({ template: "", rootDir: root });
  try {
    const allowed = await get(app, "/read-file?filename=notes.txt");
    assert.equal(allowed.status, 200);
    assert.equal(allowed.type.includes("text/plain"), true);
    assert.equal(allowed.body, "notes");

    const fallback = await get(app, "/read-file");
    assert.equal(fallback.status, 200);
    assert.equal(fallback.body, "hello page");

    const climbed = await get(app, "/read-file?filename=..%2Fsecret.txt");
    assert.equal(climbed.status, 400);
    assert.equal(climbed.body, "Invalid filename");
    assert.equal(climbed.body.includes("secret-contents"), false);

    const linked = await get(app, "/read-file?filename=link.txt");
    assert.equal(linked.status, 400);
    assert.equal(linked.body.includes("secret-contents"), false);

    const missing = await get(app, "/read-file?filename=missing.txt");
    assert.equal(missing.status, 404);
    assert.equal(missing.body, "File not found");
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
    fs.rmSync(outside, { force: true });
  }
});

test("HTTP /debug does not disclose the stack or environment", async () => {
  const previous = process.env.REVIEW_SENTINEL;
  process.env.REVIEW_SENTINEL = "super-secret-sentinel";
  const logged = [];
  const app = createApp({
    template: "",
    logError(error) {
      logged.push(error);
    },
  });

  try {
    const response = await get(app, "/debug");
    assert.equal(response.status, 500);
    assert.equal(response.type.includes("text/plain"), true);
    assert.equal(response.body, "Internal server error");
    assert.equal(response.body.includes("super-secret-sentinel"), false);
    assert.equal(response.body.includes("Demo diagnostic error"), false);
    assert.equal(response.body.includes("at "), false);
    assert.equal(logged.length, 1);
  } finally {
    if (previous === undefined) {
      delete process.env.REVIEW_SENTINEL;
    } else {
      process.env.REVIEW_SENTINEL = previous;
    }
  }
});

test("start serves the real homepage", async () => {
  const server = await start(0);
  try {
    const { port } = server.address();
    const response = await new Promise((resolve, reject) => {
      http
        .get({ hostname: "127.0.0.1", port, path: "/?name=Ada" }, (res) => {
          const chunks = [];
          res.on("data", (chunk) => chunks.push(chunk));
          res.on("end", () => {
            resolve({
              status: res.statusCode,
              body: Buffer.concat(chunks).toString("utf8"),
            });
          });
        })
        .on("error", reject);
    });

    assert.equal(response.status, 200);
    assert.equal(response.body.includes("Hi Ada!"), true);
    assert.equal(response.body.includes("%%_USER_NAME%%"), false);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
