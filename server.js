const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");

const root = __dirname;
const preferredPort = Number(process.env.PORT) || 3000;
const host = "127.0.0.1";

const contentTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".md": "text/markdown; charset=utf-8"
};

const server = http.createServer((req, res) => {
  const requestedPath = req.url === "/" ? "/index.html" : req.url;
  const safePath = path.normalize(requestedPath).replace(/^(\.\.[/\\])+/, "");
  const filePath = path.join(root, safePath);

  if (!filePath.startsWith(root)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  fs.readFile(filePath, (error, data) => {
    if (error) {
      res.writeHead(404);
      res.end("Not found");
      return;
    }

    const extension = path.extname(filePath);
    res.writeHead(200, {
      "Content-Type": contentTypes[extension] || "text/plain; charset=utf-8"
    });
    res.end(data);
  });
});

const startServer = (port, retriesLeft = 10) => {
  server.once("error", (error) => {
    if (error.code === "EADDRINUSE" && retriesLeft > 0 && !process.env.PORT) {
      const nextPort = port + 1;
      console.warn(`Port ${port} is in use. Trying ${nextPort}...`);
      startServer(nextPort, retriesLeft - 1);
      return;
    }
    throw error;
  });

  server.listen(port, host, () => {
    console.log(`Medi-Scan app running at http://${host}:${port}`);
  });
};

startServer(preferredPort);
