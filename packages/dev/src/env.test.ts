import { describe, expect, it } from "vitest";
import { renderEnv } from "./env.js";
import type { JwtCreds, PortMap } from "./worktree.js";

const ports: PortMap = {
  PORT_DB: 54000,
  PORT_API: 54001,
  PORT_INBUCKET: 54003,
  PORT_INNGEST: 54004,
  PORT_ERP: 54005,
  PORT_MES: 54006
};

const jwt: JwtCreds = {
  secret: "test-secret",
  anonKey: "test-anon-key",
  serviceKey: "test-service-key"
};

describe("renderEnv (portless disabled)", () => {
  it("emits localhost URLs for app and API", () => {
    const out = renderEnv({
      slug: "feat-x",
      ports,
      redisDb: 3,
      jwt,
      portless: false
    });
    expect(out).toContain("CARBON_WORKTREE=feat-x");
    expect(out).toContain("ERP_URL=http://localhost:54005");
    expect(out).toContain("MES_URL=http://localhost:54006");
    expect(out).toContain("CARBON_API_URL=http://localhost:54001");
    expect(out).toContain(
      "CARBON_DATABASE_URL=postgresql://postgres:postgres@localhost:54000/postgres"
    );
    expect(out).not.toContain("CARBON_AUTH_EXTERNAL_GOOGLE_REDIRECT_URI=");
    expect(out).not.toContain("CARBON_AUTH_EXTERNAL_AZURE_REDIRECT_URI=");
    expect(out).not.toContain("SUPABASE_URL=http://localhost:54001");
    expect(out).not.toContain("SUPABASE_DB_URL=");
    expect(out).not.toContain("PORTLESS_TLD");
  });

  it("wires every port into env vars", () => {
    const out = renderEnv({
      slug: "s",
      ports,
      redisDb: 0,
      jwt,
      portless: false
    });
    expect(out).toContain("PORT_DB=54000");
    expect(out).toContain("PORT_API=54001");
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
      jwt,
      portless: false
    });
    expect(out).toMatch(/REDIS_URL=redis:\/\/localhost:\d+\/7/);
  });

  it("injects auth creds under Carbon names", () => {
    const out = renderEnv({
      slug: "s",
      ports,
      redisDb: 0,
      jwt,
      portless: false
    });
    expect(out).toContain("CARBON_AUTH_JWT_SECRET=test-secret");
    expect(out).toContain("CARBON_PUBLIC_KEY=test-anon-key");
    expect(out).toContain("CARBON_SERVICE_ROLE_KEY=test-service-key");
    expect(out).not.toContain("SUPABASE_JWT_SECRET=");
    expect(out).not.toContain("SUPABASE_ANON_KEY=");
    expect(out).not.toContain("SUPABASE_SERVICE_ROLE_KEY=");
  });

  it("ends with a trailing newline", () => {
    const out = renderEnv({
      slug: "s",
      ports,
      redisDb: 0,
      jwt,
      portless: false
    });
    expect(out.endsWith("\n")).toBe(true);
  });
});

describe("renderEnv (portless enabled)", () => {
  it("emits portless hostnames for app and API", () => {
    const out = renderEnv({
      slug: "feat-x",
      ports,
      redisDb: 3,
      jwt,
      portless: true,
      branchPrefix: "feat-x"
    });
    expect(out).toContain("CARBON_WORKTREE=feat-x");
    expect(out).toContain("ERP_URL=https://erp.feat-x.dev");
    expect(out).toContain("MES_URL=https://mes.feat-x.dev");
    expect(out).toContain("CARBON_API_URL=https://api.feat-x.dev");
    expect(out).toContain(
      "CARBON_DATABASE_URL=postgresql://postgres:postgres@localhost:54000/postgres"
    );
    expect(out).not.toContain("CARBON_AUTH_EXTERNAL_GOOGLE_REDIRECT_URI=");
    expect(out).not.toContain("CARBON_AUTH_EXTERNAL_AZURE_REDIRECT_URI=");
    expect(out).not.toContain("SUPABASE_URL=https://api.feat-x.dev");
    expect(out).not.toContain("SUPABASE_DB_URL=");
    expect(out).toContain("PORTLESS_TLD=dev");
  });

  it("wires every port into env vars", () => {
    const out = renderEnv({
      slug: "s",
      ports,
      redisDb: 0,
      jwt,
      portless: true,
      branchPrefix: "s"
    });
    expect(out).toContain("PORT_DB=54000");
    expect(out).toContain("PORT_API=54001");
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
      jwt,
      portless: true,
      branchPrefix: "s"
    });
    expect(out).toMatch(/REDIS_URL=redis:\/\/localhost:\d+\/7/);
  });

  it("injects auth creds under Carbon names", () => {
    const out = renderEnv({
      slug: "s",
      ports,
      redisDb: 0,
      jwt,
      portless: true,
      branchPrefix: "s"
    });
    expect(out).toContain("CARBON_AUTH_JWT_SECRET=test-secret");
    expect(out).toContain("CARBON_PUBLIC_KEY=test-anon-key");
    expect(out).toContain("CARBON_SERVICE_ROLE_KEY=test-service-key");
    expect(out).not.toContain("SUPABASE_JWT_SECRET=");
    expect(out).not.toContain("SUPABASE_ANON_KEY=");
    expect(out).not.toContain("SUPABASE_SERVICE_ROLE_KEY=");
  });

  it("ends with a trailing newline", () => {
    const out = renderEnv({
      slug: "s",
      ports,
      redisDb: 0,
      jwt,
      portless: true,
      branchPrefix: "s"
    });
    expect(out.endsWith("\n")).toBe(true);
  });
});
