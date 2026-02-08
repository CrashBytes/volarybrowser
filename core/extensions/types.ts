/**
 * Extension System Type Definitions
 *
 * Chrome Extension Manifest V3 compatibility types.
 * Only a subset of the full MV3 spec is supported in this alpha.
 *
 * @module core/extensions/types
 */

/**
 * Supported Chrome extension permissions
 */
export type ChromePermission =
  | 'storage'
  | 'tabs'
  | 'activeTab'
  | 'alarms'
  | 'notifications'
  | 'contextMenus'
  | 'cookies'
  | 'webRequest'
  | 'scripting';

/**
 * Content script injection configuration
 */
export interface ContentScriptConfig {
  matches: string[];
  exclude_matches?: string[];
  css?: string[];
  js?: string[];
  run_at?: 'document_start' | 'document_idle' | 'document_end';
  all_frames?: boolean;
}

/**
 * Chrome Extension Manifest V3 (subset)
 */
export interface ExtensionManifest {
  manifest_version: 3;
  name: string;
  version: string;
  description?: string;

  permissions?: ChromePermission[];
  optional_permissions?: ChromePermission[];
  host_permissions?: string[];

  background?: {
    service_worker: string;
    type?: 'module';
  };

  content_scripts?: ContentScriptConfig[];

  action?: {
    default_popup?: string;
    default_icon?: string | Record<string, string>;
    default_title?: string;
  };

  icons?: Record<string, string>;

  web_accessible_resources?: Array<{
    resources: string[];
    matches: string[];
  }>;

  content_security_policy?: {
    extension_pages?: string;
    sandbox?: string;
  };
}

/**
 * A loaded and registered extension
 */
export interface LoadedExtension {
  id: string;
  manifest: ExtensionManifest;
  path: string;
  enabled: boolean;
  installedAt: number;
}
