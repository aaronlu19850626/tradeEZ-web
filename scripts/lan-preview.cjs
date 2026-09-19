// Bind only the explicitly configured WLAN IP; keep Next's existing localhost process.
const http = require("node:http");
const net = require("node:net");
const server = http.createServer((req, res) => {
  const port = req.url.startsWith("/api/v1/") ? 8000 : 3000;
  const upstream = http.request({ hostname: "127.0.0.1", port, path: req.url, method: req.method,
    headers: { ...req.headers, host: `127.0.0.1:${port}` } }, (response) => {
    res.writeHead(response.statusCode, response.headers); response.pipe(res);
  });
  upstream.on("error", () => { if (!res.headersSent) res.writeHead(502); res.end("TradeSync preview unavailable"); });
  req.on("aborted", () => upstream.destroy()); req.pipe(upstream);
});
server.on("upgrade", (req, socket, head) => {
  const upstream = net.connect(3000, "127.0.0.1", () => {
    const headers = { ...req.headers, host: "127.0.0.1:3000", origin: "http://127.0.0.1:3000" };
    upstream.write(`${req.method} ${req.url} HTTP/1.1\r\n${Object.entries(headers).map(([k,v]) => `${k}: ${v}`).join("\r\n")}\r\n\r\n`);
    if (head.length) upstream.write(head);
    socket.pipe(upstream).pipe(socket);
  });
  upstream.on("error", () => socket.destroy()); socket.on("error", () => upstream.destroy());
  socket.on("close", () => upstream.destroy()); upstream.on("close", () => socket.destroy());
});
server.listen(3000, "192.168.31.116", () => console.log("LAN Web: http://192.168.31.116:3000"));
