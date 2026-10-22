const { createApp } = require("./server");

const site = await Bun.file("./index.html").text();
const app = createApp(site);

app.listen(8080, () => {
  console.log("The webpage is live on http://localhost:8080 :)");
});
