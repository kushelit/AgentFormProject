/* eslint-disable require-jsdoc */
/* eslint-disable max-len */
/* eslint-disable @typescript-eslint/no-explicit-any */

import {
  createHash,
  randomBytes,
  timingSafeEqual,
} from "crypto";

function s(value: any): string {
  return String(value ?? "").trim();
}

export function generateSurenseIncomingKey(): string {
  return randomBytes(32).toString("hex");
}

export function hashSurenseIncomingKey(
  value: string
): string {
  return createHash("sha256")
    .update(s(value), "utf8")
    .digest("hex");
}

export function verifySurenseIncomingKey(
  incomingKey: string,
  expectedHash: string
): boolean {
  const incomingHash =
    hashSurenseIncomingKey(
      incomingKey
    );

  const left =
    Buffer.from(
      incomingHash,
      "hex"
    );

  const right =
    Buffer.from(
      s(expectedHash),
      "hex"
    );

  if (
    left.length !==
    right.length
  ) {
    return false;
  }

  return timingSafeEqual(
    left,
    right
  );
}
