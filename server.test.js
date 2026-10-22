const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const {
  isSafeHost,
  createPingHandler,
  createDebugHandler,
  createApp,
} = require("./server");

function mockRes() {
  return {
    statusCode: 200,
    body: undefined,
    status(code) {
      this.statusCode = code;
      return this;
    },
    send(body) {
      this.body = body;
      return this;
    },
  };
}

function get(app, path) {
  return new Promise((resolve, reject) => {
    const server = http.createServer(app);
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      http
        .get({ hostname: "127.0.0.1", port, path }, (res) => {
          const chunks = [];
          res.on("data", (chunk) => chunks.push(chunk));
          res.on("end", () => {
            server.close(() =>
              resolve({
                status: res.statusCode,
                body: Buffer.concat(chunks).toString(),
              })
            );
          });
        })
        .on("error", (err) => {
          server.close(() => reject(err));
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

test("passes a validated host as one argument", () => {
  let captured;
  const handler = createPingHandler((command, args, options) => {
    captured = { command, args, options };
  });

  handler({ query: { host: "example.com" } }, mockRes());

  assert.equal(captured.command, "ping");
  assert.deepEqual(captured.args, ["-c", "1", "--", "example.com"]);
  assert.equal(captured.options.timeout, 5000);
  assert.equal(
    captured.args.some((arg) => /[;&|`$]/.test(arg)),
    false
  );
});

test("returns ping output", () => {
  const handler = createPingHandler((_command, _args, _options, callback) => {
    callback(null, "pong\n");
  });
  const res = mockRes();

  handler({ query: { host: "example.com" } }, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body, "pong\n");
});

test("responds when ping fails or stdout is empty", () => {
  const failing = createPingHandler((_command, _args, _options, callback) => {
    callback(new Error("ping failed"), "");
  });
  const failed = mockRes();
  assert.doesNotThrow(() =>
    failing({ query: { host: "example.com" } }, failed)
  );
  assert.equal(failed.statusCode, 502);
  assert.equal(failed.body, "Ping failed");

  const empty = createPingHandler((_command, _args, _options, callback) => {
    callback(null, "");
  });
  const emptyRes = mockRes();
  assert.doesNotThrow(() =>
    empty({ query: { host: "example.com" } }, emptyRes)
  );
  assert.equal(emptyRes.statusCode, 200);
  assert.equal(emptyRes.body, "");
});

test("debug logs the failure and returns a generic error", () => {
  let logged;
  const handler = createDebugHandler((err) => {
    logged = err;
  });
  const res = mockRes();

  handler({}, res);

  assert.equal(res.statusCode, 500);
  assert.equal(res.body, "Internal server error");
  assert.equal(res.body.includes("internal-db-01"), false);
  assert.ok(logged instanceof Error);
  assert.match(logged.message, /internal-db-01/);
});

test("GET / still renders the page template", async () => {
  const app = createApp({
    site: "<p>Hi %%_USER_NAME%%!</p>",
    execFileImpl() {
      throw new Error("ping should not run");
    },
  });
  const response = await get(app, "/?name=Ada");

  assert.equal(response.status, 200);
  assert.equal(response.body, "<p>Hi Ada!</p>");
});

test("HTTP /ping rejects an unsafe host without running ping", async () => {
  let called = false;
  const app = createApp({
    site: "",
    execFileImpl() {
      called = true;
    },
  });
  const response = await get(app, "/ping?host=bad%20host");

  assert.equal(called, false);
  assert.equal(response.status, 400);
  assert.equal(response.body, "Invalid host");
});

test("HTTP /debug does not disclose the stack", async () => {
  const logged = [];
  const app = createApp({
    site: "",
    logError(err) {
      logged.push(err);
    },
  });
  const response = await get(app, "/debug");

  assert.equal(response.status, 500);
  assert.equal(response.body, "Internal server error");
  assert.equal(response.body.includes("at "), false);
  assert.equal(logged.length, 1);
});
