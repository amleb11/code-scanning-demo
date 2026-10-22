const test = require("node:test");
const assert = require("node:assert/strict");
const { isSafeHost, createPingHandler } = require("./ping");

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
  assert.equal(captured.args.some((arg) => arg.includes(" ")), false);
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
