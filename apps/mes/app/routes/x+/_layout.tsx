import {
  CarbonEdition,
  CarbonProvider,
  CONTROLLED_ENVIRONMENT,
  getCarbon,
  getCompanies,
  getUser
} from "@carbon/auth";
import { requirePermissions } from "@carbon/auth/auth.server";
import type { DatabaseQueryClient } from "@carbon/database/query-client";
import {
  destroyAuthSession,
  requireAuthSession
} from "@carbon/auth/session.server";
import {
  ItarPopup,
  SidebarProvider,
  TooltipProvider,
  useKeyboardWedge,
  useMount,
  useNProgress
} from "@carbon/react";
import { getStripeCustomerByCompanyId } from "@carbon/stripe/stripe.server";
import { Edition } from "@carbon/utils";
import posthog from "posthog-js";
import { Suspense } from "react";
import type {
  LoaderFunctionArgs,
  MiddlewareFunction,
  ShouldRevalidateFunction
} from "react-router";
import {
  Await,
  data,
  Outlet,
  redirect,
  useLoaderData,
  useNavigate
} from "react-router";
import { AppSidebar } from "~/components";
import { ConsolePill } from "~/components/ConsolePill";
import { PinInOverlay } from "~/components/PinInOverlay";
import PollingDataProvider from "~/components/PollingDataProvider";
import { TimeCardWarning } from "~/components/TimeCardWarning";
import { userContext } from "~/context";
import { userMiddleware } from "~/middleware/user";
import { refreshConsolePinIn } from "~/services/console.server";
import { getActiveMaintenanceEventsCount } from "~/services/maintenance.service";
import {
  getActiveJobCount,
  getLocationsByCompany
} from "~/services/operations.service";
import { getOpenClockEntry } from "~/services/people.service";
import { ERP_URL, MES_URL, path } from "~/utils/path";

export const shouldRevalidate: ShouldRevalidateFunction = ({
  currentUrl,
  defaultShouldRevalidate
}) => {
  if (
    currentUrl.pathname.startsWith("/refresh-session") ||
    currentUrl.pathname.startsWith("/switch-company")
  ) {
    return true;
  }

  return defaultShouldRevalidate;
};

export const middleware: MiddlewareFunction[] = [userMiddleware];

export async function loader({ request, context }: LoaderFunctionArgs) {
  const { accessToken, companyId, expiresAt, expiresIn, userId } =
    await requireAuthSession(request, { verify: true });
  const { userId: authorizedUserId } = await requirePermissions(request, {});

  // share a client between requests
  const client = getCarbon(accessToken, userId);
  const queryClient = client as unknown as DatabaseQueryClient;

  // parallelize the requests
  const [companies, user] = await Promise.all([
    getCompanies(client, userId),
    getUser(client, userId)
  ]);

  if (user.error || !user.data) {
    await destroyAuthSession(request);
  }

  const company = companies.data?.find(
    (c: { companyId: string }) => c.companyId === companyId
  );
  if (!company) {
    throw redirect(path.to.accountSettings);
  }

  // Get the location and console state from middleware context
  const ctx = context.get(userContext);
  const locationId = ctx?.locationId;
  const consoleMode = ctx?.consoleMode ?? false;
  const pinnedInUser = ctx?.pinnedInUser ?? null;
  const effectiveUserId = ctx?.effectiveUserId ?? authorizedUserId;

  let [
    companyPlan,
    locations,
    activeEvents,
    companySettings,
    openClockEntry,
    locationEmployees
  ] = await Promise.all([
    getStripeCustomerByCompanyId(companyId, userId),
    getLocationsByCompany(queryClient, companyId),
    getActiveJobCount(queryClient, {
      employeeId: effectiveUserId,
      companyId
    }),
    client
      .from("companySettings")
      .select("timeCardEnabled, consoleEnabled")
      .eq("id", companyId)
      .single(),
    getOpenClockEntry(queryClient, effectiveUserId, companyId),
    // Get employees at current location for console mode pin-in filtering
    consoleMode && locationId
      ? queryClient
          .from("employeeJob")
          .select("id")
          .eq("locationId", locationId)
          .eq("companyId", companyId)
      : Promise.resolve({ data: [] as { id: string }[] })
  ]);

  const locationEmployeeIds =
    locationEmployees.data?.map((e: { id: string }) => e.id) ?? [];
  const timeCardEnabled =
    (companySettings.data as any)?.timeCardEnabled ?? false;
  const consoleEnabled = (companySettings.data as any)?.consoleEnabled ?? false;

  // Get active maintenance count after we have the location
  const activeMaintenanceCount = await getActiveMaintenanceEventsCount(
    queryClient,
    locationId
  );

  if (!companyPlan && CarbonEdition === Edition.Cloud) {
    throw redirect(path.to.onboarding);
  }

  if (!locations.data || locations.data.length === 0) {
    throw new Error(`No locations found for ${company.name}`);
  }

  // Sliding window: refresh pin-in cookie on every page load
  const headers = new Headers();
  if (pinnedInUser && ctx) {
    headers.append(
      "Set-Cookie",
      refreshConsolePinIn(companyId, {
        userId: pinnedInUser.userId,
        name: pinnedInUser.name,
        avatarUrl: pinnedInUser.avatarUrl,
        pinnedAt: Date.now()
      })
    );
  }

  return data(
    {
      session: {
        accessToken,
        expiresIn,
        expiresAt
      },
      activeEvents: activeEvents.data ?? 0,
      activeMaintenanceCount: activeMaintenanceCount.count ?? 0,
      company,
      companies: companies.data ?? [],
      consoleEnabled,
      consoleMode: consoleEnabled && consoleMode,
      location: locationId,
      locationEmployeeIds,
      locations: locations.data ?? [],
      openClockEntry: openClockEntry?.data
        ? getOpenClockEntry(queryClient, userId, companyId)
        : null,
      effectiveUserId,
      pinnedInUser,
      plan: companyPlan?.planId,
      timeCardEnabled,
      user: user.data
    },
    headers.has("Set-Cookie") ? { headers } : undefined
  );
}

