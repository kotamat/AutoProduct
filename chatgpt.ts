const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY") ?? "";
const IS_AZURE = Deno.env.get("IS_AZURE") === "true";
const BASE_URL = Deno.env.get("BASE_URL") ?? "https://api.openai.com/v1/chat/completions";

type Message = {
  role: "user" | "assistant" | "system";
  content: string;
}

async function chatGPTWithMessages(messages: Message[]): Promise<string> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  }
  if (IS_AZURE) {
    headers["api-key"] = OPENAI_API_KEY;
  } else {
    headers["Authorization"] = `Bearer ${OPENAI_API_KEY}`;
  }
  const response = await fetch(
    BASE_URL,
    {
      method: "POST",
      headers,
      body: JSON.stringify({
        messages,
        max_tokens: 2000,
        temperature: 0.5,
      }),
    },
  );

  if (response.ok) {
    const json = await response.json();

    return json.choices[0].message.content.trim();
  } else {
    console.error(`ChatGPT API request failed: ${response.statusText}: ${await response.text()}`);
    throw new Error("API request failed");
  }
}

async function chatGPT(prompt: string): Promise<string> {
  return await chatGPTWithMessages([{ role: "user", content: prompt }]);
}

export { chatGPT, chatGPTWithMessages, Message };
