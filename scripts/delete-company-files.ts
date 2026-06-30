import { removeObjects } from "@carbon/object-storage/server";

// The way I was doing this was doing a SELECT name FROM storage.objects WHERE name LIKE '<companyId>%' and then exporting as JSON, and copying the results here:
// It is necessary to do one run for the public bucket and one for the private bucket. Starting with the private bucket is recommended.

const files = [
  {
    name: "crul4qo4gfk5a5f8u160/logo-dark-icon.png",
  },
  {
    name: "crul4qo4gfk5a5f8u160/logo-dark.png",
  },
  {
    name: "crul4qo4gfk5a5f8u160/logo-light-icon.png",
  },
  {
    name: "crul4qo4gfk5a5f8u160/logo-light.png",
  },
  {
    name: "crul4qo4gfk5a5f8u160/logo.png",
  },
];

(async () => {
  // Batch files into groups of 50
  const batchSize = 50;
  const fileNames = files.map((file) => file.name);
  const batches: string[][] = [];

  for (let i = 0; i < fileNames.length; i += batchSize) {
    batches.push(fileNames.slice(i, i + batchSize));
  }

  console.log(
    `Processing ${batches.length} batches of up to ${batchSize} files each`
  );

  for (let i = 0; i < batches.length; i++) {
    const batch = batches[i];
    console.log(
      `Processing batch ${i + 1}/${batches.length} (${batch.length} files)`
    );

    await removeObjects("public", batch);

    console.log(`Successfully processed batch ${i + 1}`);
  }

  console.log("All files processed successfully");
})();
