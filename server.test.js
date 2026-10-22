const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const express = require("express");
const { createApp, setDemoServerHeader } = require("./server");

const TEMPLATE = "<p>Hi %%_USER_NAME%%!</p>";

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
                headers: res.headers,
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

test("middleware sets X-Powered-By and continues", () => {
  const headers = {};
  let continued = false;
  const res = {
    setHeader(name, value) {
      headers[name] = value;
    },
  };

  setDemoServerHeader({}, res, () => {
    continued = true;
  });

  assert.equal(headers["X-Powered-By"], "DemoServer");
  assert.equal(continued, true);
});

test("GET / includes DemoServer and the rendered page", async () => {
  const app = createApp(TEMPLATE);
  const response = await get(app, "/?name=Ada");

  assert.equal(response.status, 200);
  assert.equal(response.headers["x-powered-by"], "DemoServer");
  assert.equal(response.body, "<p>Hi Ada!</p>");
});

test("unknown paths also include DemoServer", async () => {
  const app = createApp(TEMPLATE);
  const response = await get(app, "/missing");

  assert.equal(response.status, 404);
  assert.equal(response.headers["x-powered-by"], "DemoServer");
});

test("middleware registered after a terminating route misses that response", async () => {
  const app = express();
  app.get("/", (req, res) => {
    res.send("home");
  });
  app.use(setDemoServerHeader);

  const response = await get(app, "/");

  assert.equal(response.status, 200);
  assert.equal(response.body, "home");
  assert.equal(response.headers["x-powered-by"], "Express");
});
