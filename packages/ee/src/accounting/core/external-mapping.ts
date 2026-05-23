import { and, eq, sql, type DrizzleDb } from "@carbon/database/drizzle";
import { externalIntegrationMappingTable } from "@carbon/database/schema";

export interface ExternalIntegrationMapping {
  id: string;
  entityType: string;
  entityId: string;
  integration: string;
  externalId: string;
  allowDuplicateExternalId: boolean;
  companyId: string;
  metadata: Record<string, unknown> | null;
  lastSyncedAt: string | null;
  remoteUpdatedAt: string | null;
  createdAt: string;
  updatedAt: string;
  createdBy: string | null;
}

export interface LinkOptions {
  metadata?: Record<string, unknown>;
  remoteUpdatedAt?: Date | string;
  createdBy?: string;
  /**
   * When true, allows multiple Carbon entities to map to the same external ID.
   * Use this for many-to-one (Carbon to External) relationships.
   * Default: false (enforces unique external IDs per integration per company)
   */
  allowDuplicateExternalId?: boolean;
}

/**
 * Service for managing external integration mappings.
 * Provides a clean interface for linking Carbon entities to external system entities.
 */
export class ExternalIntegrationMappingService {
  constructor(
    private db: DrizzleDb,
    private companyId: string
  ) {}

  /**
   * Link a Carbon entity to an external system entity.
   * Uses upsert to handle both create and update cases.
   * If remoteUpdatedAt is not provided, it defaults to the current timestamp.
   */
  async link(
    entityType: string,
    entityId: string,
    integration: string,
    externalId: string,
    options?: LinkOptions
  ): Promise<void> {
    const now = new Date().toISOString();
    // Default to current timestamp if remoteUpdatedAt is not provided
    const remoteUpdatedAt =
      options?.remoteUpdatedAt instanceof Date
        ? options.remoteUpdatedAt.toISOString()
        : (options?.remoteUpdatedAt ?? now);
    const allowDuplicateExternalId = options?.allowDuplicateExternalId ?? false;

    await this.db
      .insert(externalIntegrationMappingTable)
      .values({
        id: crypto.randomUUID(),
        entityType,
        entityId,
        integration,
        externalId,
        allowDuplicateExternalId,
        companyId: this.companyId,
        metadata: options?.metadata ?? null,
        lastSyncedAt: now,
        remoteUpdatedAt,
        createdBy: options?.createdBy ?? null,
        createdAt: now,
        updatedAt: now
      })
      .onConflictDoUpdate({
        target: [
          externalIntegrationMappingTable.entityType,
          externalIntegrationMappingTable.entityId,
          externalIntegrationMappingTable.integration,
          externalIntegrationMappingTable.companyId
        ],
        set: {
          externalId,
          allowDuplicateExternalId,
          metadata: options?.metadata ?? null,
          lastSyncedAt: now,
          remoteUpdatedAt,
          updatedAt: now
        }
      });
  }

  /**
   * Unlink a Carbon entity from an external system.
   */
  async unlink(
    entityType: string,
    entityId: string,
    integration: string
  ): Promise<void> {
    await this.db
      .delete(externalIntegrationMappingTable)
      .where(
        and(
          eq(externalIntegrationMappingTable.entityType, entityType),
          eq(externalIntegrationMappingTable.entityId, entityId),
          eq(externalIntegrationMappingTable.integration, integration),
          eq(externalIntegrationMappingTable.companyId, this.companyId)
        )
      );
  }

  /**
   * Get the external ID for a Carbon entity.
   */
  async getExternalId(
    entityType: string,
    entityId: string,
    integration: string
  ): Promise<string | null> {
    const [mapping] = await this.db
      .select({ externalId: externalIntegrationMappingTable.externalId })
      .from(externalIntegrationMappingTable)
      .where(
        and(
          eq(externalIntegrationMappingTable.entityType, entityType),
          eq(externalIntegrationMappingTable.entityId, entityId),
          eq(externalIntegrationMappingTable.integration, integration),
          eq(externalIntegrationMappingTable.companyId, this.companyId)
        )
      )
      .limit(1);

    return mapping?.externalId ?? null;
  }

  /**
   * Get the Carbon entity ID for an external ID.
   */
  async getEntityId(
    integration: string,
    externalId: string,
    entityType?: string
  ): Promise<string | null> {
    const [mapping] = await this.db
      .select({ entityId: externalIntegrationMappingTable.entityId })
      .from(externalIntegrationMappingTable)
      .where(
        and(
          eq(externalIntegrationMappingTable.integration, integration),
          eq(externalIntegrationMappingTable.externalId, externalId),
          eq(externalIntegrationMappingTable.companyId, this.companyId),
          entityType
            ? eq(externalIntegrationMappingTable.entityType, entityType)
            : undefined
        )
      )
      .limit(1);
    return mapping?.entityId ?? null;
  }

  /**
   * Get the full mapping for a Carbon entity.
   */
  async getByEntity(
    entityType: string,
    entityId: string,
    integration: string
  ): Promise<ExternalIntegrationMapping | null> {
    const [mapping] = await this.db
      .select()
      .from(externalIntegrationMappingTable)
      .where(
        and(
          eq(externalIntegrationMappingTable.entityType, entityType),
          eq(externalIntegrationMappingTable.entityId, entityId),
          eq(externalIntegrationMappingTable.integration, integration),
          eq(externalIntegrationMappingTable.companyId, this.companyId)
        )
      )
      .limit(1);

    return (mapping as ExternalIntegrationMapping) ?? null;
  }