export default function AuthenticatedRoute() {
  const {
    session,
    activeEvents,
    activeMaintenanceCount,
    company,
    companies,
    consoleEnabled,
    consoleMode,
    location,
    locationEmployeeIds,
    locations,
    openClockEntry,
    pinnedInUser,
    timeCardEnabled,
    user
  } = useLoaderData<typeof loader>();

  const navigate = useNavigate();

  useNProgress();
  useKeyboardWedge({
    test: (input) =>
      (input.startsWith(MES_URL) || input.startsWith(ERP_URL)) &&
      !input.includes("/kanban/complete/"), // we handle this more gracefully in JobOperation
    callback: (input) => {
      try {
        const url = new URL(input);
        navigate(url.pathname + url.search);
      } catch {
        navigate(input);
      }
    }
  });

  useMount(() => {
    posthog.identify(user?.id, {
      email: user?.email,
      name: `${user?.firstName} ${user?.lastName}`
    });
  });

  return (
    <div className="h-screen w-screen overflow-y-auto md:overflow-hidden">
      {user?.acknowledgedITAR === false && CONTROLLED_ENVIRONMENT ? (
        <ItarPopup
          acknowledgeAction={path.to.acknowledge}
          logoutAction={path.to.logout}
        />
      ) : (
        <CarbonProvider session={session}>
          <PollingDataProvider>
            <SidebarProvider defaultOpen={false}>
              <TooltipProvider delayDuration={0}>
                <AppSidebar
                  activeEvents={activeEvents}
                  activeMaintenanceCount={activeMaintenanceCount}
                  company={company}
                  companies={companies}
                  consoleEnabled={consoleEnabled}
                  consoleMode={consoleMode}
                  location={location}
                  locations={locations}
                  openClockEntry={openClockEntry}
                  pinnedInUser={pinnedInUser}
                  timeCardEnabled={timeCardEnabled}
                />
                <Outlet />
                {timeCardEnabled && (
                  <Suspense fallback={null}>
                    <Await resolve={openClockEntry}>
                      {(resolved) => (
                        <TimeCardWarning
                          openClockEntry={
                            resolved?.data
                              ? {
                                  id: resolved.data.id,
                                  clockIn: resolved.data.clockIn
                                }
                              : null
                          }
                        />
                      )}
                    </Await>
                  </Suspense>
                )}
                {consoleMode && !pinnedInUser && (
                  <PinInOverlay
                    companyId={company.companyId!}
                    locationEmployeeIds={locationEmployeeIds}
                    sessionUserId={user?.id ?? ""}
                    hasPinnedUser={false}
                  />
                )}
                {consoleMode && pinnedInUser && (
                  <ConsolePill
                    user={pinnedInUser}
                    companyId={company.companyId!}
                    locationEmployeeIds={locationEmployeeIds}
                    sessionUserId={user?.id ?? ""}
                  />
                )}
              </TooltipProvider>
            </SidebarProvider>
          </PollingDataProvider>
        </CarbonProvider>
      )}
    </div>
  );
}
