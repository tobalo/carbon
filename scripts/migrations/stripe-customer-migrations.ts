import type { Database } from "@carbon/database";
import { config } from "dotenv";
import Redis from "ioredis";
import { Stripe } from "stripe";
import { z } from "zod/v3";
import { getPostgresConnectionPool } from "../../packages/database/src/client.ts";
import { localCompanies, productionCompanies } from "./data/stripe-customers";
config();

const PROD = true;

const companies = PROD ? productionCompanies : localCompanies;

const redisUrl = PROD
  ? process.env.PROD_REDIS_URL
  : process.env.REDIS_URL;

if (!redisUrl) {
  throw new Error(
    PROD
      ? "PROD_REDIS_URL is not defined"
      : "REDIS_URL is not defined"
  );
}

const redis = new Redis(redisUrl);

const databaseUrl = PROD
  ? (process.env.PROD_CARBON_DATABASE_URL ??
    process.env.PROD_DATABASE_URL ??
    process.env.PROD_POSTGRES_URL ??
    process.env.CARBON_DATABASE_URL ??
    process.env.DATABASE_URL ??
    process.env.POSTGRES_URL)
  : (process.env.CARBON_DATABASE_URL ??
    process.env.DATABASE_URL ??
    process.env.POSTGRES_URL);

if (!databaseUrl) {
  throw new Error(
    PROD
      ? "PROD_CARBON_DATABASE_URL, PROD_DATABASE_URL, PROD_POSTGRES_URL, CARBON_DATABASE_URL, DATABASE_URL, or POSTGRES_URL is not defined"
      : "CARBON_DATABASE_URL, DATABASE_URL, or POSTGRES_URL is not defined"
  );
}

process.env.CARBON_DATABASE_URL = databaseUrl;

const stripeSecretKey = PROD
  ? process.env.PROD_STRIPE_SECRET_KEY!
  : process.env.STRIPE_SECRET_KEY!;

if (!stripeSecretKey) {
  throw new Error(
    PROD
      ? "PROD_STRIPE_SECRET_KEY is not defined"
      : "STRIPE_SECRET_KEY is not defined"
  );
}

const pgPool = getPostgresConnectionPool(1);

const stripe = new Stripe(stripeSecretKey, {
  apiVersion: "2025-06-30.basil",
  typescript: true,
});

const KvStripeCustomerSchema = z.object({
  subscriptionId: z.string(),
  status: z.union([
    z.literal("active"),
    z.literal("canceled"),
    z.literal("incomplete"),
    z.literal("incomplete_expired"),
    z.literal("past_due"),
    z.literal("paused"),
    z.literal("trialing"),
    z.literal("unpaid"),
  ]),
  priceId: z.string(),
  planId: z.string().nullable(),
  currentPeriodStart: z.number(),
  currentPeriodEnd: z.number(),
  cancelAtPeriodEnd: z.boolean(),
  paymentMethod: z
    .object({
      brand: z.string().nullable(),
      last4: z.string().nullable(),
    })
    .nullable(),
});

