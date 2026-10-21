// Talks to Amazon Nova on Amazon Bedrock.
import { BedrockRuntimeClient, ConverseCommand } from "@aws-sdk/client-bedrock-runtime";

const client = new BedrockRuntimeClient({ region: process.env.AWS_REGION || "ap-southeast-2" });
export const MODEL_ID = process.env.BEDROCK_MODEL_ID || "au.amazon.nova-2-lite-v1:0";

export async function askNova(prompt) {
  const response = await client.send(
    new ConverseCommand({
      modelId: MODEL_ID,
      messages: [{ role: "user", content: [{ text: prompt }] }],
      inferenceConfig: { maxTokens: 300 },
    })
  );
  return response.output.message.content.find((c) => c.text)?.text ?? "";
}