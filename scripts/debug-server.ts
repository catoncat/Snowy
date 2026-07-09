/**
 * Tiny debug server for the Snowy extension.
 *
 * Run: bun scripts/debug-server.ts
 *
 * The extension POSTs diagnostics here after each loop step.
 * Query latest with: curl localhost:9876/latest
 */

import { createServer } from "node:http";

let latest: string | null = null;
let allEntries: Array<{ ts: string; data: unknown }> = [];

const server = createServer((req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  if (req.method === "POST" && req.url === "/debug") {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
    });
    req.on("end", () => {
      try {
        const data = JSON.parse(body);
        latest = body;
        allEntries.push({ ts: new Date().toISOString(), data });
        if (allEntries.length > 100) allEntries = allEntries.slice(-100);
        console.log(`[${new Date().toISOString()}] debug beacon received (${body.length} bytes)`);
      } catch {
        console.log(`[${new Date().toISOString()}] invalid JSON received`);
      }
      res.writeHead(200);
      res.end("ok");
    });
    return;
  }

  if (req.method === "GET" && req.url === "/latest") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(latest ?? '{"status":"no data yet"}');
    return;
  }

  if (req.method === "GET" && req.url === "/all") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(allEntries, null, 2));
    return;
  }

  if (req.method === "GET" && req.url === "/") {
    res.writeHead(200, { "Content-Type": "text/plain" });
    res.end(
      "Snowy debug server running.\n\nGET /latest  — latest diagnostics\nGET /all     — all entries\nPOST /debug  — receive beacon from extension\n",
    );
    return;
  }

  res.writeHead(404);
  res.end("not found");
});

server.listen(9876, "127.0.0.1", () => {
  console.log("Snowy debug server: http://localhost:9876");
  console.log("Waiting for extension beacons on POST /debug ...");
});
