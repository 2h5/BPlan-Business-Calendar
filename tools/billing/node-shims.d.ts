declare const process: {
  readonly argv: readonly string[];
  readonly env: Readonly<Record<string, string | undefined>>;
  readonly execPath: string;
  readonly stdout: {
    write(text: string): void;
  };
  exitCode?: number;
};

declare const require: {
  resolve(request: string): string;
};

declare module 'node:child_process' {
  interface ExecFileOptions {
    cwd?: string;
    env?: Readonly<Record<string, string | undefined>>;
    maxBuffer?: number;
    shell?: boolean;
    timeout?: number;
    windowsHide?: boolean;
  }

  interface ExecFileError extends Error {
    code?: number | string;
    killed?: boolean;
    signal?: string;
  }

  type ExecFileCallback = (error: ExecFileError | null, stdout: string, stderr: string) => void;

  export function execFile(
    file: string,
    args: readonly string[],
    options: ExecFileOptions,
    callback: ExecFileCallback,
  ): void;
}

declare module 'node:fs' {
  export function existsSync(path: string): boolean;
  export function statSync(path: string): { isFile(): boolean };
}

declare module 'node:path' {
  export function isAbsolute(path: string): boolean;
}
