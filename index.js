
const express = require("express");
const { exec } = require("child_process");
const { createReadFileHandler } = require("./readFile");

const app = express();
app.use(express.json());

const site = await Bun.file("./index.html").text();

// Vulnerability 1: Reflected XSS
app.get("/", async (req, res) => {
  const name = req.query.name || "Guest";
  const greet = site.replace("%%_USER_NAME%%", name);
  res.send(greet);
});

// Vulnerability 2: Command injection
app.get("/ping", (req, res) => {
  const host = req.query.host || "localhost";

  exec(`ping -c 1 ${host}`, (error, stdout, stderr) => {
    if (error) {
      return res.status(500).send(stderr || error.message);
    }
    res.send(stdout);
  });
});

app.get("/read-file", createReadFileHandler(__dirname));

// Vulnerability 4: Excessive error detail disclosure
app.get("/debug", (req, res) => {
  try {
    throw new Error("Demo diagnostic error");
  } catch (error) {
    res.status(500).json({
      message: error.message,
      stack: error.stack,
      environment: process.env
    });
  }
});

app.listen(8080, () => {
  console.log("The webpage is live on http://localhost:8080 :)");
});
