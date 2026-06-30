import { Trans } from "@lingui/react/macro";
import type { DefaultAttachmentFile } from "./DefaultAttachmentsPanel";
import DefaultAttachmentsPanel from "./DefaultAttachmentsPanel";

type Props = {
  files: DefaultAttachmentFile[];
};

export default function CompanyDefaultAttachmentsCard({ files }: Props) {
  return (
    <DefaultAttachmentsPanel
      files={files}
      permission="settings"
      storagePathPrefix="default-attachments/company"
      title={<Trans>Default Attachments</Trans>}
      description={
        <Trans>
          Files attached here ride along on every purchase order email by
          default. Suppliers will receive them alongside the PO PDF.
        </Trans>
      }
    />
  );
}
