import { getConfig, setConfig } from "./config";

describe("config", () => {
  const defaultConfig = {
    debug: false,
  };

  afterEach(() => {
    setConfig(defaultConfig);
  });

  it("should return the default config", () => {
    const config = getConfig();
    expect(config).toMatchObject(defaultConfig);
  });

  it("should update the config and keep not provided values at default", () => {
    const newConfig = { debug: true };
    setConfig(newConfig);

    const updatedConfig = getConfig();
    expect(updatedConfig).toMatchObject({ ...defaultConfig, ...newConfig });
  });
});
