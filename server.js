const express = require("express");

function setDemoServerHeader(req, res, next) {
  res.setHeader("X-Powered-By", "DemoServer");
  next();
}

function createApp(site) {
  const app = express();

  // Must be registered before routes. A handler that sends the response
  // does not call next(), so middleware added later never runs for it.
  app.use(setDemoServerHeader);

  app.get("/", async (req, res) => {
    const greet = site.replace("%%_USER_NAME%%", req.query.name);
    res.send(greet);
  });

  return app;
}

module.exports = { createApp, setDemoServerHeader };
