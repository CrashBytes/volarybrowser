/**
 * @fileoverview Browser Identity Management
 * 
 * Establishes Volary's cryptographic identity within the browser ecosystem.
 * This module manages:
 * - User-Agent string generation
 * - Update manifest signing and verification
 * - Extension API compatibility declarations
 * - Telemetry endpoint configuration
 * 
 * Design Philosophy:
 * The browser's identity is its cryptographic fingerprint to the web.
 * We maintain Chromium compatibility while establishing distinct identity.
 * 
 * @module core/identity
 * @author Volary Security Team
 */

import { createHash, randomBytes } from 'crypto';
import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * Browser version following Semantic Versioning 2.0.0
 * Format: MAJOR.MINOR.PATCH-PRERELEASE+BUILD
 * 
 * Version Strategy:
 * - MAJOR: Breaking API changes
 * - MINOR: New features, backward compatible
 * - PATCH: Bug fixes only
 * - PRERELEASE: alpha, beta, rc.1, rc.2, etc.
 */
export interface BrowserVersion {
  major: number;
  minor: number;
  patch: number;
  prerelease?: string;
  build?: string;
}

/**
 * Platform detection and identification
 */
export enum Platform {
  WINDOWS = 'windows',
  MACOS = 'macos',
  LINUX = 'linux',
  UNKNOWN = 'unknown',
}

/**
 * Architecture detection
 */
export enum Architecture {
  X64 = 'x64',
  ARM64 = 'arm64',
  X86 = 'x86',
  UNKNOWN = 'unknown',
}

/**
 * Comprehensive browser identity configuration
 */
interface BrowserIdentity {
  /** Human-readable browser name */
  name: string;
  
  /** Semantic version */
  version: BrowserVersion;
  
  /** Platform identification */
  platform: Platform;
  
  /** CPU architecture */
  architecture: Architecture;
  
  /** Chromium version we're based on */
  chromiumVersion: string;
  
  /** User-Agent string */
  userAgent: string;
  
  /** Unique installation ID (privacy-preserving) */
  installationId: string;
  
  /** Service endpoints */
  endpoints: {
    update: string;
    telemetry: string;
    sync: string;
    extensionStore: string;
  };
}

/**
 * Current browser version
 * Update this on each release
 */
const VOLARY_VERSION: BrowserVersion = {
  major: 0,
  minor: 1,
  patch: 0,
  prerelease: 'alpha',
};

/**
 * Chromium version we're building upon
 * Must match electron version in package.json
 */
const CHROMIUM_VERSION = '120.0.6099.56';

/**
 * Service endpoints configuration
 * Production values will be environment-specific
 */
const SERVICE_ENDPOINTS = {
  update: process.env['VOLARY_UPDATE_URL'] || 'https://updates.volarybrowser.com',
  telemetry: process.env['VOLARY_TELEMETRY_URL'] || 'https://telemetry.volarybrowser.com',
  sync: process.env['VOLARY_SYNC_URL'] || 'https://sync.volarybrowser.com',
  extensionStore: process.env['VOLARY_STORE_URL'] || 'https://extensions.volarybrowser.com',
};

/**
 * Identity Manager - Singleton for browser identity operations
 * 
 * Architectural Pattern: Singleton with Lazy Initialization
 * Identity is computed once per session and cached.
 * Installation ID persists across sessions (stored in vault).
 */
export class IdentityManager {
  private static instance: IdentityManager | null = null;
  private identity: BrowserIdentity | null = null;

  private constructor() {
    // Private constructor enforces singleton pattern
  }

  /**
   * Get singleton instance
   */
  static getInstance(): IdentityManager {
    if (!IdentityManager.instance) {
      IdentityManager.instance = new IdentityManager();
    }
    return IdentityManager.instance;
  }

