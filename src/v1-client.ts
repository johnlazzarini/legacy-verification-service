/**
 * Handwritten HTTP client for Identity Verification API v2 create semantics.
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

/** RFC 7807 problem details returned on non-202 responses. */
export interface ProblemDetails {
  type?: string;
  title?: string;
  status?: number;
  detail?: string;
  instance?: string;
  retryable?: boolean;
  [key: string]: unknown;
}

export class VerificationApiError extends Error {
  readonly status: number;
  readonly problem: ProblemDetails;

  constructor(status: number, problem: ProblemDetails) {
    const title = problem.title ?? problem.detail ?? `HTTP ${status}`;
    super(`verification request failed: ${title}`);
    this.name = "VerificationApiError";
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

  let problem: ProblemDetails;
  try {
    problem = (await response.json()) as ProblemDetails;
  } catch {
    problem = {
      status: response.status,
      title: await response.text(),
    };
  }

  throw new VerificationApiError(response.status, problem);
}
