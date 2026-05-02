// client-server.js — 前端静态文件服务器（用于 WPS 加载项开发调试）
// 运行：node client-server.js
// 访问：http://localhost:8080/

const http = require("http");
const fs = require("fs");
const path = require("path");

const PORT = 8080;
const CLIENT_DIR = path.join(__dirname, "client");

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js":   "application/javascript; charset=utf-8",
  ".css":  "text/css; charset=utf-8",
  ".xml":  "application/xml; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png":  "image/png",
  ".ico":  "image/x-icon",
};

const server = http.createServer((req, res) => {
  // 允许跨域（WPS 内嵌浏览器需要）
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  // 解析请求路径
  let urlPath = req.url.split("?")[0]; // 去掉 query string
  if (urlPath === "/" || urlPath === "") urlPath = "/index.html";

  const filePath = path.join(CLIENT_DIR, urlPath);

  // 安全检查：不允许路径穿越
  if (!filePath.startsWith(CLIENT_DIR)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  fs.readFile(filePath, (err, data) => {
    if (err) {
      if (err.code === "ENOENT") {
        res.writeHead(404, { "Content-Type": "text/plain" });
        res.end("404 Not Found: " + urlPath);
      } else {
        res.writeHead(500);
        res.end("Server Error");
      }
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || "application/octet-stream";
    res.writeHead(200, { "Content-Type": contentType });
    res.end(data);
  });
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`[前端服务器] 已启动：http://localhost:${PORT}/`);
  console.log(`[前端服务器] WPS 将从此地址加载插件`);
  console.log(`[前端服务器] 按 Ctrl+C 停止`);
});
