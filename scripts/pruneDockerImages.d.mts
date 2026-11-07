export interface PackageVersion {
  id: number;
  /** The manifest digest, `sha256:...`. */
  name: string;
  created_at: string;
  updated_at: string;
  metadata?: { container?: { tags?: string[] } };
}

export function planPrune(
  versions: PackageVersion[],
  options: { now: number; olderThanDays: number; extraTags?: string[] },
): PackageVersion[];

/** The image digests an attestation version describes, or none for any other version. */
export function attestationSubjects(version: PackageVersion): string[];
