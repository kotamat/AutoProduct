import { parse } from "https://deno.land/std@0.184.0/toml/mod.ts";

import * as path from "https://deno.land/std/path/mod.ts";
import { chatGPT } from "./chatgpt.ts";

async function getUserInput(): Promise<{ title: string; specs: string[]; language: string }> {
  const title = prompt("プロダクトのタイトルを入力してください: ") || "";
  const specs = prompt("プロダクトの仕様をコンマ区切りで入力してください: ")?.split(",") || [];
  const language = prompt("言語を入力してください (TypeScript, Python, etc...): ") || "";
  return { title, specs, language };
}

type ParsedTOML = { code: { filepath: string; summary: string; code: string }[] }
type Input = { title: string; specs: string[]; language: string }
type BaseContext = { filepath: string, summary: string }

async function generateCode(input: Input, baseContexts: BaseContext[]): Promise<ParsedTOML> {
  // ここでChatGPTに入力を投げる処理を実装します。
  // 今回はサンプルのため、ダミーのTOMLテキストを返します。
  const prompt = `
Generate code for ${input.title} in ${input.language}.
specs is below
${input.specs.join("\n")}

The files already generated are:
${baseContexts.map((context) => `${context.filepath}: ${context.summary}`).join("\n")}

Output format should be TOML which has array of code and filepath, summary, code element in each code

The example format is below:
[[code]]
filepath = "/path/to/sample.ts"
summary = "This exports a stdout function that prints 'Hello, World!' to the console."
code = """
console.log('Hello, World!');
"""
`;
  const result = await chatGPT(prompt)
  console.log(result);

  const parsed = parse(result) as ParsedTOML;
  return parsed
}

async function saveCodeFiles(parsed: ParsedTOML): Promise<void> {
  for (const entry of parsed.code) {
    await Deno.writeTextFile(path.join("./", "dist", entry.filepath), entry.code);
    console.log(`ファイルが生成されました: ${entry.filepath}`);
  }
}

async function main(): Promise<void> {
  let continueGenerating = true;
  const baseContexts = [];
  while (continueGenerating) {
    const userInput = await getUserInput();
    const generatedToml = await generateCode(userInput, baseContexts);
    await saveCodeFiles(generatedToml);
    continueGenerating = await confirm("続けてコードを生成しますか？ (yes/no): ");
  }
}

main();