const express = require("express");
const app = express();

const site = await Bun.file("./index.html").text();

app.get("/", async (req, res) => {
  let greet = site.replace("%%_USER_NAME%%", req.query.name);
  res.send(greet);
});

app.listen(8080, () => {
  console.log("The webpage is live on http://localhost:8080 :)");
});

const { exec } = require("child_process");

app.get("/ping", (req, res) => {
  exec(`ping -c 1 ${req.query.host}`, (err, stdout) => {
    res.send(stdout || err.message);
  });
});
