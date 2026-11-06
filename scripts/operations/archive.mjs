import { randomBytes, createCipheriv, createDecipheriv } from "node:crypto";
const aad = Buffer.from("JP-Estoque local recovery drill v1");
export function encryptArchive(bytes, key) {
  if (
    !Buffer.isBuffer(key) ||
    key.length !== 32 ||
    bytes.length > 32 * 1024 ** 2
  )
    throw Error("Invalid bounded archive/key");
  const iv = randomBytes(12),
    cipher = createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(aad);
  const data = Buffer.concat([cipher.update(bytes), cipher.final()]);
  return {
    version: 1,
    algorithm: "aes-256-gcm",
    iv: iv.toString("base64"),
    tag: cipher.getAuthTag().toString("base64"),
    data: data.toString("base64"),
  };
}
export function decryptArchive(archive, key) {
  if (
    archive.version !== 1 ||
    archive.algorithm !== "aes-256-gcm" ||
    !Buffer.isBuffer(key) ||
    key.length !== 32
  )
    throw Error("Invalid archive/key");
  for (const field of ["iv", "tag", "data"])
    if (
      typeof archive[field] !== "string" ||
      archive[field].length > 45 * 1024 ** 2 ||
      !/^[A-Za-z0-9+/]*={0,2}$/.test(archive[field])
    )
      throw Error("Invalid archive encoding");
  const iv = Buffer.from(archive.iv, "base64"),
    tag = Buffer.from(archive.tag, "base64");
  if (iv.length !== 12 || tag.length !== 16)
    throw Error("Invalid archive nonce/tag");
  const cipher = createDecipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(aad);
  cipher.setAuthTag(tag);
  return Buffer.concat([
    cipher.update(Buffer.from(archive.data, "base64")),
    cipher.final(),
  ]);
}
