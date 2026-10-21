// Simulated Alexa+: Amazon Nova chats, answers questions and calls CareCircle MCP tools.
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { BedrockRuntimeClient, ConverseCommand } from "@aws-sdk/client-bedrock-runtime";
import { MODEL_ID } from "./bedrock.js";

const bedrock = new BedrockRuntimeClient({ region: process.env.AWS_REGION || "ap-southeast-2" });

const SYSTEM_PROMPT =
  "You are Alexa, a warm and knowledgeable assistant on a kitchen Echo device, with the CareCircle add-on enabled. " +
  "CareCircle helps a family look after a loved one: logging medicines, care notes, family alerts and daily summaries. " +
  "Use the CareCircle tools whenever they help, and keep tool confirmations to one or two short sentences. " +
  "You can also answer any other question, like a general AI assistant: explain things fully and clearly, in plain " +
  "friendly sentences, with no markdown, no bullet symbols and no emoji. " +
  "Act as a caring companion: notice worries, be kind, and remember the conversation so far. " +
  "For anything live, recent or that you are not sure about, use the live tools and never guess: search_web to search the " +
  "whole web, read_webpage to read a result in full, and the weather, time, facts and news tools. Combine several " +
  "searches if needed to give the best answer, and say which website the information came from. " +
  "If a city is needed and you don't know it, ask which city. " +
  "People may type or speak with spelling mistakes: work out what they meant and answer that, without pointing it out. " +
  "Safety rules for health: give general health information only. Never tell someone to start, stop or change a " +
  "medicine or a dose; say to check with their doctor or pharmacist. If something sounds urgent, like chest pain, " +
  "trouble breathing, a fall or confusion, tell them to call emergency services now and use alert_family.";

export async function askAlexa(userText, mcpUrl, history = []) {
  // Connect to our MCP server, exactly like Alexa+ would
  const mcp = new Client({ name: "simulated-alexa-plus", version: "1.0.0" });
  await mcp.connect(new StreamableHTTPClientTransport(new URL(mcpUrl)));

  try {
    const { tools } = await mcp.listTools();
    const toolConfig = {
      tools: tools.map((t) => {
        const { $schema, ...schema } = t.inputSchema;
        return { toolSpec: { name: t.name, description: t.description, inputSchema: { json: schema } } };
      }),
    };

    // Earlier turns of the chat, so follow-up questions make sense
    const messages = history.map((h) => ({ role: h.role, content: [{ text: h.text }] }));
    messages.push({ role: "user", content: [{ text: userText }] });
    const toolsUsed = [];
    let screen = null; // HTML from an MCP App, if a tool has one

    for (let turn = 0; turn < 8; turn++) {
      const response = await bedrock.send(
        new ConverseCommand({
          modelId: MODEL_ID,
          system: [{ text: `${SYSTEM_PROMPT} Today is ${new Date().toDateString()}.` }],
          messages,
          toolConfig,
          inferenceConfig: { maxTokens: 1500 },
        })
      );
      const message = response.output.message;
      messages.push(message);

      if (response.stopReason !== "tool_use") {
        const text = message.content.filter((c) => c.text).map((c) => c.text).join(" ");
        return { reply: text.trim(), toolsUsed, screen };
      }

      // Nova asked for one or more tools: call them on the MCP server
      const results = [];
      for (const block of message.content.filter((c) => c.toolUse)) {
        const { toolUseId, name, input } = block.toolUse;
        const result = await mcp.callTool({ name, arguments: input });
        const resultText = result.content.map((c) => c.text).join(" ");
        toolsUsed.push({ name, input, result: resultText });

        // MCP Apps: if this tool has a ui:// view, fetch it for the screen
        const uiUri = tools.find((t) => t.name === name)?._meta?.ui?.resourceUri;
        if (uiUri) screen = (await mcp.readResource({ uri: uiUri })).contents[0].text;
        results.push({ toolResult: { toolUseId, content: [{ text: resultText }] } });
      }
      messages.push({ role: "user", content: results });
    }
    return { reply: "Sorry, I couldn't finish that. Please try again.", toolsUsed, screen };
  } finally {
    await mcp.close();
  }
}