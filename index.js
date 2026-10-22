app.get("/ping", (req, res) => {
  exec(`ping -c 1 ${req.query.host}`, (err, stdout) => {
    res.send(stdout || "Command failed");
  });
});

// Vulnerability 3: Information disclosure
app.get("/debug", (req, res) => {
  try {
    throw new Error(
      "Database connection failed: internal-db-01"
    );
  } catch (err) {
    res.status(500).send(err.stack);
  }
});

app.listen(8080, () => {
  console.log("The webpage is live on http://localhost:8080 :)");
});
