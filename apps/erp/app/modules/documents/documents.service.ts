import type { QueryDatabase } from "@carbon/database/schema";
import type {
  CarbonDatabaseClient,
  QueryError
} from "@carbon/database/query-client";
import type { z } from "zod";
import type { GenericQueryFilters } from "~/utils/query";
import { setGenericQueryFilters } from "~/utils/query";
import { sanitize } from "@carbon/utils";
import { getDocumentType } from "../shared/shared.service";
import type {
  documentLabelsValidator,
  documentSourceTypes,
  documentValidator
} from "./documents.models";

const documentAccessColumns = {
  read: "readGroups",
  write: "writeGroups"
} as const;

type DocumentAccessMode = keyof typeof documentAccessColumns;

function failedResult<T>(error: QueryError) {
  return {
    data: null as T,
    error,
    count: 0
  };
}

async function getDocumentAccessIds(
  client: CarbonDatabaseClient<QueryDatabase>,
  userId: string
) {
  const groups = await client.rpc("groups_for_user", { uid: userId });
  if (groups.error) return failedResult<string[]>(groups.error);

  const rawGroupIds = Array.isArray(groups.data)
    ? (groups.data as unknown[])
    : [];
  const groupIds = rawGroupIds.filter(
    (group): group is string => typeof group === "string" && group.length > 0
  );

  return {
    data: Array.from(new Set([userId, ...groupIds])),
    error: null,
    count: groupIds.length + 1
  };
}

async function requireDocumentAccess(
  client: CarbonDatabaseClient<QueryDatabase>,
  documentId: string,
  userId: string,
  mode: DocumentAccessMode
) {
  const document = await getDocument(client, documentId, userId, mode);
  if (document.error) return document.error;
  return null;
}

export async function deleteDocument(
  client: CarbonDatabaseClient<QueryDatabase>,
  id: string,
  userId?: string
) {
  if (userId) {
    const accessError = await requireDocumentAccess(client, id, userId, "write");
    if (accessError) return failedResult<null>(accessError);
  }

  return client.from("document").delete().eq("id", id);
}

export async function deleteDocumentFavorite(
  client: CarbonDatabaseClient<QueryDatabase>,
  id: string,
  userId: string
) {
  const accessError = await requireDocumentAccess(client, id, userId, "read");
  if (accessError) return failedResult<null>(accessError);

  return client
    .from("documentFavorite")
    .delete()
    .eq("documentId", id)
    .eq("userId", userId);
}

export async function deleteDocumentLabel(
  client: CarbonDatabaseClient<QueryDatabase>,
  id: string,
  label: string,
  userId?: string
) {
  if (userId) {
    const accessError = await requireDocumentAccess(client, id, userId, "read");
    if (accessError) return failedResult<null>(accessError);
  }

  let query = client
    .from("documentLabel")
    .delete()
    .eq("documentId", id)
    .eq("label", label);

  if (userId) {
    query = query.eq("userId", userId);
  }

  return query;
}

export async function getDocument(
  client: CarbonDatabaseClient<QueryDatabase>,
  documentId: string,
  userId?: string,
  mode: DocumentAccessMode = "read"
) {
  let query = client.from("documents").select("*").eq("id", documentId);

  if (userId) {
    const accessIds = await getDocumentAccessIds(client, userId);
    if (accessIds.error) return failedResult(accessIds.error);

    query = query.overlaps(documentAccessColumns[mode], accessIds.data);
  }

  return query.single();
}

export async function canReadDocumentPath(
  client: CarbonDatabaseClient<QueryDatabase>,
  path: string,
  userId: string
) {
  const document = await client
    .from("documents")
    .select("id")
    .eq("path", path)
    .maybeSingle();

  if (document.error) return failedResult<boolean>(document.error);

  const documentId = (document.data as { id?: string } | null)?.id;
  if (!documentId) {
    return {
      data: true,
      error: null,
      count: 0
    };
  }

  const readable = await getDocument(client, documentId, userId, "read");
  if (readable.error) return failedResult<boolean>(readable.error);

  return {
    data: true,
    error: null,
    count: 1
  };
}

export async function getDocuments(
  client: CarbonDatabaseClient<QueryDatabase>,
  companyId: string,
  args: GenericQueryFilters & {
    search: string | null;
    favorite?: boolean;
    recent?: boolean;
    createdBy?: string;
    userId?: string;
    active: boolean;
  },
  userId = args.userId
) {
  let query = client
    .from("documents")
    .select("*", {
      count: "exact"
    })
    .eq("companyId", companyId)
    .eq("active", args.active);

  if (args?.search) {
    query = query.or(
      `name.ilike.%${args.search}%,description.ilike.%${args.search}%`
    );
  }

  if (args?.favorite) {
    query = query.eq("favorite", true);
  }

  if (args.createdBy) {
    query = query.eq("createdBy", args.createdBy);
  }

  if (args.recent) {
    query = query.order("lastActivityAt", { ascending: false });
  }

  if (userId) {
    const accessIds = await getDocumentAccessIds(client, userId);
    if (accessIds.error) {
      return {
        data: [],
        error: accessIds.error,
        count: 0
      };
    }

    query = query.overlaps("readGroups", accessIds.data);
  }

  query = setGenericQueryFilters(query, args, [
    { column: "favorite", ascending: false }
  ]);

  return query;
}

