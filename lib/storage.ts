import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { mkdir, writeFile, readFile, rm } from "node:fs/promises";
import path from "node:path";
import { demo } from "./config";
const client = () =>
  new S3Client({
    region: process.env.S3_REGION || "us-east-1",
    endpoint: process.env.S3_ENDPOINT || undefined,
    forcePathStyle: !!process.env.S3_ENDPOINT,
  });
const local = (key: string) => {
  if (!/^[a-zA-Z0-9_/-]+\.[a-z0-9]+$/.test(key) || key.includes(".."))
    throw new Error("Invalid storage key");
  return path.join(process.cwd(), ".data", key);
};
export async function store(key: string, data: Buffer, mime: string) {
  if (demo) {
    const p = local(key);
    await mkdir(path.dirname(p), { recursive: true });
    await writeFile(p, data);
  } else {
    if (!process.env.S3_BUCKET) throw new Error("Storage is not configured.");
    await client().send(
      new PutObjectCommand({
        Bucket: process.env.S3_BUCKET,
        Key: key,
        Body: data,
        ContentType: mime,
      }),
    );
  }
}
export async function download(key: string) {
  if (demo) return { bytes: await readFile(local(key)) };
  return {
    url: await getSignedUrl(
      client(),
      new GetObjectCommand({ Bucket: process.env.S3_BUCKET, Key: key }),
      { expiresIn: 60 },
    ),
  };
}
export async function remove(key: string) {
  if (demo) await rm(local(key), { force: true });
  else
    await client().send(
      new DeleteObjectCommand({ Bucket: process.env.S3_BUCKET, Key: key }),
    );
}
