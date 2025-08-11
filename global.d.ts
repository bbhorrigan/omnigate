declare var process: {
  env: Record<string, string | undefined>;
  exit(code?: number): void;
};
