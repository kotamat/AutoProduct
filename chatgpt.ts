const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
async function chatGPT(prompt: string): Promise<string> {
  const response = await fetch(
    "https://api.openai.com/v1/chat/completions",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: "gpt-4",
        // model: "gpt-3.5-turbo",
        messages: [{ "role": "user", "content": prompt }],
        max_tokens: 2000,
        temperature: 0.5,
      }),
    },
  );

  if (response.ok) {
    const json = await response.json();

    return json.choices[0].message.content.trim();
  } else {
    console.log("prompt: ", prompt);

    throw new Error(
      `ChatGPT API request failed: ${response.statusText}: ${await response
        .text()}}`,
    );
  }
}

export { chatGPT };
