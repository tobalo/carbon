import { invokeFunction } from "@carbon/auth/functions.server";
import { requirePermissions } from "@carbon/auth/auth.server";
import { onShapeDataValidator } from "@carbon/ee/onshape";
import { nanoid } from "nanoid";
import type { ActionFunctionArgs } from "react-router";
import { data } from "react-router";

export async function action({ request }: ActionFunctionArgs) {
  const { client, companyId, userId } = await requirePermissions(request, {
    update: "parts"
  });

  const formData = await request.formData();
  const documentId = formData.get("documentId");
  const versionId = formData.get("versionId");
  const elementId = formData.get("elementId");

  const makeMethodId = formData.get("makeMethodId");
  const rows = formData.get("rows");

  if (
    typeof documentId !== "string" ||
    typeof versionId !== "string" ||
    typeof elementId !== "string" ||
    typeof makeMethodId !== "string" ||
    typeof rows !== "string"
  ) {
    return data(
      { success: false, message: "Missing required fields" },
      { status: 400 }
    );
  }

  const record = await client
    .from("makeMethod")
    .select("itemId, companyId")
    .eq("id", makeMethodId)
    .single();

  if (record.data?.companyId !== companyId) {
    return data(
      { success: false, message: "Invalid make method id" },
      { status: 400 }
    );
  }

  try {
    const parsed = onShapeDataValidator.parse(JSON.parse(rows));

    const sync = await invokeFunction("sync", {
      body: {
        type: "onshape",
        makeMethodId,
        data: parsed,
        companyId,
        userId
      },
    });

    if (sync.error) {
      console.log("Failed to sync onshape data", sync.error);
      return data(
        { success: false, message: "Failed to sync onshape data" },
        { status: 400 }
      );
    }

    const itemId = record.data?.itemId as string;

    const deleteMapping = await client
      .from("externalIntegrationMapping")
      .delete()
      .eq("entityType", "item")
      .eq("entityId", itemId)
      .eq("integration", "onshape")
      .eq("companyId", companyId);

    if (deleteMapping.error) {
      console.error("Failed to clear Onshape mapping", deleteMapping.error);
      return data(
        { success: false, message: "Failed to save Onshape mapping" },
        { status: 500 }
      );
    }

    const now = new Date().toISOString();
    const saveMapping = await client.from("externalIntegrationMapping").insert({
      id: nanoid(),
      entityType: "item",
      entityId: itemId,
      integration: "onshape",
      metadata: {
        documentId,
        versionId,
        elementId
      },
      lastSyncedAt: now,
      companyId,
      allowDuplicateExternalId: false,
      createdAt: now,
      createdBy: userId,
      updatedAt: now
    });

    if (saveMapping.error) {
      console.error("Failed to save Onshape mapping", saveMapping.error);
      return data(
        { success: false, message: "Failed to save Onshape mapping" },
        { status: 500 }
      );
    }
  } catch (error) {
    console.error("Failed to sync onshape data", error);
    return data(
      { success: false, message: "Invalid rows data" },
      { status: 400 }
    );
  }

  return { success: true, message: "Synced successfully" };
}
