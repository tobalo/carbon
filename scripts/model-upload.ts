import { uploadObject } from "@carbon/object-storage/server";
import axios from "axios";
import crypto from "crypto";
import fs from "fs";
import path from "path";

const companyId = "N4Mk6kWM4ycK5Qj941axi4";
const apiKey = "crbn_JLN5eYtzfoIzdkncQo3uO";
const apiUrl = "http://localhost:3000/api/model/upload"; // https://app.carbon.ms/api/model/upload

const filePath = "~/Downloads/test.stl";

(async () => {
  const resolvedPath = filePath.replace("~", process.env.HOME!);
  const fileName = path.basename(resolvedPath);
  const fileExtension = path.extname(resolvedPath).slice(1);
  const fileBuffer = fs.readFileSync(resolvedPath);
  const fileSize = fs.statSync(resolvedPath).size;

  const modelId = crypto.randomUUID();
  const modelPath = `${companyId}/models/${modelId}.${fileExtension}`;

  // 1. Upload the file to object storage
  await uploadObject({
    bucket: "private",
    key: modelPath,
    body: fileBuffer,
    contentType: "application/octet-stream"
  });

  console.log("File uploaded to storage:", modelPath);

  // 2. POST the metadata to the API
  const formData = new FormData();
  formData.append("modelId", modelId);
  formData.append("name", fileName);
  formData.append("modelPath", modelPath);
  formData.append("size", String(fileSize));

  const response = await axios.post(apiUrl, formData, {
    headers: {
      "carbon-key": apiKey
    }
  });

  console.log(response.data);
})();
