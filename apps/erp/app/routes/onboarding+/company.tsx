import { assertIsPost, CarbonEdition, safeRedirect } from "@carbon/auth";
import { requirePermissions } from "@carbon/auth/auth.server";
import { getCarbonServiceClient } from "@carbon/auth/client.server";
import { setCompanyId } from "@carbon/auth/company.server";
import { updateCompanySession } from "@carbon/auth/session.server";
import { ValidatedForm, validationError, validator } from "@carbon/form";
import { trigger } from "@carbon/jobs";
import {
  Button,
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
  HStack,
  VStack
} from "@carbon/react";
import { Edition } from "@carbon/utils";
import { getLocalTimeZone } from "@internationalized/date";
import { Trans, useLingui } from "@lingui/react/macro";
import type { ActionFunctionArgs } from "react-router";
import { Link, redirect, useLoaderData } from "react-router";
import {
  AddressAutocomplete,
  Currency,
  Hidden,
  Input,
  Submit
} from "~/components/Form";
import { useOnboarding } from "~/hooks";
import { insertEmployeeJob } from "~/modules/people";
import { getLocationsList, upsertLocation } from "~/modules/resources";
import {
  getCompanies,
  getCompany,
  insertCompany,
  onboardingCompanyValidator,
  seedCompany,
  updateCompany
} from "~/modules/settings";

export async function loader({ request }: ActionFunctionArgs) {
  const { client, companyId } = await requirePermissions(request, {});

  const company = await getCompany(client, companyId ?? 1);

  if (company.error || !company.data) {
    return {
      company: null
    };
  }

  return { company: company.data };
}

export async function action({ request }: ActionFunctionArgs) {
  assertIsPost(request);
  const { client, userId } = await requirePermissions(request, {});
  const serviceClient = getCarbonServiceClient();

  // there are no entries in the userToCompany table which
  // dictates RLS for the company table

  const validation = await validator(onboardingCompanyValidator).validate(
    await request.formData()
  );

  if (validation.error) {
    return validationError(validation.error);
  }

  const { next, ...d } = validation.data;

  let companyId: string | undefined;
  let companyLookupClient = client;
  let setupClient = client;
  let createdCompany = false;

  const companies = await getCompanies(client, userId);
  if (companies.error) {
    console.error(companies.error);
    throw new Error("Fatal: failed to get companies");
  }
  const company = companies?.data?.[0];
  companyId = company?.id;

  if (companyId) {
    const companyUpdate = await updateCompany(client, companyId, {
      ...d,
      updatedBy: userId
    });
    if (companyUpdate.error) {
      console.error(companyUpdate.error);
      throw new Error("Fatal: failed to update company");
    }
  } else {
    const companyInsert = await insertCompany(serviceClient, d);
    if (companyInsert.error) {
      console.error(companyInsert.error);
      throw new Error("Fatal: failed to insert company");
    }

    companyId = companyInsert.data?.id;
    createdCompany = true;

    if (!companyId) {
      throw new Error("Fatal: failed to get company ID");
    }
    companyLookupClient = serviceClient;
    setupClient = serviceClient;
  }

  if (!companyId) {
    throw new Error("Fatal: failed to get company ID");
  }

  const seed = await seedCompany(serviceClient, companyId, userId);
  if (seed.error) {
    console.error(seed.error);
    throw new Error("Fatal: failed to seed company");
  }

  if (createdCompany && CarbonEdition === Edition.Cloud) {
    trigger("onboard", {
      type: "lead",
      companyId,
      userId
    });
  }

  // biome-ignore lint/correctness/noUnusedVariables: suppressed due to migration
  const { baseCurrencyCode, website, ...locationData } = d;
  const locations = await getLocationsList(setupClient, companyId);
  if (locations.error) {
    console.error(locations.error);
    throw new Error("Fatal: failed to get locations");
  }

  const location = locations.data?.[0];
  const locationResult = location
    ? await upsertLocation(setupClient, {
        ...location,
        ...locationData,
        companyId,
        timezone: getLocalTimeZone(),
        updatedBy: userId
      })
    : await upsertLocation(setupClient, {
        ...locationData,
        name: "Headquarters",
        companyId,
        timezone: getLocalTimeZone(),
        createdBy: userId
      });

  if (locationResult.error) {
    console.error(locationResult.error);
    throw new Error("Fatal: failed to upsert location");
  }

  const locationId = location?.id ?? locationResult.data?.id;
  if (!locationId) {
    throw new Error("Fatal: failed to get location ID");
  }

  const existingJob = await setupClient
    .from("employeeJob")
    .select("id")
    .eq("id", userId)
    .eq("companyId", companyId)
    .maybeSingle();
  if (existingJob.error) {
    console.error(existingJob.error);
    throw new Error("Fatal: failed to get employee job");
  }

  if (!existingJob.data) {
    const job = await insertEmployeeJob(setupClient, {
      id: userId,
      companyId,
      locationId
    });

    if (job.error) {
      console.error(job.error);
      throw new Error("Fatal: failed to insert job");
    }
  }

  const { data: companyRecord } = await companyLookupClient
    .from("company")
    .select("companyGroupId")
    .eq("id", companyId!)
    .single();

  const sessionCookie = await updateCompanySession(
    request,
    companyId!,
    companyRecord?.companyGroupId ?? ""
  );
  const companyIdCookie = setCompanyId(companyId!);

  throw redirect(safeRedirect(next), {
    headers: [
      ["Set-Cookie", sessionCookie],
      ["Set-Cookie", companyIdCookie]
    ]
  });
}

export default function OnboardingCompany() {
  const { t } = useLingui();
  const { company } = useLoaderData<typeof loader>();
  const { next, previous } = useOnboarding();

  const initialValues = {
    name: company?.name ?? "",
    addressLine1: company?.addressLine1 ?? "",
    city: company?.city ?? "",
    stateProvince: company?.stateProvince ?? "",
    postalCode: company?.postalCode ?? "",
    countryCode: company?.countryCode ?? "US",
    baseCurrencyCode: company?.baseCurrencyCode ?? "USD"
  };

  return (
    <Card className="max-w-lg">
      <ValidatedForm
        validator={onboardingCompanyValidator}
        defaultValues={initialValues}
        method="post"
      >
        <CardHeader>
          <CardTitle>
            <Trans>Now let's set up your company</Trans>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Hidden name="next" value={next} />
          <VStack spacing={4}>
            <Input autoFocus name="name" label={t`Company Name`} />
            <AddressAutocomplete />
            <Input name="website" label={t`Website`} />
            <Currency name="baseCurrencyCode" label={t`Base Currency`} />
          </VStack>
        </CardContent>

        <CardFooter>
          <HStack>
            <Button
              variant="solid"
              isDisabled={!previous}
              size="md"
              asChild
              tabIndex={-1}
            >
              <Link to={previous} prefetch="intent">
                <Trans>Previous</Trans>
              </Link>
            </Button>
            <Submit>
              <Trans>Next</Trans>
            </Submit>
          </HStack>
        </CardFooter>
      </ValidatedForm>
    </Card>
  );
}
