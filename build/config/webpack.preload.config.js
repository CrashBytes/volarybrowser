/**
 * Webpack Preload Script Configuration
 * Security-critical bridge between main and renderer processes
 * 
 * Architectural Role:
 * - Runs in privileged context with Node.js access
 * - Exposes controlled API via contextBridge
 * - Must be bundled before renderer initialization
 * 
 * Security Considerations:
 * - No external dependencies allowed (minimize attack surface)
 * - Inline all code (prevent injection attacks)
 * - Source maps in development only (prevent reverse engineering)
 */

const path = require('path');
const webpack = require('webpack');
const { merge } = require('webpack-merge');
const common = require('./webpack.common');

const rootDir = path.resolve(__dirname, '../..');
const isDevelopment = process.env.NODE_ENV !== 'production';

module.exports = merge(common, {
  target: 'electron-preload',
  
  entry: {
    preload: path.resolve(rootDir, 'src/preload/preload.ts'),
  },

  output: {
    path: path.resolve(rootDir, 'dist'),
    filename: 'preload.js',
  },

  // Preload runs in isolated context - no external modules
  externals: {
    electron: 'commonjs2 electron',
  },

  plugins: [
    new webpack.DefinePlugin({
      'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV || 'development'),
      'process.env.APP_VERSION': JSON.stringify(require('../../package.json').version),
    }),
  ],

  // Source maps in development only (security: prevent reverse engineering)
  devtool: isDevelopment ? 'inline-source-map' : false,

  optimization: {
    minimize: !isDevelopment,
    // Critical: No code splitting for preload (must be single file)
    splitChunks: false,
    runtimeChunk: false,
  },
});
