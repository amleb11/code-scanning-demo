const express = require("express");
const { execFile } = require("child_process");
const fs = require("fs");
const path = require("path");
const { createHomeHandler } = require("./greet");

const HOST_MAX_LENGTH = 253;
const HOST_PATTERN =
  /^(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)(?:\.(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?))*$/;
const FILE_NAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;

function isSafeHost(host) {
  return (
    typeof host === "string" &&
    host.length > 0 &&
    host.length <= HOST_MAX_LENGTH &&
    HOST_PATTERN.test(host)
  );
}

function normalizeHost(queryHost) {
  if (queryHost === undefined || queryHost === "") {
    return "localhost";
  }
  return queryHost;
}

function resolveSafeFile(rootDir, filename) {
  if (typeof filename !== "string" || !FILE_NAME_PATTERN.test(filename)) {
    return null;
  }

  const root = path.resolve(rootDir);
  const resolved = path.resolve(root, filename);
  if (path.dirname(resolved) !== root || path.basename(resolved) !== filename) {
    return null;
  }
  return resolved;
}

function createPingHandler(execFileImpl = execFile) {
  return function pingHandler(req, res) {
    const host = normalizeHost(req.query && req.query.host);
    if (!isSafeHost(host)) {
      res.status(400).type("text/plain").send("Invalid host");
      return;
    }

    execFileImpl(
      "ping",
      ["-c", "1", "--", host],
      { timeout: 5000 },
      (error, stdout) => {
        if (res.headersSent) {
          return;
        }
        if (error) {
          res.status(502).type("text/plain").send("Ping failed");
          return;
        }
        res.status(200).type("text/plain").send(stdout ?? "");
      }
    );
  };
}

function createReadFileHandler({
  rootDir = __dirname,
  readFileImpl = fs.promises.readFile,
  realpathImpl = fs.promises.realpath,
} = {}) {
  return async function readFileHandler(req, res) {
    const requested = req.query ? req.query.filename : undefined;
    const filename =
      requested === undefined || requested === "" ? "index.html" : requested;
    const resolved = resolveSafeFile(rootDir, filename);
    if (!resolved) {
      res.status(400).type("text/plain").send("Invalid filename");
      return;
    }

    try {
      const realRoot = await realpathImpl(path.resolve(rootDir));
      const realPath = await realpathImpl(resolved);
      const relative = path.relative(realRoot, realPath);
      if (
        relative.length === 0 ||
        relative === ".." ||
        relative.startsWith(`..${path.sep}`) ||
        path.isAbsolute(relative) ||
        relative.includes(path.sep)
      ) {
        res.status(400).type("text/plain").send("Invalid filename");
        return;
      }
      const data = await readFileImpl(realPath, "utf8");
      res.status(200).type("text/plain").send(data);
    } catch {
      if (!res.headersSent) {
        res.status(404).type("text/plain").send("File not found");
      }
    }
  };
}

function createDebugHandler(logError = console.error) {
  return function debugHandler(_req, res) {
    try {
      throw new Error("Demo diagnostic error");
    } catch (error) {
      logError(error);
      res.status(500).type("text/plain").send("Internal server error");
    }
  };
}

function createApp({
  template = "",
  rootDir = __dirname,
  execFileImpl = execFile,
  readFileImpl = fs.promises.readFile,
  realpathImpl = fs.promises.realpath,
  logError = console.error,
} = {}) {
  const app = express();
  app.get("/", createHomeHandler(template));
  app.get("/ping", createPingHandler(execFileImpl));
  app.get(
    "/read-file",
    createReadFileHandler({ rootDir, readFileImpl, realpathImpl })
  );
  app.get("/debug", createDebugHandler(logError));
  return app;
}

async function start(port = 8080) {
  const template = await fs.promises.readFile(
    path.join(__dirname, "index.html"),
    "utf8"
  );
  const app = createApp({ template });
  return new Promise((resolve, reject) => {
    const server = app.listen(port, () => {
      console.log("The webpage is live on http://localhost:8080 :)");
      resolve(server);
    });
    server.on("error", reject);
  });
}

if (require.main === module) {
  start().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}

module.exports = {
  isSafeHost,
  resolveSafeFile,
  createPingHandler,
  createReadFileHandler,
  createDebugHandler,
  createApp,
  start,
};
