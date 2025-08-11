#!/usr/bin/env node
import { promises as fs } from 'fs';
import path from 'path';

async function ensureDir(dir) {
  try {
    await fs.mkdir(dir, { recursive: true });
  } catch {}
}

async function buildManifest({ publicDir, resultsRoot }) {
  /**
   * Manifest format:
   * {
   *   root: "results",
   *   folders: [
   *     { name: "2025-08-10", files: [ { name: "a.json", path: "/results/2025-08-10/a.json" } ] }
   *   ]
   * }
   */

  const entries = await fs.readdir(resultsRoot, { withFileTypes: true });
  const dateDirs = entries.filter((e) => e.isDirectory());

  const folders = [];
  for (const dir of dateDirs) {
    const dirPath = path.join(resultsRoot, dir.name);
    const files = await fs.readdir(dirPath, { withFileTypes: true });
    const jsonFiles = files
      .filter((f) => f.isFile() && f.name.toLowerCase().endsWith('.json'))
      .map((f) => ({
        name: f.name,
        path: `/results/${dir.name}/${f.name}`,
      }))
      .sort((a, b) => a.name.localeCompare(b.name));

    folders.push({ name: dir.name, files: jsonFiles });
  }

  // sort folders by name descending (dates newest first)
  folders.sort((a, b) => b.name.localeCompare(a.name));

  const manifest = {
    root: 'results',
    generatedAt: new Date().toISOString(),
    folders,
  };

  const outFile = path.join(publicDir, 'results-manifest.json');
  await fs.writeFile(outFile, JSON.stringify(manifest, null, 2), 'utf8');
  console.log(`Wrote manifest with ${folders.length} folder(s): ${outFile}`);
}

async function main() {
  const projectRoot = process.cwd();
  const publicDir = path.join(projectRoot, 'public');
  const resultsRoot = path.join(publicDir, 'results');

  await ensureDir(publicDir);
  await ensureDir(resultsRoot);

  const watch = process.argv.includes('--watch');
  if (!watch) {
    await buildManifest({ publicDir, resultsRoot });
    return;
  }

  await buildManifest({ publicDir, resultsRoot });
  console.log('Watching for changes in', resultsRoot);

  const { default: chokidar } = await import('chokidar');

  let timer;
  const schedule = () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      buildManifest({ publicDir, resultsRoot }).catch((e) => console.error('Rebuild failed:', e));
    }, 250);
  };

  chokidar
    .watch(resultsRoot, { ignoreInitial: true, persistent: true })
    .on('add', schedule)
    .on('addDir', schedule)
    .on('change', schedule)
    .on('unlink', schedule)
    .on('unlinkDir', schedule)
    .on('error', (e) => console.error('Watcher error:', e));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
