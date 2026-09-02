import { createHash } from "crypto";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { installationPath, replaceInstalledExecutable } from "./install";

const releasesUrl =
  "https://api.github.com/repos/jonnyAnd/chatgpt-tui/releases";
const releaseAssetName = "chatgpt-tui-linux-x64";

type SemanticVersion = {
  major: number;
  minor: number;
  patch: number;
  prerelease: string[];
};

type ReleaseAsset = {
  name: string;
  browser_download_url: string;
  digest?: string | null;
};

type Release = {
  draft: boolean;
  prerelease: boolean;
  tag_name: string;
  assets: ReleaseAsset[];
};

type LatestRelease = Release & { version: SemanticVersion };

type UpdateOptions = {
  currentVersion: string;
  destinationPath?: string;
  fetchImpl?: typeof fetch;
  temporaryDirectory?: string;
  onUpdateAvailable?: (currentVersion: string, latestVersion: string) => void;
};

type UpdateResult = {
  status: "updated" | "up-to-date";
  currentVersion: string;
  latestVersion: string;
};

function parseSemanticVersion(value: string): SemanticVersion | undefined {
  const match = value
    .trim()
    .match(
      /^v?(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+[0-9A-Za-z.-]+)?$/
    );
  if (!match) return undefined;

  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
    prerelease: match[4]?.split(".") ?? [],
  };
}

function compareSemanticVersions(
  left: SemanticVersion,
  right: SemanticVersion
) {
  for (const key of ["major", "minor", "patch"] as const) {
    if (left[key] !== right[key]) return left[key] > right[key] ? 1 : -1;
  }

  if (left.prerelease.length === 0 && right.prerelease.length > 0) return 1;
  if (left.prerelease.length > 0 && right.prerelease.length === 0) return -1;

  const length = Math.max(left.prerelease.length, right.prerelease.length);
  for (let index = 0; index < length; index += 1) {
    const leftIdentifier = left.prerelease[index];
    const rightIdentifier = right.prerelease[index];
    if (leftIdentifier === rightIdentifier) continue;
    if (leftIdentifier === undefined) return -1;
    if (rightIdentifier === undefined) return 1;

    const leftNumeric = /^\d+$/.test(leftIdentifier);
    const rightNumeric = /^\d+$/.test(rightIdentifier);
    if (leftNumeric && rightNumeric) {
      return Number(leftIdentifier) > Number(rightIdentifier) ? 1 : -1;
    }
    if (leftNumeric) return -1;
    if (rightNumeric) return 1;
    return leftIdentifier > rightIdentifier ? 1 : -1;
  }

  return 0;
}

function isRelease(value: unknown): value is Release {
  if (!value || typeof value !== "object") return false;
  const release = value as Partial<Release>;
  return (
    typeof release.draft === "boolean" &&
    typeof release.prerelease === "boolean" &&
    typeof release.tag_name === "string" &&
    Array.isArray(release.assets)
  );
}

function isReleaseAsset(value: unknown): value is ReleaseAsset {
  if (!value || typeof value !== "object") return false;
  const asset = value as Partial<ReleaseAsset>;
  return (
    typeof asset.name === "string" &&
    typeof asset.browser_download_url === "string" &&
    (asset.digest === undefined ||
      asset.digest === null ||
      typeof asset.digest === "string")
  );
}

