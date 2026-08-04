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

export interface V1ClientOptions {
  baseUrl: string;
  /** Injected fetch for tests. */
  fetchImpl?: typeof fetch;
}

/**
 * Calls POST /verifications and expects an acceptance acknowledgement (202).
 */
export async function createVerification(
  options: V1ClientOptions,
  request: VerificationRequest,
): Promise<VerificationAccepted> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const response = await fetchImpl(`${options.baseUrl}/verifications`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(request),
  });

  if (response.status !== 202) {
    const body = await response.text();
    throw new Error(`v1 verification failed: ${response.status} ${body}`);
  }

  return (await response.json()) as VerificationAccepted;
}
