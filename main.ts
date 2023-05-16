import { parse } from "https://deno.land/std@0.184.0/toml/mod.ts";

import * as path from "https://deno.land/std/path/mod.ts";
import { chatGPT } from "./chatgpt.ts";

async function getUserInput(): Promise<
  { title: string; specs: string[]; language: string }
> {
  const title = prompt("プロダクトのタイトルを入力してください: ") || "";
  const specs =
    prompt("プロダクトの仕様をコンマ区切りで入力してください: ")?.split(",") ||
    [];
  const language =
    prompt("言語を入力してください (TypeScript, Python, etc...): ") || "";
  return { title, specs, language };
}

type ParsedTOML = {
  code: { filepath: string; summary: string; code?: string; diff?: string }[];
};
type Input = { title: string; specs: string[]; language: string };
type BaseContext = { filepath: string; summary: string };

async function generateCode(
  input: Input,
  baseContexts: BaseContext[],
): Promise<ParsedTOML> {
  // ここでChatGPTに入力を投げる処理を実装します。
  // 今回はサンプルのため、ダミーのTOMLテキストを返します。
  const prompt = `
Generate code for ${input.title} in ${input.language}.
specs is below
${input.specs.join("\n")}

The files already generated are:
${
    baseContexts.map((context) => `${context.filepath}: ${context.summary}`)
      .join("\n")
  }

Output format should be TOML which has array of code and filepath, summary, code element in each code

The example format is below:
Pattern 1: new file
[[code]]
filepath = "/path/to/sample.ts"
summary = "This exports a stdout function that prints 'Hello, World!' to the console."
code = """
console.log('Hello, World!');
"""

Pattern 2: update file
[[code]]
filepath = "/path/to/sample.ts"
summary = "This exports a stdout function that prints 'Hello, World!' to the console."
diff = """
+ console.log('Hello, World!');
- console.log('Hello, World!');
"""
`;
  const result = await chatGPT(prompt);
  console.log(result);

  const parsed = parse(result) as ParsedTOML;
  return parsed;
}

function applyDiff(originalContent: string, diff: string): string {
  const originalLines = originalContent.split("\n");
  const diffLines = diff.split("\n");

  for (const diffLine of diffLines) {
    const operation = diffLine[0];
    const content = diffLine.slice(1);

    if (operation === "+") {
      originalLines.push(content);
    } else if (operation === "-") {
      const index = originalLines.indexOf(content);
      if (index !== -1) {
        originalLines.splice(index, 1);
      }
    }
  }

  return originalLines.join("\n");
}
async function ensureDir(dirPath: string): Promise<void> {
  try {
    await Deno.mkdir(dirPath, { recursive: true });
  } catch (error) {
    if (error instanceof Deno.errors.AlreadyExists) {
      // ディレクトリが既に存在する場合は何もしません。
    } else {
      throw error;
    }
  }
}

async function saveCodeFiles(parsed: ParsedTOML): Promise<void> {
  for (const entry of parsed.code) {
    const distPath = path.join("./", "dist", entry.filepath);
    const dirPath = path.dirname(distPath);

    // ディレクトリが存在しない場合は作成します。
    await ensureDir(dirPath);
    if (entry.code) {
      await Deno.writeTextFile(distPath, entry.code);
      console.log(`ファイルが生成されました: ${entry.filepath}`);
    } else if (entry.diff) {
      const currentContent = await Deno.readTextFile(distPath);
      const updatedContent = applyDiff(currentContent, entry.diff);
      await Deno.writeTextFile(distPath, updatedContent);
      console.log(`ファイルが更新されました: ${entry.filepath}`);
    }
  }
}

async function main(): Promise<void> {
  let continueGenerating = true;
  const baseContexts = [];
  const userInput = await getUserInput();
  while (continueGenerating) {
    const generatedToml = await generateCode(userInput, baseContexts);
    await saveCodeFiles(generatedToml);
    continueGenerating = await confirm(
      "続けてコードを生成しますか？ (yes/no): ",
    );
    userInput.specs =
      prompt("プロダクトの追加仕様をコンマ区切りで入力してください: ")?.split(
        ",",
      ) || [];
  }
}

main();