  /**
   * Initialize browser identity
   * Called once during application startup
   * 
   * @param installationId - Persistent installation identifier (optional)
   * @returns Comprehensive browser identity
   */
  async initialize(installationId?: string): Promise<BrowserIdentity> {
    if (this.identity) {
      return this.identity;
    }

    const platform = this.detectPlatform();
    const architecture = this.detectArchitecture();
    const userAgent = this.generateUserAgent(platform, architecture);
    
    // Generate or load installation ID
    const id = installationId || await this.generateInstallationId();

    this.identity = {
      name: 'Volary',
      version: VOLARY_VERSION,
      platform,
      architecture,
      chromiumVersion: CHROMIUM_VERSION,
      userAgent,
      installationId: id,
      endpoints: SERVICE_ENDPOINTS,
    };

    return this.identity;
  }

  /**
   * Get current browser identity
   * @throws {Error} If identity not initialized
   */
  getIdentity(): BrowserIdentity {
    if (!this.identity) {
      throw new Error('Identity not initialized. Call initialize() first.');
    }
    return this.identity;
  }

  /**
   * Generate User-Agent string
   * 
   * Format Strategy:
   * We maintain Chromium compatibility signals while establishing distinct identity.
   * Structure: Mozilla/5.0 (Platform) AppleWebKit/537.36 (KHTML, like Gecko) 
   *            Volary/VERSION Chrome/VERSION Safari/537.36
   * 
   * Compatibility Considerations:
   * - Sites parsing for "Chrome/" will recognize us
   * - Sites parsing for "Volary/" can provide optimized experiences
   * - Mozilla/5.0 prefix maintains ancient compatibility
   * 
   * @param platform - Detected platform
   * @param architecture - Detected architecture
   * @returns Complete User-Agent string
   */
  private generateUserAgent(platform: Platform, architecture: Architecture): string {
    const platformString = this.getPlatformString(platform, architecture);
    const volaryVersion = this.formatVersion(VOLARY_VERSION);

    return [
      'Mozilla/5.0',
      `(${platformString})`,
      'AppleWebKit/537.36 (KHTML, like Gecko)',
      `Volary/${volaryVersion}`,
      `Chrome/${CHROMIUM_VERSION}`,
      'Safari/537.36',
    ].join(' ');
  }

  /**
   * Platform string for User-Agent
   * 
   * Examples:
   * - macOS: "Macintosh; Intel Mac OS X 10_15_7"
   * - Windows: "Windows NT 10.0; Win64; x64"
   * - Linux: "X11; Linux x86_64"
   */
  private getPlatformString(platform: Platform, arch: Architecture): string {
    switch (platform) {
      case Platform.MACOS:
        return 'Macintosh; Intel Mac OS X 10_15_7';
      
      case Platform.WINDOWS:
        const winArch = arch === Architecture.ARM64 ? 'ARM64' : 'Win64; x64';
        return `Windows NT 10.0; ${winArch}`;
      
      case Platform.LINUX:
        const linuxArch = arch === Architecture.ARM64 ? 'aarch64' : 'x86_64';
        return `X11; Linux ${linuxArch}`;
      
      default:
        return 'Unknown';
    }
  }

  /**
   * Detect current platform
   * Uses Node.js process.platform
   */
  private detectPlatform(): Platform {
    switch (process.platform) {
      case 'darwin':
        return Platform.MACOS;
      case 'win32':
        return Platform.WINDOWS;
      case 'linux':
        return Platform.LINUX;
      default:
        return Platform.UNKNOWN;
    }
  }

  /**
   * Detect CPU architecture
   * Uses Node.js process.arch
   */
  private detectArchitecture(): Architecture {
    switch (process.arch) {
      case 'x64':
        return Architecture.X64;
      case 'arm64':
        return Architecture.ARM64;
      case 'ia32':
        return Architecture.X86;
      default:
        return Architecture.UNKNOWN;
    }
  }

  /**
   * Format version as string
   * 
   * @param version - Semantic version object
   * @returns Formatted version string (e.g., "1.2.3-alpha+build.123")
   */
  private formatVersion(version: BrowserVersion): string {
    let versionString = `${version.major}.${version.minor}.${version.patch}`;
    
    if (version.prerelease) {
      versionString += `-${version.prerelease}`;
    }
    
    if (version.build) {
      versionString += `+${version.build}`;
    }
    
    return versionString;
  }

