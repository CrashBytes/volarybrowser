/**
 * Extension Manifest Parser
 *
 * Validates Chrome Extension Manifest V3 format.
 * Only manifest_version 3 is accepted.
 *
 * @module core/extensions/manifest-parser
 */

import { ExtensionManifest } from './types';

export interface ParseResult {
  success: boolean;
  manifest?: ExtensionManifest;
  errors: string[];
  warnings: string[];
}

/**
 * Parse and validate an extension manifest
 */
export function parseManifest(raw: unknown): ParseResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (typeof raw !== 'object' || raw === null) {
    return { success: false, errors: ['Manifest must be a JSON object'], warnings };
  }

  const obj = raw as Record<string, unknown>;

  // Required fields
  if (obj['manifest_version'] !== 3) {
    errors.push('Only manifest_version 3 is supported');
  }

  if (typeof obj['name'] !== 'string' || obj['name'].length === 0) {
    errors.push('name is required and must be a non-empty string');
  }

  if (typeof obj['version'] !== 'string' || obj['version'].length === 0) {
    errors.push('version is required and must be a non-empty string');
  }

  // Optional: permissions
  if (obj['permissions'] !== undefined) {
    if (!Array.isArray(obj['permissions'])) {
      errors.push('permissions must be an array');
    } else {
      for (const perm of obj['permissions']) {
        if (typeof perm !== 'string') {
          errors.push(`Invalid permission: ${perm}`);
        }
      }
    }
  }

  // Optional: content_scripts
  if (obj['content_scripts'] !== undefined) {
    if (!Array.isArray(obj['content_scripts'])) {
      errors.push('content_scripts must be an array');
    } else {
      for (let i = 0; i < obj['content_scripts'].length; i++) {
        const cs = obj['content_scripts'][i] as Record<string, unknown>;
        if (!cs || typeof cs !== 'object') {
          errors.push(`content_scripts[${i}] must be an object`);
          continue;
        }
        if (!Array.isArray(cs['matches']) || cs['matches'].length === 0) {
          errors.push(`content_scripts[${i}].matches is required and must be a non-empty array`);
        }
        if (cs['js'] !== undefined && !Array.isArray(cs['js'])) {
          errors.push(`content_scripts[${i}].js must be an array`);
        }
        if (cs['css'] !== undefined && !Array.isArray(cs['css'])) {
          errors.push(`content_scripts[${i}].css must be an array`);
        }
      }
    }
  }

  // Optional: background
  if (obj['background'] !== undefined) {
    const bg = obj['background'] as Record<string, unknown>;
    if (typeof bg !== 'object' || bg === null) {
      errors.push('background must be an object');
    } else if (typeof bg['service_worker'] !== 'string') {
      errors.push('background.service_worker is required and must be a string');
    }
    warnings.push('Background service workers are not yet supported');
  }

  if (errors.length > 0) {
    return { success: false, errors, warnings };
  }

  return {
    success: true,
    manifest: obj as unknown as ExtensionManifest,
    errors,
    warnings,
  };
}
