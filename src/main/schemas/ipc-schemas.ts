/**
 * Zod schemas for IPC payload validation
 *
 * Replaces hand-rolled type guards with declarative schemas.
 * Each schema validates renderer -> main process payloads.
 *
 * @module schemas/ipc-schemas
 */

import { z } from 'zod';

export const windowFullscreenSchema = z.object({
  fullscreen: z.boolean(),
});

export const vaultInitializeSchema = z.object({
  password: z.string(),
  authLevel: z.number().optional(),
});

export const vaultUnlockSchema = z.object({
  password: z.string(),
});

export const navNavigateToSchema = z.object({
  url: z.string(),
});

export const tabCloseSchema = z.object({
  tabId: z.string(),
});

export const tabSwitchSchema = z.object({
  tabId: z.string(),
});

export const tabUpdateBoundsSchema = z.object({
  x: z.number(),
  y: z.number(),
  width: z.number(),
  height: z.number(),
});

// History
export const historySearchSchema = z.object({
  query: z.string(),
  limit: z.number().optional(),
});
export const historyGetRecentSchema = z.object({
  limit: z.number().optional(),
});
export const historyDeleteSchema = z.object({
  id: z.number(),
});

// Bookmarks
export const bookmarkCreateSchema = z.object({
  parentId: z.number(),
  title: z.string(),
  url: z.string().nullable(),
  isFolder: z.boolean().optional(),
});
export const bookmarkDeleteSchema = z.object({ id: z.number() });
export const bookmarkUpdateSchema = z.object({
  id: z.number(),
  title: z.string().optional(),
  url: z.string().optional(),
});
export const bookmarkMoveSchema = z.object({
  id: z.number(),
  newParentId: z.number(),
  newPosition: z.number(),
});
export const bookmarkGetTreeSchema = z.object({ rootId: z.number() });
export const bookmarkGetChildrenSchema = z.object({ parentId: z.number() });
export const bookmarkIsBookmarkedSchema = z.object({ url: z.string() });
export const bookmarkSearchSchema = z.object({
  query: z.string(),
  limit: z.number().optional(),
});

// Downloads
export const downloadActionSchema = z.object({ id: z.string() });

// Settings
export const settingsGetSchema = z.object({
  key: z.string(),
  defaultValue: z.unknown().optional(),
});
export const settingsSetSchema = z.object({
  key: z.string(),
  value: z.unknown(),
});

// Find in page
export const findStartSchema = z.object({
  text: z.string(),
  forward: z.boolean().optional(),
});

/**
 * Create a type-guard validator from a zod schema
 *
 * Bridges the existing IPCValidator interface with zod schemas.
 */
export function zodValidator<T>(schema: z.ZodType<T>): (payload: unknown) => payload is T {
  return (payload: unknown): payload is T => schema.safeParse(payload).success;
}
