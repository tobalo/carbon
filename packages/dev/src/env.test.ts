import { describe, expect, it } from "vitest";
import { renderEnv } from "./env.js";
import type { AuthSecret, PortMap } from "./worktree.js";

const ports: PortMap = {
  PORT_DB: 54000,
  PORT_STORAGE: 54001,
  PORT_CONSOLE: 54002,
  PORT_INBUCKET: 54003,
  PORT_INNGEST: 54004,
  PORT_ERP: 54005,
  PORT_MES: 54006
};

const auth: AuthSecret = { secret: "test-secret" };

describe("renderEnv (portless disabled)", () => {
  it("emits localhost URLs for app and storage", () => {
    const out = renderEnv({
      slug: "feat-x",
      ports,
      redisDb: 3,
      auth,
      portless: false
    });
    expect(out).toContain("CARBON_WORKTREE=feat-x");
    expect(out).toContain("ERP_URL=http://localhost:54005");
    expect(out).toContain("MES_URL=http://localhost:54006");
    expect(out).toContain("S3_ENDPOINT=http://localhost:54001");
    expect(out).toContain(
      "S3_PUBLIC_BASE_URL=http://localhost:54001/carbon-public-feat-x"
    );
    expect(out).not.toContain("PORTLESS_TLD");
  });

  it("wires every port into env vars", () => {
    const out = renderEnv({
      slug: "s",
      ports,
      redisDb: 0,
      auth,
      portless: false
    });
    expect(out).toContain("PORT_DB=54000");
    expect(out).toContain("PORT_STORAGE=54001");
    expect(out).toContain("PORT_CONSOLE=54002");
    expect(out).toContain("PORT_INBUCKET=54003");
    expect(out).toContain("PORT_INNGEST=54004");
    expect(out).toContain("PORT_ERP=54005");
    expect(out).toContain("PORT_MES=54006");
  });

  it("places redis db index in REDIS_URL", () => {
    const out = renderEnv({
      slug: "s",
      ports,
      redisDb: 7,
      auth,
      portless: false
    });
    expect(out).toMatch(/REDIS_URL=redis:\/\/localhost:\d+\/7/);
  });

  it("injects auth secret", () => {
    const out = renderEnv({
      slug: "s",
      ports,
      redisDb: 0,
      auth,
      portless: false
    });
    expect(out).toContain("AUTH_PROVIDER=better_auth");
    expect(out).toContain("BETTER_AUTH_SECRET=test-secret");
  });

  it("ends with a trailing newline", () => {
    const out = renderEnv({
      slug: "s",
      ports,
      redisDb: 0,
      auth,
      portless: false
    });
    expect(out.endsWith("\n")).toBe(true);
  });
});

describe("renderEnv (portless enabled)", () => {
  it("emits portless hostnames for app and storage", () => {
    const out = renderEnv({
      slug: "feat-x",
      ports,
      redisDb: 3,
      auth,
      portless: true,
      branchPrefix: "feat-x"
    });
    expect(out).toContain("CARBON_WORKTREE=feat-x");
    expect(out).toContain("ERP_URL=https://erp.feat-x.dev");
    expect(out).toContain("MES_URL=https://mes.feat-x.dev");
    expect(out).toContain("S3_ENDPOINT=https://storage.feat-x.dev");
    expect(out).toContain(
      "S3_PUBLIC_BASE_URL=https://storage.feat-x.dev/carbon-public-feat-x"
    );
    expect(out).toContain("PORTLESS_TLD=dev");
  });

  it("wires every port into env vars", () => {
    const out = renderEnv({
      slug: "s",
      ports,
      redisDb: 0,
      auth,
      portless: true,
      branchPrefix: "s"
    });
    expect(out).toContain("PORT_DB=54000");
    expect(out).toContain("PORT_STORAGE=54001");
    expect(out).toContain("PORT_CONSOLE=54002");
    expect(out).toContain("PORT_INBUCKET=54003");
    expect(out).toContain("PORT_INNGEST=54004");
    expect(out).toContain("PORT_ERP=54005");
    expect(out).toContain("PORT_MES=54006");
  });

  it("places redis db index in REDIS_URL", () => {
    const out = renderEnv({
      slug: "s",
      ports,
      redisDb: 7,
      auth,
      portless: true,
      branchPrefix: "s"
    });
    expect(out).toMatch(/REDIS_URL=redis:\/\/localhost:\d+\/7/);
  });

  it("injects auth secret", () => {
    const out = renderEnv({
      slug: "s",
      ports,
      redisDb: 0,
      auth,
      portless: true,
      branchPrefix: "s"
    });
    expect(out).toContain("AUTH_PROVIDER=better_auth");
    expect(out).toContain("BETTER_AUTH_SECRET=test-secret");
  });

  it("ends with a trailing newline", () => {
    const out = renderEnv({
      slug: "s",
      ports,
      redisDb: 0,
      auth,
      portless: true,
      branchPrefix: "s"
    });
    expect(out.endsWith("\n")).toBe(true);
  });
});