  /**
   * Get the full mapping for an external ID.
   */
  async getByExternalId(
    integration: string,
    externalId: string,
    entityType?: string
  ): Promise<ExternalIntegrationMapping | null> {
    const [mapping] = await this.db
      .select()
      .from(externalIntegrationMappingTable)
      .where(
        and(
          eq(externalIntegrationMappingTable.integration, integration),
          eq(externalIntegrationMappingTable.externalId, externalId),
          eq(externalIntegrationMappingTable.companyId, this.companyId),
          entityType
            ? eq(externalIntegrationMappingTable.entityType, entityType)
            : undefined
        )
      )
      .limit(1);
    return (mapping as ExternalIntegrationMapping) ?? null;
  }

  /**
   * Get all mappings for a Carbon entity (across all integrations).
   */
  async getAllByEntity(
    entityType: string,
    entityId: string
  ): Promise<ExternalIntegrationMapping[]> {
    const mappings = await this.db
      .select()
      .from(externalIntegrationMappingTable)
      .where(
        and(
          eq(externalIntegrationMappingTable.entityType, entityType),
          eq(externalIntegrationMappingTable.entityId, entityId),
          eq(externalIntegrationMappingTable.companyId, this.companyId)
        )
      );

    return mappings as ExternalIntegrationMapping[];
  }

  /**
   * Get all mappings for an integration.
   */
  async getAllByIntegration(
    integration: string,
    entityType?: string
  ): Promise<ExternalIntegrationMapping[]> {
    const mappings = await this.db
      .select()
      .from(externalIntegrationMappingTable)
      .where(
        and(
          eq(externalIntegrationMappingTable.integration, integration),
          eq(externalIntegrationMappingTable.companyId, this.companyId),
          entityType
            ? eq(externalIntegrationMappingTable.entityType, entityType)
            : undefined
        )
      );
    return mappings as ExternalIntegrationMapping[];
  }

  /**
   * Check if a mapping already exists and is up to date.
   * Returns true if the mapping exists and remoteUpdatedAt >= the provided timestamp.
   */
  async isUpToDate(
    integration: string,
    externalId: string,
    remoteUpdatedAt: Date
  ): Promise<boolean> {
    const mapping = await this.getByExternalId(integration, externalId);

    if (!mapping?.remoteUpdatedAt) {
      return false;
    }

    return new Date(mapping.remoteUpdatedAt) >= remoteUpdatedAt;
  }

  /**
   * Get entity IDs that don't have a mapping for a specific integration.
   * Useful for finding entities that need to be synced.
   */
  async getUnsyncedEntityIds(
    entityType: string,
    tableName: string,
    integration: string,
    limit: number
  ): Promise<string[]> {
    const result = await this.db.execute<{ id: string }>(sql`
      select t.id
      from ${sql.identifier(tableName)} t
      left join "externalIntegrationMapping" m
        on m."entityId" = t.id
        and m."entityType" = ${entityType}
        and m."integration" = ${integration}
        and m."companyId" = ${this.companyId}
      where t."companyId" = ${this.companyId}
        and m.id is null
      limit ${limit}
    `);

    return result.rows.map((r) => r.id);
  }

  /**
   * Update only the lastSyncedAt timestamp for a mapping.
   */
  async touchLastSyncedAt(
    entityType: string,
    entityId: string,
    integration: string
  ): Promise<void> {
    await this.db
      .update(externalIntegrationMappingTable)
      .set({
        lastSyncedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      })
      .where(
        and(
          eq(externalIntegrationMappingTable.entityType, entityType),
          eq(externalIntegrationMappingTable.entityId, entityId),
          eq(externalIntegrationMappingTable.integration, integration),
          eq(externalIntegrationMappingTable.companyId, this.companyId)
        )
      );
  }

  /**
   * Batch link multiple entities to external IDs.
   * If remoteUpdatedAt is not provided for a mapping, it defaults to the current timestamp.
   */
  async linkBatch(
    mappings: Array<{
      entityType: string;
      entityId: string;
      integration: string;
      externalId: string;
      options?: LinkOptions;
    }>
  ): Promise<void> {
    if (mappings.length === 0) return;

    const now = new Date().toISOString();

    const values = mappings.map((m) => ({
      id: crypto.randomUUID(),
      entityType: m.entityType,
      entityId: m.entityId,
      integration: m.integration,
      externalId: m.externalId,
      allowDuplicateExternalId: m.options?.allowDuplicateExternalId ?? false,
      companyId: this.companyId,
      metadata: m.options?.metadata ?? null,
      lastSyncedAt: now,
      // Default to current timestamp if remoteUpdatedAt is not provided
      remoteUpdatedAt:
        m.options?.remoteUpdatedAt instanceof Date
          ? m.options.remoteUpdatedAt.toISOString()
          : (m.options?.remoteUpdatedAt ?? now),
      createdBy: m.options?.createdBy ?? null,
      createdAt: now,
      updatedAt: now
    }));

    await this.db
      .insert(externalIntegrationMappingTable)
      .values(values)
      .onConflictDoUpdate({
        target: [
          externalIntegrationMappingTable.entityType,
          externalIntegrationMappingTable.entityId,
          externalIntegrationMappingTable.integration,
          externalIntegrationMappingTable.companyId
        ],
        set: {
          externalId: sql`excluded."externalId"`,
          allowDuplicateExternalId: sql`excluded."allowDuplicateExternalId"`,
          metadata: sql`excluded."metadata"`,
          lastSyncedAt: sql`excluded."lastSyncedAt"`,
          remoteUpdatedAt: sql`excluded."remoteUpdatedAt"`,
          updatedAt: sql`excluded."updatedAt"`
        }
      });
  }
}

/**
 * Create a new ExternalIntegrationMappingService instance.
 */
export function createMappingService(
  db: DrizzleDb,
  companyId: string
): ExternalIntegrationMappingService {
  return new ExternalIntegrationMappingService(db, companyId);
}
