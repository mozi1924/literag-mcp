import fs from "node:fs/promises";
import path from "node:path";

const MARKDOWN_EXTENSIONS = new Set([".md", ".mdx"]);
const IGNORED_ENTRY_NAMES = new Set(["__MACOSX"]);

function shouldIgnoreEntryName(name: string): boolean {
  return name.startsWith(".") || IGNORED_ENTRY_NAMES.has(name);
}

export function toPosixRelative(rootPath: string, absPath: string): string {
  const rel = path.relative(rootPath, absPath);
  return rel.split(path.sep).join("/");
}

export async function collectMarkdownFiles(rootPath: string): Promise<string[]> {
  const out: string[] = [];

  const stat = await fs.stat(rootPath).catch(() => null);
  if (!stat || !stat.isDirectory()) {
    return out;
  }

  async function walk(current: string): Promise<void> {
    const entries = await fs.readdir(current, { withFileTypes: true });
    for (const entry of entries) {
      if (shouldIgnoreEntryName(entry.name)) {
        continue;
      }
      const nextPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        await walk(nextPath);
        continue;
      }
      if (entry.isFile() && MARKDOWN_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) {
        out.push(nextPath);
      }
    }
  }

  await walk(rootPath);
  out.sort();
  return out;
}
