const express = require("express");
const { createHomeHandler } = require("./greet");

function createApp(template) {
  const app = express();
  app.get("/", createHomeHandler(template));
  return app;
}

async function start(port = 8080) {
  const site = await Bun.file("./index.html").text();
  const app = createApp(site);
  return new Promise((resolve) => {
    const server = app.listen(port, () => {
      console.log("The webpage is live on http://localhost:8080 :)");
      resolve(server);
    });
  });
}

if (require.main === module) {
  start().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}

module.exports = { createApp, start };
