/**
 * Ambient declarations for build-time globals.
 *
 * Environment variables are declared by name so `process.env.NODE_ENV` keeps
 * its dot form: webpack's DefinePlugin substitutes that exact expression, and
 * the renderer has no `process` object at runtime if it is not substituted.
 */
declare namespace NodeJS {
  interface ProcessEnv {
    NODE_ENV?: string;
    APP_VERSION?: string;
    CI?: string;
    HEADLESS?: string;
    VOLARY_DISABLE_GPU?: string;
    VOLARY_USER_DATA_PATH?: string;
  }

  /** webpack hot module replacement (development only) */
  interface Module {
    hot?: {
      accept(path: string, callback: () => void): void;
    };
  }
}
