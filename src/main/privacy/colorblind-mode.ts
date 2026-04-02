/**
 * Colorblind Mode
 *
 * Applies CSS filters to web content to improve contrast and
 * distinguishability for users with color vision deficiency.
 *
 * Supports the three main types:
 * - Deuteranopia (red-green, most common ~6% of males)
 * - Protanopia (red-green)
 * - Tritanopia (blue-yellow, rare)
 *
 * Uses SVG filters for precise color matrix transformations
 * that enhance contrast without destroying the page layout.
 *
 * @module privacy/colorblind-mode
 */

import { getSetting, setSetting } from '../../../core/storage/repositories/settings';
import { ILogger } from '../types';
import { LoggerFactory } from '../utils/logger';

export type ColorblindType = 'off' | 'deuteranopia' | 'protanopia' | 'tritanopia';

/**
 * CSS + SVG filters that remap problem color ranges to
 * distinguishable alternatives while preserving luminance.
 */
const COLORBLIND_CSS: Record<Exclude<ColorblindType, 'off'>, string> = {
  deuteranopia: `
    html {
      filter: url(#volary-cb-filter) !important;
    }
    body::before {
      content: '';
      display: none;
    }
    html::after {
      content: '';
      position: fixed;
      width: 0;
      height: 0;
      overflow: hidden;
    }
    /* SVG filter injected separately */
  `,
  protanopia: `
    html {
      filter: url(#volary-cb-filter) !important;
    }
  `,
  tritanopia: `
    html {
      filter: url(#volary-cb-filter) !important;
    }
  `,
};

/**
 * SVG filter definitions that shift problem colors into
 * distinguishable ranges. These use color matrix transforms
 * researched for each deficiency type.
 */
const COLORBLIND_SVG: Record<Exclude<ColorblindType, 'off'>, string> = {
  deuteranopia: `
    <svg xmlns="http://www.w3.org/2000/svg" style="position:absolute;width:0;height:0">
      <defs>
        <filter id="volary-cb-filter" color-interpolation-filters="sRGB">
          <feColorMatrix type="matrix" values="
            0.625  0.375  0      0  0
            0.7    0.3    0      0  0
            0      0.3    0.7    0  0
            0      0      0      1  0
          "/>
          <feComponentTransfer>
            <feFuncR type="linear" slope="1.2" intercept="-0.1"/>
            <feFuncG type="linear" slope="0.8" intercept="0.1"/>
            <feFuncB type="linear" slope="1.1" intercept="0"/>
          </feComponentTransfer>
        </filter>
      </defs>
    </svg>
  `,
  protanopia: `
    <svg xmlns="http://www.w3.org/2000/svg" style="position:absolute;width:0;height:0">
      <defs>
        <filter id="volary-cb-filter" color-interpolation-filters="sRGB">
          <feColorMatrix type="matrix" values="
            0.567  0.433  0      0  0
            0.558  0.442  0      0  0
            0      0.242  0.758  0  0
            0      0      0      1  0
          "/>
          <feComponentTransfer>
            <feFuncR type="linear" slope="1.15" intercept="0"/>
            <feFuncG type="linear" slope="0.85" intercept="0.1"/>
            <feFuncB type="linear" slope="1.2" intercept="-0.05"/>
          </feComponentTransfer>
        </filter>
      </defs>
    </svg>
  `,
  tritanopia: `
    <svg xmlns="http://www.w3.org/2000/svg" style="position:absolute;width:0;height:0">
      <defs>
        <filter id="volary-cb-filter" color-interpolation-filters="sRGB">
          <feColorMatrix type="matrix" values="
            0.95   0.05   0      0  0
            0      0.433  0.567  0  0
            0      0.475  0.525  0  0
            0      0      0      1  0
          "/>
          <feComponentTransfer>
            <feFuncR type="linear" slope="1.1" intercept="0"/>
            <feFuncG type="linear" slope="1.0" intercept="0"/>
            <feFuncB type="linear" slope="0.9" intercept="0.1"/>
          </feComponentTransfer>
        </filter>
      </defs>
    </svg>
  `,
};

export class ColorblindMode {
  private logger: ILogger;
  private mode: ColorblindType = 'off';

  constructor() {
    this.logger = LoggerFactory.create('ColorblindMode');
  }

  initialize(): void {
    try {
      this.mode = getSetting<ColorblindType>('colorblindMode', 'off');
    } catch {
      this.mode = 'off';
    }
    this.logger.info('ColorblindMode initialized', { mode: this.mode });
  }

  getMode(): ColorblindType {
    return this.mode;
  }

  setMode(mode: ColorblindType): void {
    this.mode = mode;
    try {
      setSetting('colorblindMode', mode);
    } catch {
      // Settings DB might not be ready
    }
    this.logger.info('Colorblind mode changed', { mode });
  }

  /**
   * Cycle through modes: off → deuteranopia → protanopia → tritanopia → off
   */
  cycle(): ColorblindType {
    const order: ColorblindType[] = ['off', 'deuteranopia', 'protanopia', 'tritanopia'];
    const idx = order.indexOf(this.mode);
    const next = order[(idx + 1) % order.length];
    this.setMode(next);
    return next;
  }

  /**
   * Get the CSS to inject into a tab for the current mode
   */
  getCSS(): string | null {
    if (this.mode === 'off') return null;
    return COLORBLIND_CSS[this.mode];
  }

  /**
   * Get the SVG filter to inject into a tab
   */
  getSVGFilter(): string | null {
    if (this.mode === 'off') return null;
    return COLORBLIND_SVG[this.mode];
  }

  /**
   * Get a human-readable label for the current mode
   */
  getLabel(): string {
    switch (this.mode) {
      case 'deuteranopia': return 'Deuteranopia (red-green)';
      case 'protanopia': return 'Protanopia (red-green)';
      case 'tritanopia': return 'Tritanopia (blue-yellow)';
      default: return 'Off';
    }
  }
}
