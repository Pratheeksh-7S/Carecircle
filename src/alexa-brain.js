// Simulated Alexa+: Amazon Nova decides which CareCircle MCP tool to call.
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { BedrockRuntimeClient, ConverseCommand } from "@aws-sdk/client-bedrock-runtime";
import { MODEL_ID } from "./bedrock.js";

const bedrock = new BedrockRuntimeClient({ region: process.env.AWS_REGION || "ap-southeast-2" });

const SYSTEM_PROMPT =
  "You are Alexa, a warm voice assistant on a kitchen Echo device, with the CareCircle add-on enabled. " +
  "CareCircle helps a family look after their elderly mother. Use the CareCircle tools whenever they help. " +
  "Answer in one or two short spoken sentences. No lists, no markdown, no emoji.";

export async function askAlexa(userText, mcpUrl) {
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

    const messages = [{ role: "user", content: [{ text: userText }] }];
    const toolsUsed = [];

    for (let turn = 0; turn < 5; turn++) {
      const response = await bedrock.send(
        new ConverseCommand({
          modelId: MODEL_ID,
          system: [{ text: SYSTEM_PROMPT }],
          messages,
          toolConfig,
          inferenceConfig: { maxTokens: 400 },
        })
      );
      const message = response.output.message;
      messages.push(message);

      if (response.stopReason !== "tool_use") {
        const text = message.content.filter((c) => c.text).map((c) => c.text).join(" ");
        return { reply: text.trim(), toolsUsed };
      }

      // Nova asked for one or more tools: call them on the MCP server
      const results = [];
      for (const block of message.content.filter((c) => c.toolUse)) {
        const { toolUseId, name, input } = block.toolUse;
        const result = await mcp.callTool({ name, arguments: input });
        const resultText = result.content.map((c) => c.text).join(" ");
        toolsUsed.push({ name, input, result: resultText });
        results.push({ toolResult: { toolUseId, content: [{ text: resultText }] } });
      }
      messages.push({ role: "user", content: results });
    }
    return { reply: "Sorry, I couldn't finish that. Please try again.", toolsUsed };
  } finally {
    await mcp.close();
  }
}