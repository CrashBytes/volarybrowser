/**
 * Webpack Renderer Process Configuration
 * Electron renderer process (Chromium/Browser environment)
 * 
 * Design Philosophy:
 * - React-based UI with hot reload for rapid iteration
 * - CSS Modules for style encapsulation
 * - Code splitting for optimal initial load
 * - Security-conscious content policies
 */

const path = require('path');
const webpack = require('webpack');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const { merge } = require('webpack-merge');
const common = require('./webpack.common');

const rootDir = path.resolve(__dirname, '../..');
const isDevelopment = process.env.NODE_ENV !== 'production';

module.exports = merge(common, {
  target: 'web',
  resolve: {
    fallback: {
      process: require.resolve('process/browser'),
    },
  },
  
  entry: {
    renderer: path.resolve(rootDir, 'src/renderer/index.tsx'),
  },

  output: {
    path: path.resolve(rootDir, 'dist'),
    filename: '[name].js',
    publicPath: isDevelopment ? 'http://localhost:3000/' : './',
    globalObject: 'globalThis',
  },

  module: {
    rules: [
      {
        test: /\.module\.css$/,
        use: [
          'style-loader',
          {
            loader: 'css-loader',
            options: {
              modules: {
                localIdentName: isDevelopment
                  ? '[path][name]__[local]--[hash:base64:5]'
                  : '[hash:base64:8]',
              },
              importLoaders: 1,
            },
          },
          'postcss-loader',
        ],
      },
    ],
  },

  plugins: [
    new HtmlWebpackPlugin({
      template: path.resolve(rootDir, 'src/renderer/index.html'),
      inject: 'body',
      scriptLoading: 'defer',
      meta: isDevelopment ? {
        'Content-Security-Policy': {
          'http-equiv': 'Content-Security-Policy',
          content: "default-src 'self' 'unsafe-inline' 'unsafe-eval' http://localhost:*; script-src 'self' 'unsafe-inline' 'unsafe-eval'; connect-src 'self' ws://localhost:*;",
        },
      } : {},
    }),

    // Provide Node.js globals for browser environment
    new webpack.ProvidePlugin({
      process: 'process/browser',
      Buffer: ['buffer', 'Buffer'],
    }),

    new webpack.DefinePlugin({
      'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV || 'development'),
      'process.env.VOLARY_VERSION': JSON.stringify(require('../../package.json').version),
    }),

    // Shim 'global' for libraries that expect Node.js environment
    new webpack.BannerPlugin({
      banner: 'if(typeof globalThis.global==="undefined"){globalThis.global=globalThis;}',
      raw: true,
      entryOnly: false,
    }),
  ],

  devServer: {
    port: 3000,
    hot: true,
    compress: true,
    historyApiFallback: true,
    headers: {
      'Access-Control-Allow-Origin': '*',
    },
    client: {
      overlay: {
        errors: true,
        warnings: false,
      },
    },
  },

  devtool: isDevelopment ? 'eval-source-map' : 'source-map',

  optimization: {
    splitChunks: {
      chunks: 'all',
      cacheGroups: {
        vendor: {
          test: /[\\/]node_modules[\\/]/,
          name: 'vendors',
          priority: 10,
        },
        common: {
          minChunks: 2,
          priority: 5,
          reuseExistingChunk: true,
        },
      },
    },
    runtimeChunk: 'single',
    minimize: !isDevelopment,
  },
});
