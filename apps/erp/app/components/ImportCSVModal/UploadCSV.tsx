import {
  cn,
  ModalBody,
  ModalDescription,
  ModalHeader,
  ModalTitle,
  Spinner,
  toast
} from "@carbon/react";
import { Trans, useLingui } from "@lingui/react/macro";
import { nanoid } from "nanoid";
import Papa from "papaparse";
import { useState } from "react";
import { flushSync } from "react-dom";
import { useDropzone } from "react-dropzone";
import { useUser } from "~/hooks/useUser";
import type { importSchemas } from "~/modules/shared";
import { uploadStorageObject } from "~/utils/storage";
import { useCsvContext } from "./useCsvContext";

export const UploadCSV = ({ table }: { table: keyof typeof importSchemas }) => {
  const { t } = useLingui();
  const { company } = useUser();
  const { setFile, setFileColumns, setFirstRows, setFilePath } =
    useCsvContext();
  const [uploading, setUploading] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const processFile = async (file: File) => {
    if (!file) {
      setFileColumns(null);
      return;
    }

    flushSync(() => {
      setLoading(true);
    });

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      error: (error) => {
        setError(error.message);
        setFileColumns(null);
        setFirstRows(null);
        setLoading(false);
      },
      complete: (results) => {
        const { data, meta } = results;

        if (!data || data.length < 2) {
          setError(t`CSV file must have at least 2 rows.`);
          setFileColumns(null);
          setFirstRows(null);
          setLoading(false);
          return;
        }

        if (!meta || !meta.fields || meta.fields.length <= 1) {
          setError(t`Failed to retrieve CSV column data.`);
          setFileColumns(null);
          setFirstRows(null);
          setLoading(false);
          return;
        }

        setFileColumns(meta.fields);
        setFirstRows(data as Record<string, string>[]);
        setLoading(false);
      }
    });
  };

  const uploadFile = async (file: File) => {
    toast.info(t`Uploading ${file.name}`);
    const fileName = `${company.id}/imports/${nanoid()}.csv`;

    const { data, error } = await uploadStorageObject({
      bucket: "private",
      path: fileName,
      file
    });

    if (error || !data?.path) {
      setError(t`Failed to upload CSV file.`);
      setFileColumns(null);
      setFirstRows(null);
      setLoading(false);
      return;
    }

    setFilePath(data.path);
  };

  const onDrop = async (acceptedFiles: File[]) => {
    if (acceptedFiles.length > 0) {
      flushSync(() => {
        setUploading(true);
      });

      if (acceptedFiles[0]) {
        setFile(acceptedFiles[0]);
        await Promise.all([
          processFile(acceptedFiles[0]),
          uploadFile(acceptedFiles[0])
        ]);
      }

      setUploading(false);
    }
  };

  const { getRootProps, getInputProps, isDragActive, isDragReject } =
    useDropzone({
      onDrop,
      accept: { "text/csv": [".csv"] },
      maxFiles: 1,
      maxSize: 5 * 1024 * 1024, // 5MB
      disabled: uploading
    });

  return (
    <>
      <ModalHeader>
        <ModalTitle>
          <Trans>Upload CSV</Trans>
        </ModalTitle>

        <ModalDescription>
          <Trans>Please upload a CSV file of your data</Trans>
        </ModalDescription>
      </ModalHeader>
      <ModalBody>
        <div
          {...getRootProps()}
          className={cn(
            "w-full border-2 border-dashed h-[200px] rounded-md mt-8 mb-8 flex items-center justify-center text-muted-foreground hover:border-primary hover:text-foreground cursor-pointer focus-visible:border-primary focus-visible:text-foreground hover:bg-primary/5 focus-visible:outline-none",
            isDragActive
              ? "border-primary text-foreground bg-primary/5"
              : "border-muted",
            isDragReject && "border-destructive"
          )}
        >
          <div className="text-center flex items-center justify-center flex-col text-xs">
            <input {...getInputProps()} />

            {loading ? (
              <div className="flex space-x-1 items-center">
                <Spinner />
                <span>
                  <Trans>Loading...</Trans>
                </span>
              </div>
            ) : (
              <div>
                <p>
                  <Trans>Drop your file here, or click to browse.</Trans>
                </p>
                <span>
                  <Trans>5MB file limit</Trans>
                </span>
              </div>
            )}

            {error && (
              <p className="text-center text-sm text-red-600 mt-4">{error}</p>
            )}
          </div>
        </div>
      </ModalBody>
    </>
  );
};
