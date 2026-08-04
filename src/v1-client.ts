/**
 * Handwritten HTTP client for Identity Verification API v2 acknowledgement.
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
  constructor(
    message: string,
    public readonly status: number,
    public readonly problem?: ProblemDetails,
  ) {
    super(message);
    this.name = "VerificationClientError";
  }
}

export interface V1ClientOptions {
  baseUrl: string;
  /** Injected fetch for tests. */
  fetchImpl?: typeof fetch;
}

function parseProblemDetailsBody(body: string): ProblemDetails | undefined {
  try {
    return JSON.parse(body) as ProblemDetails;
  } catch {
    return undefined;
  }
}

/**
 * Calls POST /verifications and expects an asynchronous acknowledgement (202).
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

  const body = await response.text();
  const problem = parseProblemDetailsBody(body);
  const detail = problem?.detail ?? problem?.title ?? body;

  if (response.status === 409) {
    throw new VerificationClientError(
      `idempotency conflict: ${detail}`,
      response.status,
      problem,
    );
  }

  throw new VerificationClientError(
    `verification request failed: ${response.status} ${detail}`,
    response.status,
    problem,
  );
}
