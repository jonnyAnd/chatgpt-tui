type Config = {
  debug: boolean;
  workspaceRoot: string;
  maxImportBytes: number;
  maxFolderFiles: number;
  maxUrlBytes: number;
};

let config: Config = {
  debug: false,
  workspaceRoot: process.cwd(),
  maxImportBytes: 500_000,
  maxFolderFiles: 100,
  maxUrlBytes: 1_000_000,
};

function getConfig() {
  return config;
}

function setConfig(newConfig: Partial<Config>) {
  config = { ...config, ...newConfig };
}

export { getConfig, setConfig };
