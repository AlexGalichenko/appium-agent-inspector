import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { Command } from 'commander';
import { CONFIG_DIR } from '../shared/constants.js';
import { ensureConfigDir } from '../shared/state-file.js';
import { toAccessibilityYaml } from './accessibility-tree.js';
import type { TreeOptions } from './accessibility-tree.js';
import type { DaemonClient } from './daemon-client.js';

/** The last tree printed, so `page-source --diff` has something to compare to. */
const SNAPSHOT_FILE = join(CONFIG_DIR, 'last-screen.json');

interface Snapshot {
  /** Trees rendered with different options cannot be compared line by line. */
  key: string;
  tree: string;
}

function keyOf(options: TreeOptions): string {
  return `bounds=${options.bounds === true}|collapse=${options.collapse !== false}`;
}

async function loadSnapshot(key: string): Promise<string | null> {
  try {
    const snap = JSON.parse(await readFile(SNAPSHOT_FILE, 'utf8')) as Snapshot;
    return snap.key === key ? snap.tree : null;
  } catch {
    return null;
  }
}

async function saveSnapshot(key: string, tree: string): Promise<void> {
  try {
    await ensureConfigDir();
    await writeFile(SNAPSHOT_FILE, JSON.stringify({ key, tree }), { mode: 0o600 });
  } catch {
    // Only --diff needs it, and that falls back to the full tree.
  }
}

/** Fetches and renders the current screen, remembering it for a later --diff. */
export async function readScreen(
  client: DaemonClient,
  options: TreeOptions = {},
): Promise<string> {
  const { source } = await client.getPageSource();
  const tree = toAccessibilityYaml(source, options);
  await saveSnapshot(keyOf(options), tree);
  return tree;
}

/**
 * The current screen as a diff against the last one read, or the full tree
 * when there is nothing comparable or most of the screen changed (a new
 * screen reads better in full than as a wall of +/- lines).
 */
export async function readScreenDiff(
  client: DaemonClient,
  options: TreeOptions = {},
): Promise<{ tree: string } | { diff: string }> {
  const previous = await loadSnapshot(keyOf(options));
  const tree = await readScreen(client, options);
  if (previous === null) return { tree };
  const diff = diffTrees(previous, tree);
  return diff === null ? { tree } : { diff };
}

/** Beyond this, a line-by-line comparison costs more than it saves. */
const MAX_DIFF_CELLS = 4_000_000;
/** Above this share of changed lines, print the whole new screen instead. */
const MAX_CHANGED_SHARE = 0.5;

type Op = { kind: ' ' | '+' | '-'; line: string };

function indentOf(line: string): number {
  return line.length - line.trimStart().length;
}

/**
 * Lines added (`+`) and removed (`-`) between two renders, each preceded by
 * its nearest unchanged ancestor so the change can be placed in the tree.
 * Null when a diff would not be shorter than the new tree.
 */
export function diffTrees(before: string, after: string): string | null {
  const a = before.split('\n');
  const b = after.split('\n');
  if (a.length * b.length > MAX_DIFF_CELLS) return null;

  // Longest common subsequence, filled from the end so the walk below can go
  // forwards and emit operations in document order.
  const width = b.length + 1;
  const lcs = new Uint32Array((a.length + 1) * width);
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      lcs[i * width + j] =
        a[i] === b[j]
          ? lcs[(i + 1) * width + j + 1]! + 1
          : Math.max(lcs[(i + 1) * width + j]!, lcs[i * width + j + 1]!);
    }
  }

  const ops: Op[] = [];
  let i = 0;
  let j = 0;
  while (i < a.length || j < b.length) {
    if (i < a.length && j < b.length && a[i] === b[j]) {
      ops.push({ kind: ' ', line: a[i++]! });
      j++;
    } else if (
      i < a.length &&
      (j === b.length || lcs[(i + 1) * width + j]! >= lcs[i * width + j + 1]!)
    ) {
      // Removals first, so a changed line reads as "- old" then "+ new".
      ops.push({ kind: '-', line: a[i++]! });
    } else {
      ops.push({ kind: '+', line: b[j++]! });
    }
  }

  const changed = ops.filter((op) => op.kind !== ' ');
  if (changed.length === 0) return '# no changes since the last read';
  if (changed.length > b.length * MAX_CHANGED_SHARE) return null;

  const added = changed.filter((op) => op.kind === '+').length;
  const out = [`# changes since the last read (+${added} -${changed.length - added}):`];
  const shown = new Set<number>();
  ops.forEach((op, k) => {
    if (op.kind === ' ') return;
    // A parent is the nearest line above with a smaller indent in the same
    // tree: unchanged, or changed the same way (a removed row's children sit
    // under that removed row, not under whatever unchanged row preceded it).
    // Every unchanged ancestor not yet printed goes out, outermost first, so
    // the change reads as a path from the root; a changed one already was.
    const chain: number[] = [];
    let indent = indentOf(op.line);
    for (let p = k - 1; p >= 0 && indent > 0; p--) {
      const candidate = ops[p]!;
      if (candidate.kind !== ' ' && candidate.kind !== op.kind) continue;
      if (indentOf(candidate.line) >= indent) continue;
      if (candidate.kind !== ' ') break;
      chain.unshift(p); // outermost first
      indent = indentOf(candidate.line);
    }
    for (const p of chain) {
      if (shown.has(p)) continue;
      shown.add(p);
      out.push(`  ${ops[p]!.line}`);
    }
    out.push(`${op.kind} ${op.line}`);
  });
  return out.join('\n');
}

/** `--source` on an action prints the resulting screen, saving a page-source call. */
export function addSourceOption(cmd: Command): Command {
  return cmd.option('--source', 'Print the screen (page-source) after acting', false);
}

/** The screen after an action, when `--source` was given. */
export async function screenAfter(
  client: DaemonClient,
  opts: { source?: boolean },
): Promise<{ tree?: string }> {
  return opts.source === true ? { tree: await readScreen(client) } : {};
}

export function printScreen(extra: { tree?: string }): void {
  if (extra.tree !== undefined) console.log(extra.tree);
}
