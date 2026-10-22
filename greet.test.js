const test = require("node:test");
const assert = require("node:assert/strict");
const {
  greetingName,
  renderGreeting,
  createHomeHandler,
} = require("./greet");

const TEMPLATE = "<p>Hi %%_USER_NAME%%!</p>";

function mockRes() {
  return {
    statusCode: 200,
    body: undefined,
    send(body) {
      this.body = body;
      return this;
    },
  };
}

test("defaults a missing or empty name to Guest", () => {
  assert.equal(greetingName(undefined), "Guest");
  assert.equal(greetingName(null), "Guest");
  assert.equal(greetingName(""), "Guest");
  assert.equal(greetingName([]), "Guest");
  assert.equal(greetingName([""]), "Guest");
});

test("uses a provided name, or the first repeated name", () => {
  assert.equal(greetingName("Ada"), "Ada");
  assert.equal(greetingName(["Ada", "Grace"]), "Ada");
});

test("encodes the name and inserts it literally", () => {
  const rendered = renderGreeting(TEMPLATE, `A<b>&"'c`);
  assert.equal(
    rendered,
    "<p>Hi A&lt;b&gt;&amp;&quot;&#39;c!</p>"
  );
  assert.equal(rendered.includes("<b>"), false);
});

test("does not treat replacement patterns as syntax", () => {
  assert.equal(
    renderGreeting("Hi %%_USER_NAME%%! tail", "$&"),
    "Hi $&amp;! tail"
  );
  assert.equal(
    renderGreeting("Hi %%_USER_NAME%%! tail", "$'"),
    "Hi $&#39;! tail"
  );
});

test("replaces every placeholder", () => {
  assert.equal(
    renderGreeting("%%_USER_NAME%% and %%_USER_NAME%%", "Ada"),
    "Ada and Ada"
  );
});

test("home handler sends the rendered page", () => {
  const handler = createHomeHandler(TEMPLATE);
  const missing = mockRes();
  handler({ query: {} }, missing);
  assert.equal(missing.body, "<p>Hi Guest!</p>");

  const named = mockRes();
  handler({ query: { name: "Ada" } }, named);
  assert.equal(named.body, "<p>Hi Ada!</p>");
});
