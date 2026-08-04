/**
 * Handwritten HTTP client for Identity Verification API v2 acknowledge contract.
 * Seeded call site for repository impact analysis.
 */

export type DocumentType = "passport" | "drivers_license" | "national_id";

export interface VerificationRequest {
  subjectId: string;
  documentType: DocumentType;
  metadata?: Record<string, unknown>;
}

export interface VerificationAccepted {
  verificationId: string;
  status: "PENDING";
}

export interface ProblemDetails {
  type?: string;
  title?: string;
  status?: number;
  detail?: string;
  instance?: string;
  [key: string]: unknown;
}

export class VerificationClientError extends Error {
  readonly status: number;
  readonly problem?: ProblemDetails;

  constructor(message: string, status: number, problem?: ProblemDetails) {
    super(message);
    this.name = "VerificationClientError";
    this.status = status;
    this.problem = problem;
  }
}

export interface V1ClientOptions {
  baseUrl: string;
  /** Injected fetch for tests. */
  fetchImpl?: typeof fetch;
}

/**
 * Calls POST /verifications with Idempotency-Key and expects HTTP 202 acknowledgement.
 */
export async function createVerification(
  options: V1ClientOptions,
  request: VerificationRequest,
  idempotencyKey: string,
): Promise<VerificationAccepted> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const response = await fetchImpl(`${options.baseUrl}/verifications`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "Idempotency-Key": idempotencyKey,
    },
    body: JSON.stringify(request),
  });

  if (response.status === 202) {
    return (await response.json()) as VerificationAccepted;
  }

  const contentType = response.headers.get("content-type") ?? "";
  let problem: ProblemDetails | undefined;
  let bodyText = "";
  if (contentType.includes("application/json")) {
    try {
      problem = (await response.json()) as ProblemDetails;
    } catch {
      bodyText = "";
    }
  } else {
    bodyText = await response.text();
  }

  const detail = problem?.detail ?? problem?.title ?? bodyText;
  throw new VerificationClientError(
    `verification create failed: ${response.status} ${detail}`,
    response.status,
    problem,
  );
}
