import { CARBON_API_URL } from "@carbon/auth";
import {
  type ResolvedLabelLogo,
  resolveLabelLogo as resolve
} from "@carbon/documents/labels";
import type { DocumentTemplate } from "@carbon/documents/template";
import type { LabelSize } from "@carbon/utils";

export type { ResolvedLabelLogo };

/** Binds the shared label-logo resolver to this app's API URL. */
export function resolveLabelLogo(
  company: { logoLight?: string | null; logoLightIcon?: string | null } | null,
  template: DocumentTemplate | null,
  labelSize: LabelSize
): Promise<ResolvedLabelLogo | null> {
  return resolve(company, template, labelSize, {
    apiUrl: CARBON_API_URL ?? ""
  });
}