async function latestPublishedRelease(
  fetchImpl: typeof fetch,
  userAgent: string
): Promise<LatestRelease> {
  let response: Response;
  try {
    response = await fetchImpl(releasesUrl, {
      headers: {
        Accept: "application/vnd.github+json",
        "User-Agent": userAgent,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Could not connect to GitHub: ${message}`);
  }

  if (!response.ok) {
    throw new Error(`GitHub API request failed (HTTP ${response.status}).`);
  }

  let releases: unknown;
  try {
    releases = await response.json();
  } catch {
    throw new Error("GitHub returned an invalid releases response.");
  }
  if (!Array.isArray(releases) || !releases.every(isRelease)) {
    throw new Error("GitHub returned an unexpected releases response.");
  }

  const publishedReleases = releases
    .filter((release) => !release.draft && !release.prerelease)
    .map((release) => ({
      ...release,
      version: parseSemanticVersion(release.tag_name),
    }))
    .filter(
      (release): release is LatestRelease =>
        release.version !== undefined && release.version.prerelease.length === 0
    );
  if (publishedReleases.length === 0) {
    throw new Error(
      "No published releases with a valid semantic version were found."
    );
  }

  return publishedReleases.reduce((latest, release) =>
    compareSemanticVersions(release.version, latest.version) > 0
      ? release
      : latest
  );
}

function findReleaseAsset(release: Release): ReleaseAsset {
  const asset = release.assets.find(
    (candidate) =>
      isReleaseAsset(candidate) && candidate.name === releaseAssetName
  );
  if (!asset) {
    throw new Error(
      `Release ${release.tag_name} does not include ${releaseAssetName}.`
    );
  }
  return asset;
}

function verifyDigest(contents: Buffer, digest?: string | null): void {
  if (!digest) return;

  const match = digest.match(/^sha256:([a-fA-F0-9]{64})$/);
  if (!match)
    throw new Error("Release asset has an unsupported checksum digest.");

  const actualDigest = createHash("sha256").update(contents).digest("hex");
  if (actualDigest.toLowerCase() !== match[1].toLowerCase()) {
    throw new Error(
      "Downloaded executable checksum did not match the release asset."
    );
  }
}

async function downloadReleaseAsset(
  asset: ReleaseAsset,
  temporaryPath: string,
  fetchImpl: typeof fetch,
  userAgent: string
): Promise<void> {
  let response: Response;
  try {
    response = await fetchImpl(asset.browser_download_url, {
      headers: {
        Accept: "application/octet-stream",
        "User-Agent": userAgent,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Could not download the release executable: ${message}`);
  }
  if (!response.ok) {
    throw new Error(`Release download failed (HTTP ${response.status}).`);
  }

  let contents: Buffer;
  try {
    contents = Buffer.from(await response.arrayBuffer());
  } catch {
    throw new Error("Could not read the downloaded release executable.");
  }
  if (contents.length === 0)
    throw new Error("Downloaded release executable is empty.");

  await fs.promises.writeFile(temporaryPath, contents, { mode: 0o700 });
  verifyDigest(contents, asset.digest);
  await fs.promises.chmod(temporaryPath, 0o755);
}

async function updateInstalledExecutable({
  currentVersion,
  destinationPath = installationPath,
  fetchImpl = fetch,
  temporaryDirectory = os.tmpdir(),
  onUpdateAvailable,
}: UpdateOptions): Promise<UpdateResult> {
  const current = parseSemanticVersion(currentVersion);
  if (!current)
    throw new Error(
      `Current version ${currentVersion} is not valid semantic versioning.`
    );

  const userAgent = `chatgpt-tui/${currentVersion}`;
  const release = await latestPublishedRelease(fetchImpl, userAgent);
  const latestVersion = release.tag_name;
  if (compareSemanticVersions(current, release.version) >= 0) {
    return { status: "up-to-date", currentVersion, latestVersion };
  }

  onUpdateAvailable?.(currentVersion, latestVersion);
  const asset = findReleaseAsset(release);
  const directory = await fs.promises.mkdtemp(
    path.join(temporaryDirectory, "chatgpt-tui-update-")
  );
  const temporaryPath = path.join(directory, releaseAssetName);

  try {
    await downloadReleaseAsset(asset, temporaryPath, fetchImpl, userAgent);
    await replaceInstalledExecutable(temporaryPath, destinationPath);
    return { status: "updated", currentVersion, latestVersion };
  } finally {
    await fs.promises
      .rm(directory, { recursive: true, force: true })
      .catch(() => undefined);
  }
}

function formatUpdateError(error: unknown): string {
  const code = (error as NodeJS.ErrnoException).code;
  if (code === "EACCES" || code === "EPERM") {
    return `Update needs permission to replace ${installationPath}. Run chatgpt-tui --update with appropriate privileges.`;
  }
  const message = error instanceof Error ? error.message : String(error);
  return `Could not update chatgpt-tui: ${message}`;
}

export {
  compareSemanticVersions,
  findReleaseAsset,
  formatUpdateError,
  latestPublishedRelease,
  parseSemanticVersion,
  releaseAssetName,
  releasesUrl,
  updateInstalledExecutable,
};
export type { Release, ReleaseAsset, UpdateOptions, UpdateResult };
