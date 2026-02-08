/**
 * Webpack Main Process Configuration
 * Electron main process (Node.js environment)
 * 
 * Security Considerations:
 * - Isolated from renderer process
 * - Manages native modules (security vault, crypto)
 * - Controls browser window lifecycle
 */

const path = require('path');
const webpack = require('webpack');
const { merge } = require('webpack-merge');
const common = require('./webpack.common');

const rootDir = path.resolve(__dirname, '../..');

module.exports = merge(common, {
  target: 'electron-main',
  
  entry: {
    main: path.resolve(rootDir, 'src/main/main.ts'),
  },

  output: {
    path: path.resolve(rootDir, 'dist'),
    filename: '[name].js',
    clean: true,
  },

  externals: {
    // Don't bundle native modules
    electron: 'commonjs2 electron',
    'hash-wasm': 'commonjs2 hash-wasm',
    '@noble/ciphers': 'commonjs2 @noble/ciphers',
    '@noble/hashes': 'commonjs2 @noble/hashes',
  },

  plugins: [
    new webpack.DefinePlugin({
      'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV || 'development'),
      'process.env.VOLARY_VERSION': JSON.stringify(require('../../package.json').version),
    }),
    
    // Only in development
    ...(process.env.NODE_ENV === 'development'
      ? [new webpack.HotModuleReplacementPlugin()]
      : []),
  ],

  devtool: process.env.NODE_ENV === 'production' ? 'source-map' : 'inline-source-map',

  optimization: {
    minimize: process.env.NODE_ENV === 'production',
    nodeEnv: process.env.NODE_ENV || 'development',
  },
});
