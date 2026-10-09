// The reading the usage-bar Claude Code plugin (plugin/) writes whenever Claude's reply moves a usage window: the
// rate-limit windows Claude Code reported, in a file the extension polls

import { readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';

import { z } from 'zod';

import type { Reading } from './view.ts';

const READING_PATH = join(homedir(), '.claude', 'usage-bar.json');

// The file's format. A plugin that writes another version is newer than this extension, and its reading is left unread
// rather than misread
const VERSION = 1;

// Anyone on the machine can write the file, so what reaches the status bar is bounded: a kind is a plain name (never
// $(icon) syntax), a share is a percentage (a spend limit can pass 100), and there are a few windows at most
const readingSchema = z.object({
  version: z.literal(VERSION),
  updatedAt: z.number(),
  limits: z
    .array(
      z.object({
        kind: z.string().regex(/^[a-z0-9_]{1,40}$/),
        percentUsed: z.number().min(0).max(1000),
        resetsAt: z.string().optional(),
      }),
    )
    .max(8),
});

// Undefined when there's no reading to show: none written yet, a file caught mid-write, another version, or out of
// bounds. The caller keeps the last reading it had
const readReading = async (path = READING_PATH): Promise<Reading | undefined> => {
  try {
    const { updatedAt, limits } = readingSchema.parse(JSON.parse(await readFile(path, 'utf8')));

    return { updatedAt, limits };
  } catch {
    return undefined;
  }
};

export { READING_PATH, readReading };
