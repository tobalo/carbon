import fs from "fs";

const companyId = "********************";
const apiKey = "crbn_******************";
const apiUrl = "https://rest.carbon.ms";

async function carbonFetch(path: string) {
  const response = await fetch(`${apiUrl}${path}`, {
    headers: {
      "carbon-key": apiKey,
    },
  });

  if (!response.ok) {
    throw new Error(
      `${response.status} ${response.statusText}: ${await response.text()}`
    );
  }

  return response;
}

(async () => {
  const params = new URLSearchParams({
    companyId: `eq.${companyId}`,
    limit: "1000",
    order: "createdAt.desc",
    select:
      "*, salesInvoiceLine(*), salesInvoiceShipment(*), customer!salesInvoice_customerId_fkey(name, tags)",
  });

  const response = await carbonFetch(`/salesInvoice?${params.toString()}`);
  const data = await response.json();

  if (data) {
    fs.writeFileSync(
      "sales-invoice-report.json",
      JSON.stringify(data, null, 2)
    );
  }
})();
