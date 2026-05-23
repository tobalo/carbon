import { invokeFunction } from "@carbon/auth/functions.server";
import { error, success } from "@carbon/auth";
import { requirePermissions } from "@carbon/auth/auth.server";
import { flash } from "@carbon/auth/session.server";
import type { ActionFunctionArgs } from "react-router";
import { redirect } from "react-router";
import { path } from "~/utils/path";

export async function action({ request, params }: ActionFunctionArgs) {
  const { client, companyId, userId } = await requirePermissions(request, {
    update: "inventory"
  });

  const { shipmentId } = params;
  if (!shipmentId) throw new Error("shipmentId not found");

  try {
    // Verify shipment is posted before allowing void
    const { data: shipment } = await client
      .from("shipment")
      .select("status")
      .eq("id", shipmentId)
      .eq("companyId", companyId)
      .single();

    if (!shipment) {
      throw redirect(
        path.to.shipments,
        await flash(
          request,
          error(new Error("Shipment not found"), "Invalid operation")
        )
      );
    }

    if (shipment.status !== "Posted") {
      throw redirect(
        path.to.shipmentDetails(shipmentId),
        await flash(
          request,
          error(
            new Error("Can only void posted shipments"),
            "Invalid operation"
          )
        )
      );
    }

    const voidShipment = await invokeFunction("post-shipment", {
      body: {
        type: "void",
        shipmentId: shipmentId,
        userId: userId,
        companyId: companyId
      },
    });

    if (voidShipment.error) {
      throw redirect(
        path.to.shipmentDetails(shipmentId),
        await flash(
          request,
          error(voidShipment.error, "Failed to void shipment")
        )
      );
    }

    return redirect(
      path.to.shipmentDetails(shipmentId),
      await flash(request, success("Shipment voided"))
    );
  } catch (err) {
    throw redirect(
      path.to.shipmentDetails(shipmentId),
      await flash(request, error(err, "Failed to void shipment"))
    );
  }
}
