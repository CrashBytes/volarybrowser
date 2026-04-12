/**
 * Fingerprint Resistance
 *
 * Injects JavaScript into web content that spoofs or blocks common
 * browser fingerprinting techniques:
 * - Canvas fingerprinting
 * - WebGL fingerprinting
 * - AudioContext fingerprinting
 * - Hardware/navigator property enumeration
 *
 * @module privacy/fingerprint-resistance
 */

import { LoggerFactory } from '../utils/logger';

const logger = LoggerFactory.create('FingerprintResistance');

/**
 * JavaScript payload injected into every page to resist fingerprinting.
 * Runs in page context — must be self-contained with no external references.
 */
const ANTI_FINGERPRINT_SCRIPT = `
(function() {
  'use strict';
  if (window.__volaryFPProtect) return;
  window.__volaryFPProtect = true;

  // --- Canvas fingerprinting ---
  const origToDataURL = HTMLCanvasElement.prototype.toDataURL;
  HTMLCanvasElement.prototype.toDataURL = function(type, quality) {
    const ctx = this.getContext('2d');
    if (ctx) {
      const imageData = ctx.getImageData(0, 0, this.width, this.height);
      for (let i = 0; i < imageData.data.length; i += 4) {
        imageData.data[i] ^= 1;     // tiny R noise
        imageData.data[i+1] ^= 1;   // tiny G noise
      }
      ctx.putImageData(imageData, 0, 0);
    }
    return origToDataURL.call(this, type, quality);
  };

  const origToBlob = HTMLCanvasElement.prototype.toBlob;
  HTMLCanvasElement.prototype.toBlob = function(callback, type, quality) {
    const ctx = this.getContext('2d');
    if (ctx) {
      const imageData = ctx.getImageData(0, 0, this.width, this.height);
      for (let i = 0; i < imageData.data.length; i += 4) {
        imageData.data[i] ^= 1;
        imageData.data[i+1] ^= 1;
      }
      ctx.putImageData(imageData, 0, 0);
    }
    return origToBlob.call(this, callback, type, quality);
  };

  // --- WebGL fingerprinting ---
  const spoofWebGLParam = function(origGetParam) {
    return function(pname) {
      // RENDERER (0x1F01) and VENDOR (0x1F00)
      if (pname === 0x1F01) return 'WebKit WebGL';
      if (pname === 0x1F00) return 'WebKit';
      // UNMASKED_RENDERER_WEBGL and UNMASKED_VENDOR_WEBGL
      if (pname === 0x9246) return 'WebKit WebGL';
      if (pname === 0x9245) return 'WebKit';
      return origGetParam.call(this, pname);
    };
  };

  if (typeof WebGLRenderingContext !== 'undefined') {
    WebGLRenderingContext.prototype.getParameter = spoofWebGLParam(
      WebGLRenderingContext.prototype.getParameter
    );
  }
  if (typeof WebGL2RenderingContext !== 'undefined') {
    WebGL2RenderingContext.prototype.getParameter = spoofWebGLParam(
      WebGL2RenderingContext.prototype.getParameter
    );
  }

  // --- AudioContext fingerprinting ---
  if (typeof OfflineAudioContext !== 'undefined') {
    const origCreateOscillator = OfflineAudioContext.prototype.createOscillator;
    OfflineAudioContext.prototype.createOscillator = function() {
      const osc = origCreateOscillator.call(this);
      const origConnect = osc.connect.bind(osc);
      osc.connect = function(dest) {
        if (dest instanceof AnalyserNode || dest instanceof AudioDestinationNode) {
          const gain = osc.context.createGain();
          gain.gain.value = 0.999 + Math.random() * 0.002;
          origConnect(gain);
          gain.connect(dest);
          return dest;
        }
        return origConnect(dest);
      };
      return osc;
    };
  }

  // --- Navigator properties ---
  try {
    Object.defineProperty(navigator, 'hardwareConcurrency', { get: () => 4 });
  } catch {}
  try {
    Object.defineProperty(navigator, 'deviceMemory', { get: () => 8 });
  } catch {}
  try {
    Object.defineProperty(navigator, 'platform', { get: () => 'MacIntel' });
  } catch {}
})();
`;

export class FingerprintResistance {
  private enabled = false;

  initialize(enabled: boolean): void {
    this.enabled = enabled;
    logger.info('FingerprintResistance initialized', { enabled });
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }

  /**
   * Returns the anti-fingerprint script to inject into web content
   */
  getScript(): string {
    return ANTI_FINGERPRINT_SCRIPT;
  }
}
