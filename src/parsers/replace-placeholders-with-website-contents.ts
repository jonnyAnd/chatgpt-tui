import { lookup } from "dns/promises";
import { isIP } from "net";
import { getConfig } from "../utils/config";

const MAX_REDIRECTS = 3;
const REQUEST_TIMEOUT_MS = 10_000;

function isPrivateAddress(address: string): boolean {
  if (
    address === "::1" ||
    address.startsWith("fe80:") ||
    /^(fc|fd)/i.test(address)
  )
    return true;
  const parts = address.split(".").map(Number);
  if (parts.length !== 4 || parts.some(Number.isNaN)) return false;
  const [first, second] = parts;
  return (
    first === 0 ||
    first === 10 ||
    first === 127 ||
    (first === 169 && second === 254) ||
    (first === 172 && second >= 16 && second <= 31) ||
    (first === 192 && second === 168) ||
    (first === 100 && second >= 64 && second <= 127)
  );
}

async function assertPublicUrl(url: URL): Promise<void> {
  if (!["http:", "https:"].includes(url.protocol)) {
    throw new Error("Only http and https URLs are allowed");
  }
  if (url.hostname === "localhost")
    throw new Error("Local URLs are not allowed");
  if (isIP(url.hostname)) {
    if (isPrivateAddress(url.hostname))
      throw new Error("Private network URLs are not allowed");
    return;
  }
  const addresses = await lookup(url.hostname, { all: true, verbatim: true });
  if (
    addresses.length === 0 ||
    addresses.some(({ address }) => isPrivateAddress(address))
  ) {
    throw new Error("URLs resolving to private networks are not allowed");
  }
}

function htmlToText(content: string): string {
  return content
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/\s+\n/g, "\n")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

async function fetchPage(url: string): Promise<string> {
  let currentUrl = new URL(url);
  const config = getConfig();
  for (
    let redirectCount = 0;
    redirectCount <= MAX_REDIRECTS;
    redirectCount += 1
  ) {
    await assertPublicUrl(currentUrl);
    const response = await fetch(currentUrl, {
      redirect: "manual",
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      headers: { Accept: "text/html,text/plain;q=0.9" },
    });
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (!location)
        throw new Error("Redirect response did not include a location");
      currentUrl = new URL(location, currentUrl);
      continue;
    }
    if (!response.ok)
      throw new Error(`Request failed with HTTP ${response.status}`);
    const contentLength = Number(response.headers.get("content-length"));
    if (Number.isFinite(contentLength) && contentLength > config.maxUrlBytes) {
      throw new Error(
        `Website exceeds the ${config.maxUrlBytes}-byte import limit`
      );
    }
    const content = await response.text();
    if (Buffer.byteLength(content, "utf8") > config.maxUrlBytes) {
      throw new Error(
        `Website exceeds the ${config.maxUrlBytes}-byte import limit`
      );
    }
    return htmlToText(content);
  }
  throw new Error(`Website exceeded the ${MAX_REDIRECTS}-redirect limit`);
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Replaces $URL(<website url>[start_string:end_string]) with the text contents of the website.
 * @param str - The string to parse.
 * @return The parsed string with website contents replaced.
 */
async function replacePlaceholdersWithWebsiteContents(
  str: string
): Promise<[string, string[]]> {
  const matches = str.match(/\$URL\((.*?)\)/g);
  if (!matches) {
    return [str, []];
  }

  const websiteUrls = [];
  for (const match of matches) {
    const pattern = /\$URL\((.*?)(\[(.*?):(.*?)\])?\)/;
    const urlMatch = match.match(pattern);
    if (!urlMatch) continue;
    const [matchString, websiteUrl, , startString, endString] = urlMatch;
    try {
      let pageContent = await fetchPage(websiteUrl);

      if (startString || endString) {
        const regex = new RegExp(
          `${startString ? escapeRegex(startString) : "^"}([\\s\\S]*?)${
            endString ? escapeRegex(endString) : "$"
          }`,
          "s"
        );
        const matches = pageContent.match(regex);
        pageContent = matches
          ? `${startString ?? ""}${matches[1]}${endString ?? ""}`
          : "";
      }

      str = str.replace(matchString, pageContent.trim());
      websiteUrls.push(websiteUrl);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.warn(`Could not replace ${matchString}: ${message}`);
    }
  }

  return [str, websiteUrls];
}

export { assertPublicUrl, fetchPage, replacePlaceholdersWithWebsiteContents };
