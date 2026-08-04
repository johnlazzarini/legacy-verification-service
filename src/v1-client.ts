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

export interface VerificationResult {
  verificationId: string;
  status: "PASS" | "FAIL";
  decidedAt: string;
  reasonCode?: string;
}

export interface V1ClientOptions {
  baseUrl: string;
  /** Injected fetch for tests. */
  fetchImpl?: typeof fetch;
}

/**
 * Calls POST /verifications and expects a synchronous final decision (200).
 */
export async function createVerification(
  options: V1ClientOptions,
  request: VerificationRequest,
): Promise<VerificationResult> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const response = await fetchImpl(`${options.baseUrl}/verifications`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(request),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`v1 verification failed: ${response.status} ${body}`);
  }

  return (await response.json()) as VerificationResult;
}
