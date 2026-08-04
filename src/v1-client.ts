/**
 * Handwritten HTTP client for Identity Verification API v1.
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
}

export class IdempotencyConflictError extends Error {
  readonly problem: ProblemDetails;
  readonly status = 409;

  constructor(problem: ProblemDetails) {
    super(problem.detail ?? problem.title ?? "Idempotency conflict");
    this.name = "IdempotencyConflictError";
    this.problem = problem;
  }
}

export class VerificationClientError extends Error {
  readonly problem: ProblemDetails;
  readonly status: number;

  constructor(status: number, problem: ProblemDetails) {
    super(
      problem.detail ??
        problem.title ??
        `Verification request failed: ${status}`,
    );
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

async function parseProblemDetails(response: Response): Promise<ProblemDetails> {
  const text = await response.text();
  try {
    const parsed = JSON.parse(text) as ProblemDetails;
    return { ...parsed, status: parsed.status ?? response.status };
  } catch {
    return { status: response.status, detail: text || undefined };
  }
}

/**
 * Calls POST /verifications and expects an acceptance acknowledgement (202).
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

  const problem = await parseProblemDetails(response);
  if (response.status === 409) {
    throw new IdempotencyConflictError(problem);
  }
  throw new VerificationClientError(response.status, problem);
}
