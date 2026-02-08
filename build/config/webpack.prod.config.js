/**
 * Webpack Production Configuration
 * Optimized build for distribution
 * 
 * Production Optimizations:
 * - Minification with tree-shaking
 * - License extraction for compliance
 * - Bundle analysis for size monitoring
 * - Source maps for debugging production issues
 */

const path = require('path');
const { merge } = require('webpack-merge');
const TerserPlugin = require('terser-webpack-plugin');
const { BundleAnalyzerPlugin } = require('webpack-bundle-analyzer');
const mainConfig = require('./webpack.main.config');
const rendererConfig = require('./webpack.renderer.config');

const rootDir = path.resolve(__dirname, '../..');

const productionOptimizations = {
  optimization: {
    minimize: true,
    minimizer: [
      new TerserPlugin({
        terserOptions: {
          compress: {
            drop_console: false, // Keep console for debugging
            drop_debugger: true,
            pure_funcs: ['console.debug'], // Remove debug statements
          },
          format: {
            comments: false, // Remove comments
          },
        },
        extractComments: {
          condition: /^\**!|@preserve|@license|@cc_on/i,
          filename: 'licenses.txt',
        },
      }),
    ],
    moduleIds: 'deterministic', // Stable module IDs for caching
    chunkIds: 'deterministic',
  },

  plugins: [
    // Analyze bundle size
    new BundleAnalyzerPlugin({
      analyzerMode: process.env.ANALYZE ? 'server' : 'json',
      generateStatsFile: true,
      statsFilename: path.resolve(rootDir, 'dist/stats.json'),
      openAnalyzer: false,
    }),
  ],
};

module.exports = [
  merge(mainConfig, {
    mode: 'production',
    ...productionOptimizations,
  }),
  merge(rendererConfig, {
    mode: 'production',
    ...productionOptimizations,
  }),
];
