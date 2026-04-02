/**
 * Webpack Common Configuration
 * Shared configuration for both main and renderer processes
 * 
 * Design Philosophy:
 * - Minimal bundle size through tree-shaking
 * - Source maps for debugging without compromising production performance
 * - Type-safe imports with path aliases
 */

const path = require('path');
const TsconfigPathsPlugin = require('tsconfig-paths-webpack-plugin');

const rootDir = path.resolve(__dirname, '../..');

module.exports = {
  resolve: {
    extensions: ['.ts', '.tsx', '.js', '.jsx', '.json'],
    plugins: [
      new TsconfigPathsPlugin({
        configFile: path.resolve(rootDir, 'tsconfig.json'),
      }),
    ],
    alias: {
      '@core': path.resolve(rootDir, 'core'),
      '@ui': path.resolve(rootDir, 'ui'),
      '@extensions': path.resolve(rootDir, 'extensions'),
    },
  },

  module: {
    rules: [
      {
        test: /\.tsx?$/,
        use: {
          loader: 'ts-loader',
          options: {
            transpileOnly: true, // Speed up compilation, type-checking in separate process
            experimentalWatchApi: true,
            ignoreDiagnostics: [5011], // TS5011: rootDir inference - irrelevant when bundling with webpack
            compilerOptions: {
              rootDir: rootDir,
            },
          },
        },
        exclude: /node_modules/,
      },
      {
        test: /\.css$/,
        use: ['style-loader', 'css-loader', 'postcss-loader'],
      },
      {
        test: /\.(woff2?|eot|ttf|otf)$/,
        type: 'asset/resource',
        generator: {
          filename: 'fonts/[name].[hash][ext]',
        },
      },
      {
        test: /\.(png|jpe?g|gif|svg)$/i,
        type: 'asset/resource',
        generator: {
          filename: 'images/[name].[hash][ext]',
        },
      },
    ],
  },

  // Performance budgets - enforces lean bundles
  performance: {
    hints: 'warning',
    maxEntrypointSize: 512000, // 500KB
    maxAssetSize: 256000, // 250KB
  },

  stats: {
    colors: true,
    modules: false,
    children: false,
    chunks: false,
    chunkModules: false,
  },

  node: {
    __dirname: false,
    __filename: false,
  },
};