  /**
   * Generate privacy-preserving installation ID
   * 
   * Requirements:
   * - Unique per installation
   * - Non-reversible (cannot derive user identity)
   * - Persistent across sessions
   * - Used for telemetry aggregation only
   * 
   * Implementation:
   * SHA-256(timestamp || random_bytes || machine_id)
   * 
   * Privacy Properties:
   * - No personally identifiable information
   * - Cannot be linked across devices
   * - User can regenerate at will (clear data)
   * 
   * @returns 64-character hexadecimal installation ID
   */
  private async generateInstallationId(): Promise<string> {
    const timestamp = Date.now().toString();
    const randomData = randomBytes(32);
    
    // Machine ID is optional (may not be available on all platforms)
    const machineId = this.getMachineId();
    
    const hash = createHash('sha256');
    hash.update(timestamp);
    hash.update(randomData);
    if (machineId) {
      hash.update(machineId);
    }
    
    return hash.digest('hex');
  }

  /**
   * Get machine-specific identifier (platform-dependent)
   * 
   * This is NOT user-identifying information.
   * It's used only to ensure installation ID uniqueness.
   * 
   * Sources (in order of preference):
   * - macOS: IOPlatformUUID
   * - Windows: MachineGuid from registry
   * - Linux: /etc/machine-id
   * 
   * @returns Machine ID or null if unavailable
   */
  private getMachineId(): string | null {
    try {
      switch (this.detectPlatform()) {
        case Platform.MACOS:
          // Implementation would call: ioreg -rd1 -c IOPlatformExpertDevice
          return null; // Stub for now
        
        case Platform.WINDOWS:
          // Implementation would read: HKEY_LOCAL_MACHINE\SOFTWARE\Microsoft\Cryptography\MachineGuid
          return null; // Stub for now
        
        case Platform.LINUX:
          // Read /etc/machine-id
          try {
            return readFileSync('/etc/machine-id', 'utf-8').trim();
          } catch {
            return null;
          }
        
        default:
          return null;
      }
    } catch {
      return null;
    }
  }

  /**
   * Generate update manifest for distribution
   * 
   * Update Manifest Structure:
   * {
   *   version: "1.2.3",
   *   releaseDate: "2025-01-15T00:00:00Z",
   *   downloads: {
   *     macos: { url, sha256, size },
   *     windows: { url, sha256, size },
   *     linux: { url, sha256, size }
   *   },
   *   signature: "RSA-4096 signature of manifest"
   * }
   * 
   * Security Properties:
   * - Manifest signed with release key (offline cold storage)
   * - Binary SHA-256 hashes prevent tampering
   * - Size fields enable integrity checking
   * - HTTPS-only distribution
   * 
   * @returns Update manifest object
   */
  generateUpdateManifest(): object {
    // TODO: Implementation requires build system integration
    return {
      version: this.formatVersion(VOLARY_VERSION),
      releaseDate: new Date().toISOString(),
      downloads: {},
      signature: '',
    };
  }
}

/**
 * Singleton instance export
 */
export const identity = IdentityManager.getInstance();

/**
 * Helper function: Get current version string
 */
export function getVersionString(): string {
  const { version } = identity.getIdentity();
  return `${version.major}.${version.minor}.${version.patch}${
    version.prerelease ? `-${version.prerelease}` : ''
  }`;
}

/**
 * Helper function: Check if running on production build
 */
export function isProductionBuild(): boolean {
  return !VOLARY_VERSION.prerelease || VOLARY_VERSION.prerelease.startsWith('rc');
}

/**
 * Helper function: Get full browser identification string
 * Used in about:browser page and crash reports
 */
export function getFullIdentification(): string {
  const id = identity.getIdentity();
  return `Volary ${getVersionString()} (Chromium ${id.chromiumVersion}) on ${id.platform} ${id.architecture}`;
}
