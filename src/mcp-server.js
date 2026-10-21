// The CareCircle MCP server: the tools Alexa+ can call.
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { loadData, saveData, isToday, matchMedication } from "./care-data.js";
import { askNova } from "./bedrock.js";
import { buildCareView, VIEW_URI, VIEW_MIME } from "./care-view.js";
import { registerLiveTools } from "./live-tools.js";

function reply(text) {
  return { content: [{ type: "text", text }] };
}

export function createMcpServer() {
  const server = new McpServer({ name: "carecircle", version: "1.0.0" });

  server.registerTool(
    "log_medication",
    {
      title: "Log a medication",
      description:
        "Record that the care recipient just took a medication. Use when someone says they took a pill or medicine.",
      inputSchema: {
        medication: z.string().describe("Name of the medication, e.g. 'blood pressure pill'"),
      },
    },
    async ({ medication }) => {
      const data = loadData();
      medication = matchMedication(data, medication);
      data.doses.push({ medication, takenAt: new Date().toISOString() });
      saveData(data);
      return reply(`Got it. I've logged ${data.person}'s ${medication}.`);
    }
  );

  server.registerTool(
    "check_medication_status",
    {
      title: "Check today's medications",
      description:
        "Say which of today's medications have been taken and which are still missing. Use when a family member asks if meds were taken.",
      inputSchema: {},
    },
    async () => {
      const data = loadData();
      const takenToday = data.doses.filter((d) => isToday(d.takenAt)).map((d) => d.medication.toLowerCase());
      const taken = data.medications.filter((m) => takenToday.includes(m.name.toLowerCase()));
      const missing = data.medications.filter((m) => !takenToday.includes(m.name.toLowerCase()));
      if (missing.length === 0) return reply(`Yes, ${data.person} has taken all of today's medications.`);
      const takenText = taken.length ? `${data.person} has taken the ${taken.map((m) => m.name).join(" and the ")}. ` : "";
      return reply(`${takenText}Still missing: the ${missing.map((m) => `${m.time} ${m.name}`).join(" and the ")}.`);
    }
  );

  server.registerTool(
    "add_care_note",
    {
      title: "Add a care note",
      description:
        "Save a note about how the care recipient is doing, such as symptoms, mood, meals or falls.",
      inputSchema: {
        note: z.string().describe("The note to save, e.g. 'felt dizzy after lunch'"),
      },
    },
    async ({ note }) => {
      const data = loadData();
      data.notes.push({ text: note, createdAt: new Date().toISOString() });
      saveData(data);
      return reply("Okay, I've added that to the care notes. The family can see it.");
    }
  );

  server.registerTool(
    "alert_family",
    {
      title: "Alert the family",
      description:
        "Send an urgent alert to the family, for example after a fall, a missed dose or a worrying symptom.",
      inputSchema: {
        message: z.string().describe("Short alert message for the family"),
      },
    },
    async ({ message }) => {
      const data = loadData();
      data.alerts.push({ message, createdAt: new Date().toISOString() });
      saveData(data);
      return reply("I've alerted the family. Someone will check in soon.");
    }
  );

  server.registerTool(
    "get_daily_summary",
    {
      title: "Daily care summary",
      description:
        "Give a short, friendly summary of today: medications taken or missed, care notes and alerts. Use when someone asks how the day went.",
      inputSchema: {},
    },
    async () => {
      const data = loadData();
      const today = {
        person: data.person,
        medications: data.medications,
        dosesTaken: data.doses.filter((d) => isToday(d.takenAt)),
        notes: data.notes.filter((n) => isToday(n.createdAt)),
        alerts: data.alerts.filter((a) => isToday(a.createdAt)),
      };
      const summary = await askNova(
        "You are a caring assistant for a family looking after an elderly parent. " +
          "Summarize today's care data in 2 or 3 short spoken sentences. Mention anything missed or worrying first.\n\n" +
          JSON.stringify(today)
      );
      return reply(summary);
    }
  );

  // MCP App: an HTML view (ui:// resource) the host can show on a screen
  server.registerResource(
    "care-today-view",
    VIEW_URI,
    { title: "Today's care screen", description: "Medication checklist, alerts and notes for today.", mimeType: VIEW_MIME },
    async (uri) => ({ contents: [{ uri: uri.href, mimeType: VIEW_MIME, text: buildCareView() }] })
  );

  server.registerTool(
    "show_care_dashboard",
    {
      title: "Show today's care screen",
      description:
        "Show today's medication checklist, alerts and notes on the Echo Show screen. Use when someone asks to see or show the care status.",
      inputSchema: {},
      _meta: { ui: { resourceUri: VIEW_URI }, "ui/resourceUri": VIEW_URI },
    },
    async () => reply("Here's today's care screen.")
  );

  // Live tools: web search, web pages, weather, time, facts and news
  registerLiveTools(server);

  return server;
}