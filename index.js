const express = require("express");
const { createPingHandler } = require("./ping");

const app = express();

const site = await Bun.file("./index.html").text();

app.get("/", async (req, res) => {
  let greet = site.replace("%%_USER_NAME%%", req.query.name);
  res.send(greet);
});

app.get("/ping", createPingHandler());

app.listen(8080, () => {
  console.log("The webpage is live on http://localhost:8080 :)");
});
