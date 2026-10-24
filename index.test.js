const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const { createApp } = require("./index");

const TEMPLATE = "<p>Hi %%_USER_NAME%%!</p><p>tail</p>";

function get(app, path) {
  return new Promise((resolve, reject) => {
    const server = app.listen(0, () => {
      const { port } = server.address();
      const req = http.get({ hostname: "127.0.0.1", port, path }, (res) => {
        const chunks = [];
        res.on("data", (chunk) => chunks.push(chunk));
        res.on("end", () => {
          server.close(() => {
            resolve({
              status: res.statusCode,
              body: Buffer.concat(chunks).toString("utf8"),
            });
          });
        });
      });
      req.on("error", (err) => {
        server.close(() => reject(err));
      });
    });
  });
}

test("GET / defaults a missing name to Guest", async () => {
  const res = await get(createApp(TEMPLATE), "/");
  assert.equal(res.status, 200);
  assert.equal(res.body, "<p>Hi Guest!</p><p>tail</p>");
});

test("GET / inserts a provided name", async () => {
  const res = await get(createApp(TEMPLATE), "/?name=Ada");
  assert.equal(res.body, "<p>Hi Ada!</p><p>tail</p>");
});

test("GET / encodes HTML in the query name", async () => {
  const payload = encodeURIComponent("</p><script>alert(1)</script>");
  const res = await get(createApp(TEMPLATE), `/?name=${payload}`);
  assert.equal(
    res.body,
    "<p>Hi &lt;/p&gt;&lt;script&gt;alert(1)&lt;/script&gt;!</p><p>tail</p>"
  );
  assert.equal(res.body.includes("<script>"), false);
});

test("GET / keeps replacement patterns literal", async () => {
  const matched = await get(
    createApp(TEMPLATE),
    `/?name=${encodeURIComponent("$&")}`
  );
  assert.equal(matched.body, "<p>Hi $&amp;!</p><p>tail</p>");

  const suffix = await get(
    createApp(TEMPLATE),
    `/?name=${encodeURIComponent("$'")}`
  );
  assert.equal(suffix.body, "<p>Hi $&#39;!</p><p>tail</p>");
});

test("GET / uses the first repeated name", async () => {
  const res = await get(
    createApp(TEMPLATE),
    "/?name=Ada&name=%3Cb%3EGrace%3C%2Fb%3E"
  );
  assert.equal(res.body, "<p>Hi Ada!</p><p>tail</p>");
});
