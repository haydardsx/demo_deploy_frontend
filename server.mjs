import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, normalize } from "node:path";

const root = join(process.cwd(), "dist");
const port = Number(process.env.PORT || 80);

function json(res, status, value, cache = "no-store") {
  const body = JSON.stringify(value);
  res.writeHead(status, {
    "Cache-Control": cache,
    "Content-Type": "application/json; charset=utf-8",
    "X-Content-Type-Options": "nosniff",
  });
  res.end(body);
}

function runtimeConfig() {
  const number = (name, fallback, min, max) => {
    const value = Number(process.env[name] ?? fallback);
    if (!Number.isInteger(value) || value < min || value > max) {
      throw new Error(`invalid ${name}`);
    }
    return value;
  };
  const weight1 = number("DEMO_EXPECTED_WEIGHT1", 50, 0, 10000);
  const weight2 = number("DEMO_EXPECTED_WEIGHT2", 50, 0, 10000);
  const sampleCount = number("DEMO_SAMPLE_COUNT", 1000, 1000, 10000);
  if (weight1 + weight2 <= 0) throw new Error("invalid weights");
  return {
    server1Url: process.env.DEMO_SERVER1_URL || "https://server1.example.com",
    server2Url: process.env.DEMO_SERVER2_URL || "https://server2.example.com",
    weightedUrl: process.env.DEMO_WEIGHTED_URL || "https://weighted.example.com",
    weight1,
    weight2,
    sampleCount,
    buildRevision: process.env.BUILD_REVISION || "development",
  };
}

const contentTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
};

createServer((req, res) => {
  const requestPath = new URL(req.url || "/", "http://localhost").pathname;
  if (requestPath === "/health") return json(res, 200, { status: "ok" });
  if (requestPath === "/runtime-config.json") {
    try {
      return json(res, 200, runtimeConfig());
    } catch {
      return json(res, 500, { error: "RUNTIME_CONFIG_INVALID" });
    }
  }
  const relative = requestPath === "/" ? "/index.html" : requestPath;
  const candidate = normalize(join(root, relative));
  const file = candidate.startsWith(root) && existsSync(candidate) && statSync(candidate).isFile()
    ? candidate
    : join(root, "index.html");
  res.writeHead(200, {
    "Cache-Control": relative.startsWith("/assets/") ? "public, max-age=31536000, immutable" : "no-cache",
    "Content-Type": contentTypes[extname(file)] || "application/octet-stream",
    "Referrer-Policy": "no-referrer",
    "X-Content-Type-Options": "nosniff",
  });
  createReadStream(file).on("error", () => res.destroy()).pipe(res);
}).listen(port, "0.0.0.0");