export async function getDocumentExtensions(client: CarbonDatabaseClient<QueryDatabase>) {
  return client.from("documentExtensions").select("extension");
}

export async function getDocumentLabels(
  client: CarbonDatabaseClient<QueryDatabase>,
  userId: string
) {
  return client.from("documentLabels").select("*").eq("userId", userId);
}

export async function insertDocumentFavorite(
  client: CarbonDatabaseClient<QueryDatabase>,
  id: string,
  userId: string
) {
  const accessError = await requireDocumentAccess(client, id, userId, "read");
  if (accessError) return failedResult<null>(accessError);

  return client.from("documentFavorite").insert({ documentId: id, userId });
}

export async function insertDocumentLabel(
  client: CarbonDatabaseClient<QueryDatabase>,
  id: string,
  label: string,
  userId: string
) {
  const accessError = await requireDocumentAccess(client, id, userId, "read");
  if (accessError) return failedResult<null>(accessError);

  return client.from("documentLabel").insert({ documentId: id, label, userId });
}

export async function moveDocumentToTrash(
  client: CarbonDatabaseClient<QueryDatabase>,
  id: string,
  userId: string
) {
  const accessError = await requireDocumentAccess(client, id, userId, "write");
  if (accessError) return failedResult<null>(accessError);

  return client
    .from("document")
    .update({
      active: false,
      updatedBy: userId,
      updatedAt: new Date().toISOString()
    })
    .eq("id", id);
}

export async function restoreDocument(
  client: CarbonDatabaseClient<QueryDatabase>,
  id: string,
  userId: string
) {
  const accessError = await requireDocumentAccess(client, id, userId, "write");
  if (accessError) return failedResult<null>(accessError);

  return client
    .from("document")
    .update({
      active: true,
      updatedBy: userId,
      updatedAt: new Date().toISOString()
    })
    .eq("id", id);
}

type SourceDocumentData = {
  sourceDocument?: (typeof documentSourceTypes)[number];
  sourceDocumentId?: string;
};

export async function upsertDocument(
  client: CarbonDatabaseClient<QueryDatabase>,
  document:
    | (Omit<z.infer<typeof documentValidator>, "id"> & {
        path: string;
        size: number;
        companyId: string;
        createdBy: string;
      } & SourceDocumentData)
    | (Omit<z.infer<typeof documentValidator>, "id"> & {
        id: string;
        updatedBy: string;
      })
) {
  const type = getDocumentType(document.name ?? "");
  if ("createdBy" in document) {
    return (
      client
        .from("document")
        // @ts-ignore
        .insert({ ...document, type })
        .select("*")
        .single()
    );
  }

  // biome-ignore lint/correctness/noUnusedVariables: suppressed due to migration
  const { extension, ...data } = document;
  const accessError = await requireDocumentAccess(
    client,
    document.id,
    document.updatedBy,
    "write"
  );
  if (accessError) return failedResult<null>(accessError);

  return client
    .from("document")
    .update(
      sanitize({
        ...data,
        type,
        updatedAt: new Date().toISOString()
      })
    )
    .eq("id", document.id);
}

export async function updateDocumentFavorite(
  client: CarbonDatabaseClient<QueryDatabase>,
  args: {
    id: string;
    favorite: boolean;
    userId: string;
  }
) {
  const { id, favorite, userId } = args;
  const accessError = await requireDocumentAccess(client, id, userId, "read");
  if (accessError) return failedResult<null>(accessError);

  if (!favorite) {
    return client
      .from("documentFavorite")
      .delete()
      .eq("documentId", id)
      .eq("userId", userId);
  } else {
    return client
      .from("documentFavorite")
      .insert({ documentId: id, userId: userId });
  }
}

export async function updateDocumentLabels(
  client: CarbonDatabaseClient<QueryDatabase>,
  document: z.infer<typeof documentLabelsValidator> & {
    userId: string;
  }
) {
  if (!document.labels) {
    throw new Error("No labels provided");
  }

  const accessError = await requireDocumentAccess(
    client,
    document.documentId,
    document.userId,
    "read"
  );
  if (accessError) return failedResult<null>(accessError);

  const deleteLabels = await client
    .from("documentLabel")
    .delete()
    .eq("documentId", document.documentId)
    .eq("userId", document.userId);

  if (deleteLabels.error || document.labels.length === 0) return deleteLabels;

  return client.from("documentLabel").insert(
    // @ts-ignore
    document.labels.map((label) => ({
      documentId: document.documentId,
      label,
      userId: document.userId
    }))
  );
}
