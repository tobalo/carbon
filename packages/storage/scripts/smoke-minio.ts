import {
  CreateBucketCommand,
  HeadObjectCommand,
  ListBucketsCommand
} from "@aws-sdk/client-s3";
import { spawnSync } from "node:child_process";
import { createServer } from "node:net";

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

function docker(args: string[], options: { allowFailure?: boolean } = {}) {
  const result = spawnSync("docker", args, {
    cwd: process.cwd(),
    encoding: "utf8",
    stdio: options.allowFailure ? "pipe" : "pipe"
  });

  if (!options.allowFailure && result.status !== 0) {
    throw new Error(
      `docker ${args.join(" ")} failed:\n${result.stderr || result.stdout}`
    );
  }

  return result;
}

async function getFreePort() {
  return new Promise<number>((resolve, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (typeof address !== "object" || address === null) {
        server.close();
        reject(new Error("Unable to allocate a TCP port."));
        return;
      }

      const { port } = address;
      server.close(() => resolve(port));
    });
  });
}

async function waitForMinio(s3: { send: (command: unknown) => Promise<unknown> }) {
  let lastError: unknown;

  for (let attempt = 0; attempt < 80; attempt += 1) {
    try {
      await s3.send(new ListBucketsCommand({}));
      return;
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }

  throw new Error(`MinIO did not become ready: ${String(lastError)}`);
}

function assertEquals(actual: unknown, expected: unknown, message: string) {
  if (actual !== expected) {
    throw new Error(`${message}: expected ${expected}, received ${actual}`);
  }
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function expectReject(fn: () => unknown | Promise<unknown>, label: string) {
  try {
    await fn();
  } catch {
    return;
  }

  throw new Error(`${label} did not reject.`);
}

async function putSignedUrl(url: string, body: string, contentType: string) {
  const response = await fetch(url, {
    method: "PUT",
    headers: { "content-type": contentType },
    body
  });

  if (!response.ok) {
    throw new Error(
      `Signed upload failed with ${response.status}: ${await response.text()}`
    );
  }
}

async function readSignedUrl(url: string) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(
      `Signed download failed with ${response.status}: ${await response.text()}`
    );
  }

  return response.text();
}

async function run() {
  const port = await getFreePort();
  const container = `carbon-storage-minio-${process.pid}-${Date.now()}`;
  const endpoint = `http://127.0.0.1:${port}`;

  docker(["rm", "-f", container], { allowFailure: true });
  docker([
    "run",
    "-d",
    "--name",
    container,
    "-p",
    `127.0.0.1:${port}:9000`,
    "-e",
    "MINIO_ROOT_USER=carbon",
    "-e",
    "MINIO_ROOT_PASSWORD=carbon-password",
    "minio/minio:latest",
    "server",
    "/data"
  ]);

  try {
    process.env.S3_REGION = "us-east-1";
    process.env.S3_ENDPOINT = endpoint;
    process.env.S3_ACCESS_KEY_ID = "carbon";
    process.env.S3_SECRET_ACCESS_KEY = "carbon-password";
    process.env.S3_PRIVATE_BUCKET = "carbon-private-smoke";
    process.env.S3_PUBLIC_BUCKET = "carbon-public-smoke";

    const storage = await import("../src/index");

    await waitForMinio(storage.s3);
    await storage.s3.send(
      new CreateBucketCommand({ Bucket: storage.PRIVATE_BUCKET })
    );
    await storage.s3.send(
      new CreateBucketCommand({ Bucket: storage.PUBLIC_BUCKET })
    );

    const signedUpload = await storage.signUpload({
      companyId: "company-a",
      path: "documents/private.txt",
      contentType: "text/plain"
    });
    assertEquals(
      signedUpload.key,
      "company-a/documents/private.txt",
      "signUpload should tenant-prefix private object keys"
    );
    await putSignedUrl(signedUpload.url, "signed-private", "text/plain");

    const signedDownload = await storage.signDownload({
      companyId: "company-a",
      key: signedUpload.key
    });
    assertEquals(
      await readSignedUrl(signedDownload),
      "signed-private",
      "signDownload should read the private object"
    );

    await storage.uploadObject({
      companyId: "company-a",
      key: "company-a/documents/direct.txt",
      body: textEncoder.encode("direct-private"),
      contentType: "text/plain"
    });

    const directDownload = await storage.downloadObject({
      companyId: "company-a",
      key: "company-a/documents/direct.txt"
    });
    assert(directDownload, "downloadObject should return object bytes.");
    assertEquals(
      textDecoder.decode(new Uint8Array(directDownload)),
      "direct-private",
      "downloadObject should read direct server uploads"
    );

    const listed = await storage.listObjects({
      companyId: "company-a",
      prefix: "documents"
    });
    assert(
      listed.some((object) => object.key === "company-a/documents/direct.txt"),
      "listObjects should stay tenant-prefixed."
    );

    await storage.moveObject({
      companyId: "company-a",
      fromKey: "company-a/documents/direct.txt",
      toKey: "company-a/documents/moved.txt"
    });
    const movedDownload = await storage.downloadObject({
      companyId: "company-a",
      key: "company-a/documents/moved.txt"
    });
    assert(movedDownload, "moveObject should create the destination object.");
    assertEquals(
      textDecoder.decode(new Uint8Array(movedDownload)),
      "direct-private",
      "moveObject should preserve object bytes"
    );

    await expectReject(
      () =>
        storage.signPrivateUpload({
          companyId: "company-a",
          key: "company-b/documents/nope.txt",
          contentType: "text/plain"
        }),
      "cross-tenant private upload signing"
    );
    await expectReject(
      () =>
        storage.downloadObject({
          companyId: "company-a",
          key: "company-b/documents/nope.txt"
        }),
      "cross-tenant private download"
    );
    await expectReject(
      () => storage.assertCompanyPath("company-a", "company-a/%2e%2e/nope.txt"),
      "encoded traversal path"
    );

    const publicUpload = await storage.signPublicUpload({
      key: "company-a/logos/logo.txt",
      contentType: "text/plain"
    });
    await putSignedUrl(publicUpload.url, "public-object", "text/plain");
    await storage.s3.send(
      new HeadObjectCommand({
        Bucket: storage.PUBLIC_BUCKET,
        Key: publicUpload.key
      })
    );
    await storage.removePublicObject({ key: publicUpload.key });

    await storage.removeObject({
      companyId: "company-a",
      key: signedUpload.key
    });
    await storage.removeObject({
      companyId: "company-a",
      key: "company-a/documents/moved.txt"
    });

    console.log("MinIO storage smoke passed");
    console.log("- direct S3 private signed upload/download verified");
    console.log("- direct S3 server upload/list/move/remove verified");
    console.log("- tenant path and encoded traversal guards verified");
    console.log("- direct S3 public signed upload/remove verified");
  } finally {
    docker(["rm", "-f", container], { allowFailure: true });
  }
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
