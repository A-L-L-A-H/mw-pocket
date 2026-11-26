export interface ParsedPairConfig {
  readonly echoUrl: string;
  readonly ridUrl: string;
  readonly myloveUrl: string;
  readonly token?: string;
}

const ALLOWED_HTTP_PROTOCOLS = new Set<string>(["http:", "https:"]);
const BLOCKED_SCHEME_PATTERN = /^(javascript|data|vbscript|file|blob):/i;

function validateHttpUrl(rawUrl: string | null, fieldName: string): string {
  if (!rawUrl || rawUrl.trim().length === 0) {
    throw new Error(`Missing required pairing parameter "${fieldName}".`);
  }
  const trimmed = rawUrl.trim();
  if (BLOCKED_SCHEME_PATTERN.test(trimmed)) {
    throw new Error(`Unsafe URL scheme rejected for "${fieldName}".`);
  }
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new Error(`Malformed URL for "${fieldName}".`);
  }
  if (!ALLOWED_HTTP_PROTOCOLS.has(parsed.protocol)) {
    throw new Error(`Disallowed protocol "${parsed.protocol}" for "${fieldName}".`);
  }
  if (!parsed.hostname) {
    throw new Error(`Missing hostname for "${fieldName}".`);
  }
  return parsed.toString().replace(/\/+$/, "");
}

export function parsePairUri(rawUri: string): ParsedPairConfig {
  const trimmedUri = rawUri.trim();
  if (!trimmedUri.startsWith("mw-pocket://")) {
    throw new Error("Pairing URI must use the mw-pocket:// scheme.");
  }

  let parsedUri: URL;
  try {
    parsedUri = new URL(trimmedUri);
  } catch {
    throw new Error("Malformed mw-pocket:// pairing URI.");
  }

  if (parsedUri.hostname.toLowerCase() !== "pair") {
    throw new Error(`Unsupported mw-pocket host "${parsedUri.hostname}". Expected "pair".`);
  }

  const echoUrl = validateHttpUrl(parsedUri.searchParams.get("echo"), "echo");
  const ridUrl = validateHttpUrl(parsedUri.searchParams.get("rid"), "rid");
  const myloveUrl = validateHttpUrl(parsedUri.searchParams.get("mylove"), "mylove");
  const rawToken = parsedUri.searchParams.get("token");
  const token = rawToken && rawToken.trim().length > 0 ? rawToken.trim() : undefined;

  if (token && /[\r\n\s]/.test(token)) {
    throw new Error("Pairing token contains illegal whitespace.");
  }

  return {
    echoUrl,
    ridUrl,
    myloveUrl,
    token
  };
}
