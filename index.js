const express = require("express");
const app = express();

const site = await Bun.file("./index.html").text();

app.get("/", async (req, res) => {
  // Intentionally vulnerable: untrusted query input is inserted into HTML.
  const name = req.query.name || "Guest";
  const greet = site.replace("%%_USER_NAME%%", name);

  res.send(greet);
});

app.listen(8080, () => {
  console.log("The webpage is live on http://localhost:8080 :)");
});