(async () => {
  for await (const company of companies) {
    const companyId = company.id;
    const customerId = company.customerId;
    console.log(company.name);
    if (!companyId) {
      throw new Error("Company ID is required");
    }

    if (!customerId) {
      throw new Error("Customer ID is required");
    }

    const customerKey = `stripe:customer:${customerId}`;
    const companyKey = `stripe:company:${company.id}`;

    await redis.set(companyKey, customerId);

    const subscription = await getSubscription(customerId);
    if (!subscription) {
      await redis.del(customerKey);
      return null;
    }

    const plan = await getPlanByPriceId(subscription.items.data[0].price.id);

    if (plan.error) {
      console.error("Failed to get plan by price id:", plan.error);
      continue;
    }

    const subDataResult = KvStripeCustomerSchema.safeParse({
      subscriptionId: subscription.id,
      status: subscription.status,
      priceId: subscription.items.data[0].price.id,
      planId: plan.data.id,
      currentPeriodStart: subscription.items.data[0].current_period_start,
      currentPeriodEnd: subscription.items.data[0].current_period_end,
      cancelAtPeriodEnd: subscription.cancel_at_period_end,
      paymentMethod:
        subscription.default_payment_method &&
        typeof subscription.default_payment_method !== "string"
          ? {
              brand: subscription.default_payment_method.card?.brand ?? null,
              last4: subscription.default_payment_method.card?.last4 ?? null,
            }
          : null,
    });

    if (!subDataResult.success) {
      console.error("Failed to parse subscription data:", subDataResult.error);
      throw new Error("Failed to parse subscription data");
    }

    const subData = subDataResult.data;

    if (companyId) {
      const companyPlanData: Database["public"]["Tables"]["companyPlan"]["Insert"] =
        {
          id: companyId,
          planId: plan.data.id,
          tasksLimit: plan.data.tasksLimit,
          aiTokensLimit: plan.data.aiTokensLimit,
          usersLimit: 10, // Default value as defined in the migration
          stripeSubscriptionStatus: (subData.cancelAtPeriodEnd
            ? "Canceled"
            : ["active", "trialing"].includes(subData.status)
            ? "Active"
            : "Inactive") as "Active" | "Inactive" | "Canceled",
          stripeCustomerId: customerId,
          stripeSubscriptionId: subData.subscriptionId,
          subscriptionStartDate: new Date(
            subData.currentPeriodStart * 1000
          ).toISOString(),
        };

      const [, companyPlan] = await Promise.all([
        redis.set(customerKey, JSON.stringify(subData)),
        upsertCompanyPlan(companyPlanData),
        updateCompanyOwner(companyId, company.ownerId),
      ]);

      if (companyPlan.error) {
        console.error("Failed to upsert company plan:", companyPlan.error);
      }
    } else {
      console.error("no company id, skipping company plan upsert");
    }
  }
})().finally(async () => {
  redis.disconnect();
  await pgPool.end();
});

async function getSubscription(customerId: string) {
  const subscriptions = await stripe.subscriptions.list({
    customer: customerId,
    limit: 1,
    status: "all",
    expand: ["data.default_payment_method"],
  });

  return subscriptions.data[0];
}

type PlanRow = Database["public"]["Tables"]["plan"]["Row"];
type DbResult<T> = { data: T; error: null } | { data: null; error: Error };

async function getPlanByPriceId(priceId: string): Promise<DbResult<PlanRow>> {
  const result = await pgPool.query<PlanRow>(
    `SELECT * FROM "plan" WHERE "stripePriceId" = $1 LIMIT 1`,
    [priceId]
  );
  const plan = result.rows[0];

  if (!plan) {
    return {
      data: null,
      error: new Error(`No plan found for Stripe price ${priceId}`),
    };
  }

  return { data: plan, error: null };
}

async function updateCompanyOwner(companyId: string, ownerId: string) {
  try {
    await pgPool.query(`UPDATE company SET "ownerId" = $1 WHERE id = $2`, [
      ownerId,
      companyId,
    ]);
    return { error: null };
  } catch (error) {
    return { error };
  }
}

async function upsertCompanyPlan(
  companyPlan: Database["public"]["Tables"]["companyPlan"]["Insert"]
) {
  try {
    await pgPool.query(
      `
      INSERT INTO "companyPlan" (
        id,
        "planId",
        "tasksLimit",
        "aiTokensLimit",
        "usersLimit",
        "stripeSubscriptionStatus",
        "stripeCustomerId",
        "stripeSubscriptionId",
        "subscriptionStartDate"
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      ON CONFLICT (id)
      DO UPDATE SET
        "planId" = EXCLUDED."planId",
        "tasksLimit" = EXCLUDED."tasksLimit",
        "aiTokensLimit" = EXCLUDED."aiTokensLimit",
        "usersLimit" = EXCLUDED."usersLimit",
        "stripeSubscriptionStatus" = EXCLUDED."stripeSubscriptionStatus",
        "stripeCustomerId" = EXCLUDED."stripeCustomerId",
        "stripeSubscriptionId" = EXCLUDED."stripeSubscriptionId",
        "subscriptionStartDate" = EXCLUDED."subscriptionStartDate"
      `,
      [
        companyPlan.id,
        companyPlan.planId,
        companyPlan.tasksLimit,
        companyPlan.aiTokensLimit,
        companyPlan.usersLimit,
        companyPlan.stripeSubscriptionStatus,
        companyPlan.stripeCustomerId,
        companyPlan.stripeSubscriptionId,
        companyPlan.subscriptionStartDate,
      ]
    );
    return { error: null };
  } catch (error) {
    return { error };
  }
}
