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

const readingSchema = z.object({
  version: z.literal(VERSION),
  updatedAt: z.number(),
  limits: z.array(
    z.object({
      kind: z.string(),
      percentUsed: z.number(),
      resetsAt: z.string().optional(),
    }),
  ),
});

// Undefined when there's no reading to show: none written yet, a file caught mid-write, or another version. The caller
// keeps the last reading it had
const readReading = async (path = READING_PATH): Promise<Reading | undefined> => {
  try {
    const { updatedAt, limits } = readingSchema.parse(JSON.parse(await readFile(path, 'utf8')));

    return { updatedAt, limits };
  } catch {
    return undefined;
  }
};

export { READING_PATH, readReading };
