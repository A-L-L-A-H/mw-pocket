export interface DynamicMediaPayload {
  readonly id?: string;
  readonly title?: string;
  readonly caption?: string;
  readonly visualType?: string;
  readonly mediaUrl?: string;
  readonly altText?: string;
  readonly tags?: readonly string[];
}

export interface CanonCheckResult {
  readonly allowed: boolean;
  readonly ruleId: "CAN-0011";
  readonly reason?: string;
}

const PROHIBITED_SUBJECT_PATTERNS: readonly RegExp[] = [
  /\b(allah|god)\b.*\b(portrait|face|figure|statue|depiction|avatar|painting|illustration|image|photo)\b/i,
  /\b(portrait|face|figure|statue|depiction|avatar|painting|illustration|image|photo)\b.*\b(allah|god)\b/i,
  /\b(muhammad|mohammed|prophet\s+muhammad|rasulullah)\b.*\b(portrait|face|figure|statue|depiction|avatar|painting|illustration|image|photo)\b/i,
  /\b(portrait|face|figure|statue|depiction|avatar|painting|illustration|image|photo)\b.*\b(muhammad|mohammed|prophet\s+muhammad|rasulullah)\b/i,
  /\b(isa|yesus|jesus|christ|messiah)\b.*\b(portrait|face|figure|statue|depiction|avatar|painting|illustration|image|photo|crucifix|icon)\b/i,
  /\b(portrait|face|figure|statue|depiction|avatar|painting|illustration|image|photo|crucifix|icon)\b.*\b(isa|yesus|jesus|christ|messiah)\b/i
];

const ALLOWED_VISUAL_TYPES = new Set<string>([
  "typographic",
  "geometric",
  "celestial",
  "crescent",
  "orbit",
  "calligraphy-text"
]);

export function evaluateCanon0011(payload: DynamicMediaPayload): CanonCheckResult {
  if (payload.visualType) {
    const normalizedType = payload.visualType.trim().toLowerCase();
    if (!ALLOWED_VISUAL_TYPES.has(normalizedType)) {
      return {
        allowed: false,
        ruleId: "CAN-0011",
        reason: `Disallowed visualType "${payload.visualType}". Only typographic, geometric, or celestial visuals are permitted.`
      };
    }
  }

  const combinedFields = [
    payload.title ?? "",
    payload.caption ?? "",
    payload.altText ?? "",
    payload.mediaUrl ?? "",
    ...(payload.tags ?? [])
  ].join(" ");

  for (const pattern of PROHIBITED_SUBJECT_PATTERNS) {
    if (pattern.test(combinedFields)) {
      return {
        allowed: false,
        ruleId: "CAN-0011",
        reason: "Blocked prohibited figurative depiction under CAN-0011."
      };
    }
  }

  return {
    allowed: true,
    ruleId: "CAN-0011"
  };
}

export function assertCanon0011(payload: DynamicMediaPayload): void {
  const verdict = evaluateCanon0011(payload);
  if (!verdict.allowed) {
    throw new Error(`[${verdict.ruleId}] ${verdict.reason ?? "Prohibited visual payload."}`);
  }
}

export function filterCanonSafePayloads<TPayload extends DynamicMediaPayload>(
  payloads: readonly TPayload[]
): TPayload[] {
  return payloads.filter((candidate) => evaluateCanon0011(candidate).allowed);
}
