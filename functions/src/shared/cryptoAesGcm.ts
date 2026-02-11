/* eslint-disable require-jsdoc */
/* eslint-disable max-len */
/* eslint-disable @typescript-eslint/no-explicit-any */

import crypto from "crypto";

export type EncryptOut = {
  alg: "aes-256-gcm";
  ivB64: string;
  tagB64: string;
  dataB64: string;
};

function keyFromB64(keyB64: string) {
  const key = Buffer.from(String(keyB64 || "").trim(), "base64");
  if (key.length !== 32) {
    throw new Error("portal-enc-key-b64 must decode to 32 bytes (AES-256)");
  }
  return key;
}

export function encryptJsonAes256Gcm(keyB64: string, payload: any): EncryptOut {
  const key = keyFromB64(keyB64);
  const iv = crypto.randomBytes(12);

  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const json = Buffer.from(JSON.stringify(payload), "utf8");

  const enc = Buffer.concat([cipher.update(json), cipher.final()]);
  const tag = cipher.getAuthTag();

  return {
    alg: "aes-256-gcm",
    ivB64: iv.toString("base64"),
    tagB64: tag.toString("base64"),
    dataB64: enc.toString("base64"),
  };
}

export function decryptJsonAes256Gcm(keyB64: string, enc: EncryptOut) {
  const key = keyFromB64(keyB64);
  const iv = Buffer.from(enc.ivB64, "base64");
  const tag = Buffer.from(enc.tagB64, "base64");
  const data = Buffer.from(enc.dataB64, "base64");

  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);

  const plain = Buffer.concat([decipher.update(data), decipher.final()]);
  return JSON.parse(plain.toString("utf8"));
}
