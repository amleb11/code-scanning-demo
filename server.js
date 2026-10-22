const express = require("express");
const { execFile } = require("child_process");

const HOST_MAX_LENGTH = 253;
const HOST_PATTERN =
  /^(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)(?:\.(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?))*$/;

function isSafeHost(host) {
  return (
    typeof host === "string" &&
    host.length > 0 &&
    host.length <= HOST_MAX_LENGTH &&
    HOST_PATTERN.test(host)
  );
}

function createPingHandler(execFileImpl = execFile) {
  return function pingHandler(req, res) {
    const host = req.query && req.query.host;
    if (!isSafeHost(host)) {
      res.status(400).send("Invalid host");
      return;
    }

    execFileImpl(
      "ping",
      ["-c", "1", "--", host],
      { timeout: 5000 },
      (err, stdout) => {
        if (err) {
          res.status(502).send("Ping failed");
          return;
        }
        res.status(200).send(stdout ?? "");
      }
    );
  };
}

function createDebugHandler(logError = console.error) {
  return function debugHandler(_req, res) {
    try {
      throw new Error("Database connection failed: internal-db-01");
    } catch (err) {
      logError(err);
      res.status(500).send("Internal server error");
    }
  };
}

function createApp({
  site = "",
  execFileImpl = execFile,
  logError = console.error,
} = {}) {
  const app = express();

  app.get("/", async (req, res) => {
    const greet = site.replace("%%_USER_NAME%%", req.query.name);
    res.send(greet);
  });

  app.get("/ping", createPingHandler(execFileImpl));
  app.get("/debug", createDebugHandler(logError));

  return app;
}

module.exports = {
  isSafeHost,
  createPingHandler,
  createDebugHandler,
  createApp,
};
