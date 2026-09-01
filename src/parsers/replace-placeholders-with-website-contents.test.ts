import { lookup } from "dns/promises";
import { replacePlaceholdersWithWebsiteContents } from "./replace-placeholders-with-website-contents";

jest.mock("dns/promises", () => ({ lookup: jest.fn() }));

describe("replacePlaceholdersWithWebsiteContents", () => {
  beforeEach(() => {
    (lookup as jest.Mock).mockResolvedValue([
      { address: "93.184.216.34", family: 4 },
    ]);
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ "content-type": "text/html" }),
      text: jest
        .fn()
        .mockResolvedValue(
          "<h1>Hello</h1><script>ignored()</script><p>world</p>"
        ),
    });
  });

  afterEach(() => jest.restoreAllMocks());

  it("loads public HTTP content without browser automation", async () => {
    await expect(
      replacePlaceholdersWithWebsiteContents("Read $URL(https://example.com)")
    ).resolves.toEqual(["Read Hello world", ["https://example.com"]]);
  });

  it("rejects local network URLs", async () => {
    const warning = jest.spyOn(console, "warn").mockImplementation();
    await expect(
      replacePlaceholdersWithWebsiteContents("$URL(http://127.0.0.1/private)")
    ).resolves.toEqual(["$URL(http://127.0.0.1/private)", []]);
    expect(warning).toHaveBeenCalledWith(
      expect.stringContaining("Private network URLs")
    );
  });
});
