// Starts the web server: the MCP endpoint, the simulated Alexa+ page and its APIs.
import express from "express";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { createMcpServer } from "./src/mcp-server.js";
import { askAlexa } from "./src/alexa-brain.js";
import { loadData, isToday } from "./src/care-data.js";

const PORT = process.env.PORT || 3000;
const MCP_URL = `http://localhost:${PORT}/mcp`;

const app = express();
app.set("trust proxy", 1); // real visitor IPs when hosted behind a proxy
app.use(express.json());
app.use(express.static("public"));

// MCP endpoint (Streamable HTTP, stateless: a fresh server per request)
app.post("/mcp", async (req, res) => {
  const server = createMcpServer();
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
  res.on("close", () => {
    transport.close();
    server.close();
  });
  await server.connect(transport);
  await transport.handleRequest(req, res, req.body);
});

// Usage limits, so a public link can't burn through the Bedrock credits
const PER_HOUR = Number(process.env.MAX_PER_HOUR || 30); // questions per visitor per hour
const PER_DAY = Number(process.env.MAX_PER_DAY || 500); // questions for everyone per day
const visitors = new Map(); // ip -> times of recent questions
let today = new Date().toDateString();
let todayCount = 0;

function overLimit(ip) {
  const now = Date.now();
  if (new Date().toDateString() !== today) {
    today = new Date().toDateString();
    todayCount = 0;
  }
  const recent = (visitors.get(ip) || []).filter((t) => now - t < 3600_000);
  if (recent.length >= PER_HOUR) return "You've asked a lot this hour. Please try again a little later.";
  if (todayCount >= PER_DAY) return "CareCircle has reached today's demo limit. Please come back tomorrow.";
  recent.push(now);
  visitors.set(ip, recent);
  todayCount++;
  return null;
}

// Simulated Alexa+: the web page sends what the user said
app.post("/api/alexa", async (req, res) => {
  const limited = overLimit(req.ip);
  if (limited) return res.status(429).json({ reply: limited, toolsUsed: [] });
  try {
    res.json(await askAlexa(req.body.text, MCP_URL, req.body.history));
  } catch (err) {
    console.error(err);
    res.status(500).json({ reply: "Sorry, something went wrong.", error: err.message, toolsUsed: [] });
  }
});

// Family dashboard data for the Echo Show style screen
app.get("/api/dashboard", (req, res) => {
  const data = loadData();
  const takenToday = data.doses.filter((d) => isToday(d.takenAt));
  res.json({
    person: data.person,
    medications: data.medications.map((m) => ({
      ...m,
      taken: takenToday.some((d) => d.medication.toLowerCase() === m.name.toLowerCase()),
    })),
    notes: data.notes.filter((n) => isToday(n.createdAt)),
    alerts: data.alerts.filter((a) => isToday(a.createdAt)),
  });
});

app.listen(PORT, () => {
  console.log(`CareCircle is running: open http://localhost:${PORT}`);
  console.log(`MCP endpoint: ${MCP_URL}`);
});