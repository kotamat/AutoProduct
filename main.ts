import { parse } from "https://deno.land/std@0.184.0/toml/mod.ts";

import * as path from "https://deno.land/std/path/mod.ts";
import { chatGPT, chatGPTWithMessages } from "./chatgpt.ts";

function getUserInput(): { title: string; specs: string[]; language: string } {
  const title = prompt("プロダクトのタイトルを入力してください: ") || "";
  const specs =
    prompt("プロダクトの仕様をコンマ区切りで入力してください: ")?.split(",") ||
    [];
  const language =
    prompt("言語を入力してください (TypeScript, Python, etc...): ") || "";
  return { title, specs, language };
}

type ParsedTOML = {
  script: { compile: string };
  code: { filepath: string; summary: string; interface: string; code?: string; diff?: string }[];
};
type Input = { title: string; specs: string[]; language: string };
type BaseContext = { filepath: string; summary: string, interface: string };

function createGPTPrompt(
  input: Input,
  baseContexts: BaseContext[],
): string {
  return `
Generate code for ${input.title} in ${input.language}.
specs is below
${input.specs.join("\n")}

The files already generated are:
${baseContexts
      .map(
        (context) =>
          `${context.filepath} summary: ${context.summary} interface: ${context.interface}`,
      )
      .join("\n")
    }

Output format should be TOML which has
- array of code and filepath, summary, code element in each code
- script to compile

The example format is below:
Pattern 1: new file
[script]
compile = "deno compile --output ./dist/main ./main.ts"
[[code]]
filepath = "./app/sample.ts"
summary = "This exports a stdout function that prints 'Hello, World!' to the console."
interface = "export function stdout(): void;"
code = """
export function stdout(): void {
  console.log('Hello, World!');
}
"""

Pattern 2: update file
// skip compile script
[[code]]
filepath = "./utils/sample.ts"
summary = "This exports a stdout function that prints 'Hello, World!' to the console."
interface = "export function stdout(): void;"
diff = """
+ console.log('Hello, World!');
- console.log('Hello, World!');
"""
`;
}

async function compileScript(compileCommand: string): Promise<{ success: boolean, stderr: string }> {
  const p = Deno.run({
    cmd: compileCommand.split(" "),
    stderr: "piped", // 編集: stderrを取得するように設定
  });

  const status = await p.status();
  const stderr = new TextDecoder().decode(await p.stderrOutput()); // 編集: stderrをデコード

  if (!status.success) {
    console.log("コンパイルに失敗しました。");
    return { success: false, stderr };
  }
  return { success: true, stderr }
}

async function saveCodeFilesAndCompile(parsed: ParsedTOML, userInput: Input, baseContexts: BaseContext[]): Promise<void> {
  let compileSuccess = false;

  while (!compileSuccess) {
    await saveCodeFiles(parsed);

    if (parsed.script.compile) {
      // run compile script
      const { success, stderr } = await compileScript(parsed.script.compile);

      if (!success) {
        // 編集: コンパイルが失敗した場合、ChatGPTにエラー修正を依頼
        const newCode = await chatGPTWithMessages([
          {
            role: "assistant",
            content: createGPTPrompt(userInput, baseContexts),
          },
          {
            role: "user",
            content: `以下エラーを修正するOutput formatのtomlを出力してください\n${stderr}`,
          },
        ]);

        console.log(newCode);

        const newParsed = parse(newCode) as ParsedTOML;
        Object.assign(parsed, newParsed);
      }
    } else {
      compileSuccess = true; // コンパイルスクリプトがなければ、ループを抜ける
    }
  }
}

async function saveCodeFiles(parsed: ParsedTOML): Promise<void> {
  for (const entry of parsed.code) {
    const distPath = entry.filepath;
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
async function generateCodeWithErrorMessage(
  prompt: string,
  errorMessage?: string,
): Promise<string> {
  if (errorMessage) {
    prompt += `\n以下のエラーを修正してください:\n${errorMessage}`;
  }

  let result = await chatGPT(prompt);
  console.log(result);

  if (result.includes("```toml")) {
    result = result.split("```toml")[1].split("```")[0];
  }

  return result;
}

async function generateCode(input: Input, baseContexts: BaseContext[]): Promise<ParsedTOML> {
  const basePrompt = createGPTPrompt(input, baseContexts);

  async function tryParse(result: string): Promise<ParsedTOML> {
    try {
      const parsed = parse(result) as ParsedTOML;
      return parsed;
    } catch (error) {
      const errorMessage = `TOMLの解析中にエラーが発生しました: ${error.message}`;
      console.log(errorMessage);

      const newResult = await generateCodeWithErrorMessage(basePrompt, errorMessage);
      return await tryParse(newResult);
    }
  }

  const initialResult = await generateCodeWithErrorMessage(basePrompt);
  return await tryParse(initialResult);
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

async function main(): Promise<void> {
  let continueGenerating = true;
  let baseContexts: BaseContext[] = [];
  const userInput = getUserInput();
  while (continueGenerating) {
    const generatedToml = await generateCode(userInput, baseContexts);
    await saveCodeFilesAndCompile(generatedToml, userInput, baseContexts); // 編集: saveCodeFilesAndCompile()を呼び出す
    continueGenerating = confirm(
      "続けてコードを生成しますか？",
    );
    userInput.specs =
      prompt("プロダクトの追加仕様をコンマ区切りで入力してください: ")?.split(
        ",",
      ) || [];
    // 編集: baseContextsに生成されたコードを追加
    baseContexts.push(
      ...generatedToml.code.map((code) => ({
        filepath: code.filepath,
        summary: code.summary,
        interface: code.interface,
      })),
    );
    // filepathが重複しているばあいは上書きする
    baseContexts = baseContexts.reverse().reduce((acc, cur) => {
      if (!acc.some((context) => context.filepath === cur.filepath)) {
        acc.push(cur);
      }
      return acc;
    }, [] as BaseContext[])
  }
}

main();
