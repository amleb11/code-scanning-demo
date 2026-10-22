function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function greetingName(queryName) {
  const raw = Array.isArray(queryName) ? queryName[0] : queryName;
  if (typeof raw !== "string" || raw.length === 0) {
    return "Guest";
  }
  return raw;
}

function renderGreeting(template, queryName) {
  const safeName = escapeHtml(greetingName(queryName));
  return template.replaceAll("%%_USER_NAME%%", () => safeName);
}

function createHomeHandler(template) {
  return function homeHandler(req, res) {
    const queryName = req.query && req.query.name;
    res.send(renderGreeting(template, queryName));
  };
}

module.exports = {
  escapeHtml,
  greetingName,
  renderGreeting,
  createHomeHandler,
};
