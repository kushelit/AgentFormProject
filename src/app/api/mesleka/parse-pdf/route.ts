import { NextRequest, NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";
import os from "os";
import { randomUUID } from "crypto";
import { spawn } from "child_process";

function runNodeScript(scriptPath: string, pdfPath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [scriptPath, pdfPath], {
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });

    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    child.on("close", (code) => {
      if (code === 0) {
        resolve(stdout);
      } else {
        reject(new Error(stderr || `Script exited with code ${code}`));
      }
    });

    child.on("error", reject);
  });
}

export async function POST(req: NextRequest) {
  let tempPath = "";

  try {
    const formData = await req.formData();
    const file = formData.get("file");

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Missing PDF file" }, { status: 400 });
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    tempPath = path.join(os.tmpdir(), `mesleka-${randomUUID()}.pdf`);
    await fs.writeFile(tempPath, buffer);

    const scriptPath = path.join(
  process.cwd(),
  "src",
  "lib",
  "documentParsers",
  "parseMeslekaPdf.mjs"
);

console.log("PDF SCRIPT PATH", scriptPath);

await fs.access(scriptPath);
    const raw = await runNodeScript(scriptPath, tempPath);
    const json = JSON.parse(raw);

    return NextResponse.json(json);
  } catch (error) {
    console.error("parse-pdf route error", error);

    const message =
      error instanceof Error ? error.message : "Unknown parse PDF error";

    return NextResponse.json({ error: message }, { status: 500 });
  } finally {
    if (tempPath) {
      try {
        await fs.unlink(tempPath);
      } catch {}
    }
  }
}