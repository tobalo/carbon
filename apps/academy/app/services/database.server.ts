import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { boolean, integer, pgTable, serial, text } from "drizzle-orm/pg-core";
import { Pool } from "pg";

const users = pgTable("user", {
  id: text("id").primaryKey(),
  email: text("email").notNull(),
  firstName: text("firstName").notNull(),
  lastName: text("lastName").notNull(),
  avatarUrl: text("avatarUrl")
});

const companies = pgTable("company", {
  id: text("id").primaryKey(),
  companyGroupId: text("companyGroupId")
});

const userToCompany = pgTable("userToCompany", {
  userId: text("userId").notNull(),
  companyId: text("companyId").notNull()
});

const lessonCompletions = pgTable("lessonCompletion", {
  userId: text("userId").notNull(),
  courseId: text("courseId").notNull(),
  lessonId: text("lessonId").notNull()
});

const challengeAttempts = pgTable("challengeAttempt", {
  id: serial("id").primaryKey(),
  userId: text("userId").notNull(),
  courseId: text("courseId").notNull(),
  topicId: text("topicId").notNull(),
  passed: boolean("passed").notNull()
});

const attributeDataTypes = pgTable("attributeDataType", {
  id: integer("id").primaryKey()
});

function getDatabaseUrl() {
  const databaseUrl =
    process.env.ACADEMY_DATABASE_URL ??
    process.env.CARBON_DATABASE_URL ??
    process.env.DATABASE_URL ??
    process.env.POSTGRES_URL;
  if (!databaseUrl) {
    throw new Error(
      "Missing ACADEMY_DATABASE_URL, CARBON_DATABASE_URL, DATABASE_URL, or POSTGRES_URL"
    );
  }
  return databaseUrl;
}

function getSslConfig(connectionString: string) {
  const url = new URL(connectionString);
  const sslMode = url.searchParams.get("sslmode");
  if (sslMode === "disable") return false;
  if (sslMode) return { rejectUnauthorized: sslMode === "verify-full" };
  if (url.hostname === "localhost" || url.hostname === "127.0.0.1") {
    return false;
  }
  return { rejectUnauthorized: false };
}

const init = () => {
  const connectionString = getDatabaseUrl();
  const pool = new Pool({
    connectionString,
    max: 10,
    allowExitOnIdle: true,
    ssl: getSslConfig(connectionString)
  });

  return {
    db: drizzle(pool),
    pool
  };
};

type ClientSingleton = ReturnType<typeof init>;

const globalForDrizzle = globalThis as unknown as {
  academyDrizzle: ClientSingleton | undefined;
};

const database = globalForDrizzle.academyDrizzle ?? init();

if (process.env.NODE_ENV !== "production") {
  globalForDrizzle.academyDrizzle = database;
}

export async function closeAcademyDatabase() {
  await database.pool.end();
  globalForDrizzle.academyDrizzle = undefined;
}

export async function getAcademyUser(userId: string) {
  const [user] = await database.db
    .select({
      id: users.id,
      email: users.email,
      firstName: users.firstName,
      lastName: users.lastName,
      avatarUrl: users.avatarUrl
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  return user ?? null;
}

export async function getUserProgress(userId: string) {
  const [lessonCompletionsForUser, challengeAttemptsForUser] =
    await Promise.all([
      database.db
        .select({
          lessonId: lessonCompletions.lessonId,
          courseId: lessonCompletions.courseId
        })
        .from(lessonCompletions)
        .where(eq(lessonCompletions.userId, userId)),
      database.db
        .select({
          topicId: challengeAttempts.topicId,
          courseId: challengeAttempts.courseId,
          passed: challengeAttempts.passed
        })
        .from(challengeAttempts)
        .where(eq(challengeAttempts.userId, userId))
    ]);

  return {
    lessonCompletions: lessonCompletionsForUser,
    challengeAttempts: challengeAttemptsForUser
  };
}

export async function insertLessonCompletion(input: {
  userId: string;
  courseId: string;
  lessonId: string;
}) {
  await database.db.insert(lessonCompletions).values(input);
}

export async function insertChallengeAttempt(input: {
  userId: string;
  courseId: string;
  topicId: string;
  passed: boolean;
}) {
  await database.db.insert(challengeAttempts).values(input);
}

export async function getFirstCompanyMembership(userId: string) {
  const [membership] = await database.db
    .select({
      companyId: userToCompany.companyId,
      companyGroupId: companies.companyGroupId
    })
    .from(userToCompany)
    .innerJoin(companies, eq(userToCompany.companyId, companies.id))
    .where(eq(userToCompany.userId, userId))
    .limit(1);

  return membership ?? null;
}

export async function checkDatabaseHealth() {
  await database.db
    .select({ id: attributeDataTypes.id })
    .from(attributeDataTypes)
    .limit(1);
}
