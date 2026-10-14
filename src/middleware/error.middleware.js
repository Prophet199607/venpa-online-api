module.exports = (err, req, res, next) => {
  // Malformed JSON body (thrown by body-parser). This is a client error, so
  // return a clear 400 instead of dumping a full stack trace to the console.
  if (err.type === "entity.parse.failed") {
    console.warn(
      `⚠️ Invalid JSON body on ${req.method} ${req.originalUrl}: ${err.message}`,
    );
    return res.status(400).json({
      message:
        "Invalid JSON in request body. Check for syntax errors such as trailing commas.",
    });
  }

  console.error(err);
  res.status(err.status || 500).json({
    message: err.message || "Internal server error",
  });
};
