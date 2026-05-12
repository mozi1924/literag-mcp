import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import assert from "node:assert/strict";
import { collectMarkdownFiles } from "../src/utils/fs.js";

test("collectMarkdownFiles ignores hidden and __MACOSX metadata entries", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "literag-fs-ignore-"));
  await fs.mkdir(path.join(root, "__MACOSX"), { recursive: true });
  await fs.mkdir(path.join(root, ".hidden"), { recursive: true });

  await fs.writeFile(path.join(root, "good.md"), "# keep\n");
  await fs.writeFile(path.join(root, ".DS_Store"), "meta");
  await fs.writeFile(path.join(root, "._good.md"), "appledouble");
  await fs.writeFile(path.join(root, "__MACOSX", "good.md"), "# skip\n");
  await fs.writeFile(path.join(root, "__MACOSX", "._good.md"), "skip");
  await fs.writeFile(path.join(root, ".hidden", "also.md"), "# skip\n");

  const files = await collectMarkdownFiles(root);
  const rel = files.map(item => path.relative(root, item).split(path.sep).join("/"));

  assert.deepEqual(rel, ["good.md"]);
});
