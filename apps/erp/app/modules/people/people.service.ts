import type {
  Json,
  QueryDatabase
} from "@carbon/database/schema";
import type { CarbonDatabaseClient } from "@carbon/database/query-client";
import type { z } from "zod";
import type { DataType } from "~/modules/shared";
import type { Employee } from "~/modules/users";
import { getEmployees } from "~/modules/users/users.service";
import type { GenericQueryFilters } from "~/utils/query";
import { setGenericQueryFilters } from "~/utils/query";
import { sanitize } from "@carbon/utils";
import type {
  departmentValidator,
  employeeJobValidator,
  holidayValidator,
  shiftValidator
} from "./people.models";

export async function deleteAttribute(
  client: CarbonDatabaseClient<QueryDatabase>,
  attributeId: string
) {
  return client
    .from("userAttribute")
    .update({ active: false })
    .eq("id", attributeId);
}

export async function deleteAttributeCategory(
  client: CarbonDatabaseClient<QueryDatabase>,
  attributeCategoryId: string
) {
  return client
    .from("userAttributeCategory")
    .update({ active: false })
    .eq("id", attributeCategoryId);
}

export async function deleteDepartment(
  client: CarbonDatabaseClient<QueryDatabase>,
  departmentId: string
) {
  return client.from("department").delete().eq("id", departmentId);
}

export async function deleteHoliday(
  client: CarbonDatabaseClient<QueryDatabase>,
  holidayId: string
) {
  return client.from("holiday").delete().eq("id", holidayId);
}

export async function deleteShift(
  client: CarbonDatabaseClient<QueryDatabase>,
  shiftId: string
) {
  // TODO: Set all employeeShifts to null
  return client.from("shift").update({ active: false }).eq("id", shiftId);
}

export async function getAttribute(
  client: CarbonDatabaseClient<QueryDatabase>,
  attributeId: string,
  companyId: string
) {
  const attribute = await client
    .from("userAttribute")
    .select("*")
    .eq("id", attributeId)
    .eq("active", true)
    .single();

  if (attribute.error || !attribute.data) return attribute;

  const category = await client
    .from("userAttributeCategory")
    .select("name")
    .eq("id", attribute.data.userAttributeCategoryId)
    .eq("companyId", companyId)
    .eq("active", true)
    .single();

  if (category.error || !category.data) {
    return { ...attribute, data: null, error: category.error };
  }

  return {
    ...attribute,
    data: {
      ...attribute.data,
      userAttributeCategory: category.data
    }
  };
}

async function getAttributes(
  client: CarbonDatabaseClient<QueryDatabase>,
  companyId: string,
  userIds: string[]
) {
  return client
    .from("userAttributeCategory")
    .select(
      `*,
      userAttribute(id, name, listOptions, canSelfManage,
        attributeDataType(id, isBoolean, isDate, isNumeric, isText, isUser, isFile),
        userAttributeValue(
          id, userId, valueBoolean, valueDate, valueNumeric, valueText, valueUser, valueFile, user!userAttributeValue_userId_fkey(id, fullName, avatarUrl)
        )
      )`
    )
    .eq("companyId", companyId)
    .eq("userAttribute.active", true)
    .in("userAttribute.userAttributeValue.userId", userIds)
    .order("sortOrder", { foreignTable: "userAttribute", ascending: true });
}

export async function getAttributeCategories(
  client: CarbonDatabaseClient<QueryDatabase>,
  companyId: string,
  args?: { search: string | null } & GenericQueryFilters
) {
  let query = client
    .from("userAttributeCategory")
    .select("*", {
      count: "exact"
    })
    .eq("companyId", companyId)
    .eq("active", true);

  if (args?.search) {
    query = query.ilike("name", `%${args.search}%`);
  }

  if (args) {
    query = setGenericQueryFilters(query, args, [
      { column: "name", ascending: true }
    ]);
  }

  const categories = await query;
  if (categories.error || !categories.data) return categories;

  const categoryIds = categories.data.map((category) => category.id);
  const attributes =
    categoryIds.length > 0
      ? await client
          .from("userAttribute")
          .select("id, name, attributeDataTypeId, userAttributeCategoryId")
          .in("userAttributeCategoryId", categoryIds)
          .eq("active", true)
      : { data: [], error: null };

  if (attributes.error) {
    return { ...categories, data: [], error: attributes.error };
  }

  const dataTypeIds = Array.from(
    new Set(
      (attributes.data ?? [])
        .map((attribute) => attribute.attributeDataTypeId)
        .filter(Boolean)
    )
  );
  const dataTypes =
    dataTypeIds.length > 0
      ? await client.from("attributeDataType").select("id").in("id", dataTypeIds)
      : { data: [], error: null };

  if (dataTypes.error) {
    return { ...categories, data: [], error: dataTypes.error };
  }

  const dataTypesById = new Map(
    (dataTypes.data ?? []).map((dataType) => [dataType.id, dataType])
  );
  const attributesByCategoryId = new Map<string, any[]>();
  (attributes.data ?? []).forEach((attribute) => {
    const categoryAttributes =
      attributesByCategoryId.get(attribute.userAttributeCategoryId) ?? [];
    categoryAttributes.push({
      ...attribute,
      attributeDataType:
        dataTypesById.get(attribute.attributeDataTypeId) ?? null
    });
    attributesByCategoryId.set(
      attribute.userAttributeCategoryId,
      categoryAttributes
    );
  });

  return {
    ...categories,
    data: categories.data.map((category) => ({
      ...category,
      userAttribute: attributesByCategoryId.get(category.id) ?? []
    }))
  };
}

export async function getAttributeCategory(
  client: CarbonDatabaseClient<QueryDatabase>,
  id: string,
  companyId: string
) {
  const category = await client
    .from("userAttributeCategory")
    .select("*", { count: "exact" })
    .eq("id", id)
    .eq("companyId", companyId)
    .eq("active", true)
    .single();

  if (category.error || !category.data) return category;

  const attributes = await client
    .from("userAttribute")
    .select("id, name, sortOrder, attributeDataTypeId, userAttributeCategoryId")
    .eq("userAttributeCategoryId", id)
    .eq("active", true)
    .order("sortOrder", { ascending: true });

  if (attributes.error) {
    return { ...category, data: null, error: attributes.error };
  }

  const dataTypeIds = Array.from(
    new Set(
      (attributes.data ?? [])
        .map((attribute) => attribute.attributeDataTypeId)
        .filter(Boolean)
    )
  );
  const dataTypes =
    dataTypeIds.length > 0
      ? await client
          .from("attributeDataType")
          .select(
            "id, label, isBoolean, isDate, isList, isNumeric, isText, isUser, isFile"
          )
          .in("id", dataTypeIds)
      : { data: [], error: null };

  if (dataTypes.error) {
    return { ...category, data: null, error: dataTypes.error };
  }

  const dataTypesById = new Map(
    (dataTypes.data ?? []).map((dataType) => [dataType.id, dataType])
  );

  return {
    ...category,
    data: {
      ...category.data,
      userAttribute: (attributes.data ?? []).map((attribute) => ({
        ...attribute,
        attributeDataType:
          dataTypesById.get(attribute.attributeDataTypeId) ?? null
      }))
    }
  };
}

export async function getAttributeDataTypes(client: CarbonDatabaseClient<QueryDatabase>) {
  return client.from("attributeDataType").select("*");
}

export async function getDepartment(
  client: CarbonDatabaseClient<QueryDatabase>,
  departmentId: string
) {
  return client.from("department").select("*").eq("id", departmentId).single();
}

export async function getDepartments(
  client: CarbonDatabaseClient<QueryDatabase>,
  companyId: string,
  args?: GenericQueryFilters & { search: string | null }
) {
  let query = client
    .from("department")
    .select(`*, department(id, name)`, {
      count: "exact"
    })
    .eq("companyId", companyId);

  if (args?.search) {
    query = query.ilike("name", `%${args.search}%`);
  }

  if (args) {
    query = setGenericQueryFilters(query, args, [
      { column: "name", ascending: true }
    ]);
  }

  return query;
}

export async function getDepartmentsList(
  client: CarbonDatabaseClient<QueryDatabase>,
  companyId: string
) {
  return client
    .from("department")
    .select(`id, name`)
    .eq("companyId", companyId)
    .order("name");
}

export async function getDepartmentsTree(
  client: CarbonDatabaseClient<QueryDatabase>,
  companyId: string
) {
  return client
    .from("department")
    .select("id, name, parentDepartmentId")
    .eq("companyId", companyId)
    .order("name");
}

export async function getEmployeeJob(
  client: CarbonDatabaseClient<QueryDatabase>,
  employeeId: string,
  companyId: string
) {
  return client
    .from("employeeJob")
    .select("*")
    .eq("id", employeeId)
    .eq("companyId", companyId)
    .single();
}

export async function getEmployeeSummary(
  client: CarbonDatabaseClient<QueryDatabase>,
  employeeId: string,
  companyId: string
) {
  return client
    .from("employeeSummary")
    .select("*")
    .eq("id", employeeId)
    .eq("companyId", companyId)
    .single();
}

export async function getHoliday(
  client: CarbonDatabaseClient<QueryDatabase>,
  holidayId: string
) {
  return client.from("holiday").select("*").eq("id", holidayId).single();
}

export async function getHolidays(
  client: CarbonDatabaseClient<QueryDatabase>,
  companyId: string,
  args?: GenericQueryFilters & { search: string | null }
) {
  let query = client
    .from("holiday")
    .select("*", {
      count: "exact"
    })
    .eq("companyId", companyId);

  if (args?.search) {
    query = query.ilike("name", `%${args.search}%`);
  }

  if (args) {
    query = setGenericQueryFilters(query, args, [
      { column: "date", ascending: true }
    ]);
  }

  return query;
}

export function getHolidayYears(
  client: CarbonDatabaseClient<QueryDatabase>,
  companyId: string
) {
  return client.from("holidayYears").select("year").eq("companyId", companyId);
}

type UserAttributeId = string;

export type PersonAttributeValue = {
  userAttributeValueId: string;
  value: boolean | string | number;
  dataType?: DataType;
  user?: {
    id: string;
    fullName: string | null;
    avatarUrl: string | null;
  } | null;
};

type PersonAttributes = Record<UserAttributeId, PersonAttributeValue>;

type Person = Employee & {
  attributes: PersonAttributes;
};

export async function getPeople(
  client: CarbonDatabaseClient<QueryDatabase>,
  companyId: string,
  args: GenericQueryFilters & {
    search: string | null;
  }
) {
  const employees = await getEmployees(client, companyId, args);
  if (employees.error) return employees;

  if (!employees.data) throw new Error("Failed to get employee data");

  const userIds = employees.data.reduce<string[]>((acc, employee) => {
    if (employee.id) acc.push(employee.id);
    return acc;
  }, []);

  const attributeCategories = await getAttributes(client, companyId, userIds);
  if (attributeCategories.error) return attributeCategories;

  const people: Person[] = employees.data.map((employee) => {
    const userId = employee.id;

    const employeeAttributes =
      attributeCategories.data.reduce<PersonAttributes>((acc, category) => {
        if (!category.userAttribute || !Array.isArray(category.userAttribute))
          return acc;
        category.userAttribute.forEach(
          // @ts-ignore
          (attribute) => {
            if (
              attribute.userAttributeValue &&
              Array.isArray(attribute.userAttributeValue) &&
              !Array.isArray(attribute.attributeDataType)
            ) {
              const userAttributeId = attribute.id;
              const userAttributeValue = attribute.userAttributeValue.find(
                // @ts-ignore
                (attributeValue) => attributeValue.userId === userId
              );
              const value =
                typeof userAttributeValue?.valueBoolean === "boolean"
                  ? userAttributeValue.valueBoolean
                  : userAttributeValue?.valueDate ||
                    userAttributeValue?.valueNumeric ||
                    userAttributeValue?.valueText ||
                    userAttributeValue?.valueUser ||
                    userAttributeValue?.valueFile;

              if (value && userAttributeValue?.id) {
                acc[userAttributeId] = {
                  userAttributeValueId: userAttributeValue.id,
                  // @ts-ignore
                  dataType: attribute.attributeDataType?.id as DataType,
                  value,
                  user: !Array.isArray(userAttributeValue.user)
                    ? userAttributeValue.user
                    : undefined
                };
              }
            }
          }
        );
        return acc;
      }, {});

    return {
      ...employee,
      attributes: employeeAttributes
    };
  });

  return {
    count: employees.count,
    data: people,
    error: null
  };
}

export async function getContacts(
  client: CarbonDatabaseClient<QueryDatabase>,
  companyId: string,
  args: GenericQueryFilters & {
    search: string | null;
  }
) {
  let query = client
    .from("contact")
    .select("*", { count: "exact" })
    .eq("companyId", companyId);

  if (args.search) {
    query = query.or(
      `firstName.ilike.%${args.search}%,lastName.ilike.%${args.search}%,email.ilike.%${args.search}%`
    );
  }

  query = setGenericQueryFilters(query, args, [
    { column: "lastName", ascending: true }
  ]);

  const contacts = await query;

  if (!contacts.data) throw new Error("Failed to get contacts data");

  return {
    count: contacts.count,
    data: contacts.data,
    error: null
  };
}
export async function getShift(
  client: CarbonDatabaseClient<QueryDatabase>,
  shiftId: string
) {
  return client
    .from("shifts")
    .select("*")
    .eq("id", shiftId)
    .eq("active", true)
    .single();
}

export async function getShifts(
  client: CarbonDatabaseClient<QueryDatabase>,
  companyId: string,
  args: GenericQueryFilters & { search: string | null }
) {
  let query = client
    .from("shifts")
    .select("*", {
      count: "exact"
    })
    .eq("companyId", companyId)
    .eq("active", true);

  if (args?.search) {
    query = query.ilike("name", `%${args.search}%`);
  }

  query = setGenericQueryFilters(query, args, [
    { column: "locationId", ascending: true }
  ]);
  return query;
}

export async function getShiftsList(
  client: CarbonDatabaseClient<QueryDatabase>,
  locationId: string | null
) {
  let query = client.from("shift").select(`id, name`).eq("active", true);

  if (locationId) {
    query = query.eq("locationId", locationId);
  }

  return query.order("name");
}

export async function insertAttribute(
  client: CarbonDatabaseClient<QueryDatabase>,
  attribute: {
    name: string;
    attributeDataTypeId: number;
    userAttributeCategoryId: string;
    listOptions?: string[];
    canSelfManage: boolean;
    createdBy: string;
  }
) {
  // TODO: there's got to be a better way to get the max
  const sortOrders = await client
    .from("userAttribute")
    .select("sortOrder")
    .eq("userAttributeCategoryId", attribute.userAttributeCategoryId);

  if (sortOrders.error) return sortOrders;
  const maxSortOrder = sortOrders.data.reduce((max, item) => {
    return Math.max(max, item.sortOrder);
  }, 0);

  return client
    .from("userAttribute")
    .upsert([{ ...attribute, sortOrder: maxSortOrder + 1 }])
    .select("id")
    .single();
}

export async function insertAttributeCategory(
  client: CarbonDatabaseClient<QueryDatabase>,
  attributeCategory: {
    name: string;
    emoji?: string;
    public: boolean;
    companyId: string;
    createdBy: string;
  }
) {
  return client
    .from("userAttributeCategory")
    .upsert([attributeCategory])
    .select("id")
    .single();
}

export async function insertEmployeeJob(
  client: CarbonDatabaseClient<QueryDatabase>,
  job: {
    id: string;
    companyId: string;
    locationId?: string;
  }
) {
  return client.from("employeeJob").insert(job).select("*").single();
}

export async function updateAttribute(
  client: CarbonDatabaseClient<QueryDatabase>,
  attribute: {
    id?: string;
    name: string;
    listOptions?: string[];
    canSelfManage: boolean;
    updatedBy: string;
  }
) {
  if (!attribute.id) throw new Error("id is required");
  return client
    .from("userAttribute")
    .update(
      sanitize({
        name: attribute.name,
        listOptions: attribute.listOptions,
        canSelfManage: attribute.canSelfManage,
        updatedBy: attribute.updatedBy
      })
    )
    .eq("id", attribute.id);
}

export async function updateAttributeCategory(
  client: CarbonDatabaseClient<QueryDatabase>,
  attributeCategory: {
    id: string;
    name: string;
    emoji?: string;
    public: boolean;
    updatedBy: string;
  }
) {
  const { id, ...update } = attributeCategory;
  return client
    .from("userAttributeCategory")
    .update(sanitize(update))
    .eq("id", id);
}

export async function updateAttributeSortOrder(
  client: CarbonDatabaseClient<QueryDatabase>,
  updates: {
    id: string;
    sortOrder: number;
    updatedBy: string;
  }[]
) {
  const updatePromises = updates.map(({ id, sortOrder, updatedBy }) =>
    client.from("userAttribute").update({ sortOrder, updatedBy }).eq("id", id)
  );
  return Promise.all(updatePromises);
}

export async function updateEmployeeJob(
  client: CarbonDatabaseClient<QueryDatabase>,
  employeeId: string,
  employeeJob: z.infer<typeof employeeJobValidator> & {
    companyId: string;
    updatedBy: string;
    customFields?: Json;
  }
) {
  return client
    .from("employeeJob")
    .update(sanitize(employeeJob))
    .eq("id", employeeId)
    .eq("companyId", employeeJob.companyId);
}

export async function upsertDepartment(
  client: CarbonDatabaseClient<QueryDatabase>,
  department:
    | (Omit<z.infer<typeof departmentValidator>, "id"> & {
        companyId: string;
        createdBy: string;
        customFields?: Json;
      })
    | (Omit<z.infer<typeof departmentValidator>, "id"> & {
        id: string;
        updatedBy: string;
        customFields?: Json;
      })
) {
  if ("id" in department) {
    return client
      .from("department")
      .update(sanitize(department))
      .eq("id", department.id);
  }
  return client.from("department").insert(department).select("*").single();
}

export async function upsertHoliday(
  client: CarbonDatabaseClient<QueryDatabase>,
  holiday:
    | (Omit<z.infer<typeof holidayValidator>, "id"> & {
        companyId: string;
        createdBy: string;
        customFields?: Json;
      })
    | (Omit<z.infer<typeof holidayValidator>, "id"> & {
        id: string;
        updatedBy: string;
        customFields?: Json;
      })
) {
  if ("createdBy" in holiday) {
    return client.from("holiday").insert(holiday).select("*").single();
  }
  return client.from("holiday").update(sanitize(holiday)).eq("id", holiday.id);
}

export async function upsertShift(
  client: CarbonDatabaseClient<QueryDatabase>,
  shift:
    | (Omit<z.infer<typeof shiftValidator>, "id"> & {
        createdBy: string;
        companyId: string;
        customFields?: Json;
      })
    | (Omit<z.infer<typeof shiftValidator>, "id"> & {
        id: string;
        updatedBy: string;
        customFields?: Json;
      })
) {
  if ("createdBy" in shift) {
    return client.from("shift").insert([shift]).select("*").single();
  }
  return client.from("shift").update(sanitize(shift)).eq("id", shift.id);
}

export async function clockIn(
  client: CarbonDatabaseClient<QueryDatabase>,
  args: {
    employeeId: string;
    companyId: string;
    createdBy: string;
  }
) {
  const existing = await getOpenClockEntry(
    client,
    args.employeeId,
    args.companyId
  );
  if (existing.data) {
    return { data: null, error: { message: "Already clocked in" } };
  }

  return client.from("timeCardEntry").insert({
    employeeId: args.employeeId,
    companyId: args.companyId,
    createdBy: args.createdBy
  });
}

export async function clockOut(
  client: CarbonDatabaseClient<QueryDatabase>,
  args: {
    employeeId: string;
    companyId: string;
    updatedBy: string;
    clockOut?: string;
    note?: string;
  }
) {
  const open = await getOpenClockEntry(client, args.employeeId, args.companyId);
  if (!open.data) {
    return { data: null, error: { message: "Not currently clocked in" } };
  }

  return client
    .from("timeCardEntry")
    .update(
      sanitize({
        clockOut: args.clockOut ?? new Date().toISOString(),
        note: args.note,
        updatedBy: args.updatedBy,
        updatedAt: new Date().toISOString()
      })
    )
    .eq("id", open.data.id);
}

export async function createTimeCardEntry(
  client: CarbonDatabaseClient<QueryDatabase>,
  entry: {
    employeeId: string;
    companyId: string;
    clockIn: string;
    clockOut?: string | null;
    note?: string | null;
    createdBy: string;
  }
) {
  return client
    .from("timeCardEntry")
    .insert(sanitize(entry))
    .select("id")
    .single();
}

export async function deleteTimeCardEntry(
  client: CarbonDatabaseClient<QueryDatabase>,
  entryId: string
) {
  return client.from("timeCardEntry").delete().eq("id", entryId);
}

export async function getClockedInEmployees(
  client: CarbonDatabaseClient<QueryDatabase>,
  companyId: string
) {
  return client
    .from("timeCardEntries")
    .select("*")
    .eq("companyId", companyId)
    .is("clockOut", null)
    .order("clockIn", { ascending: true });
}

export async function getOpenClockEntry(
  client: CarbonDatabaseClient<QueryDatabase>,
  employeeId: string,
  companyId: string
) {
  return client
    .from("timeCardEntry")
    .select("*")
    .eq("employeeId", employeeId)
    .eq("companyId", companyId)
    .is("clockOut", null)
    .maybeSingle();
}

export async function getRecentTimecards(
  client: CarbonDatabaseClient<QueryDatabase>,
  companyId: string
) {
  return client
    .from("timeCardEntries")
    .select("*")
    .eq("companyId", companyId)
    .order("clockIn", { ascending: false })
    .limit(100);
}

export async function getScheduledEmployeesToday(
  client: CarbonDatabaseClient<QueryDatabase>,
  companyId: string
) {
  const { data } = await client
    .from("employeeJob")
    .select(
      "id, shiftId, shift:shift(id, name, startTime, endTime, sunday, monday, tuesday, wednesday, thursday, friday, saturday)"
    )
    .eq("companyId", companyId)
    .not("shiftId", "is", null);

  if (!data) return [];

  const dayNames = [
    "sunday",
    "monday",
    "tuesday",
    "wednesday",
    "thursday",
    "friday",
    "saturday"
  ] as const;
  const today = dayNames[new Date().getDay()];

  return data.filter((ej) => {
    const shift = ej.shift as Record<string, unknown> | null;
    return shift && shift[today] === true;
  });
}

export async function getTimeCardEntry(
  client: CarbonDatabaseClient<QueryDatabase>,
  entryId: string
) {
  return client.from("timeCardEntry").select("*").eq("id", entryId).single();
}

export async function getTimeCardEntries(
  client: CarbonDatabaseClient<QueryDatabase>,
  args: {
    employeeId: string;
    companyId: string;
    from?: string;
    to?: string;
  }
) {
  let query = client
    .from("timeCardEntry")
    .select("*")
    .eq("employeeId", args.employeeId)
    .eq("companyId", args.companyId)
    .order("clockIn", { ascending: false });

  if (args.from) {
    query = query.gte("clockIn", args.from);
  }
  if (args.to) {
    query = query.lte("clockIn", args.to);
  }

  return query;
}

export async function getTimecardEntries(
  client: CarbonDatabaseClient<QueryDatabase>,
  companyId: string,
  args: GenericQueryFilters & { search: string | null }
) {
  let query = client
    .from("timeCardEntries")
    .select("*", { count: "exact" })
    .eq("companyId", companyId);

  if (args.search) {
    query = query.or(
      `firstName.ilike.%${args.search}%,lastName.ilike.%${args.search}%`
    );
  }

  query = setGenericQueryFilters(query, args, [
    { column: "clockIn", ascending: false }
  ]);

  return query;
}

export async function getWeeklyHoursForEmployees(
  client: CarbonDatabaseClient<QueryDatabase>,
  companyId: string,
  employeeIds: string[]
): Promise<Record<string, number>> {
  const now = new Date();
  const dayOfWeek = now.getDay();
  const monday = new Date(now);
  monday.setDate(now.getDate() - ((dayOfWeek + 6) % 7));
  monday.setHours(0, 0, 0, 0);

  const { data: entries } = await client
    .from("timeCardEntry")
    .select("employeeId, clockIn, clockOut")
    .eq("companyId", companyId)
    .in("employeeId", employeeIds)
    .gte("clockIn", monday.toISOString());

  const weeklyMs: Record<string, number> = {};
  for (const entry of entries ?? []) {
    const end = entry.clockOut
      ? new Date(entry.clockOut).getTime()
      : Date.now();
    const ms = end - new Date(entry.clockIn).getTime();
    weeklyMs[entry.employeeId] = (weeklyMs[entry.employeeId] ?? 0) + ms;
  }

  return weeklyMs;
}

export async function updateTimeCardEntry(
  client: CarbonDatabaseClient<QueryDatabase>,
  args: {
    entryId: string;
    clockIn?: string;
    clockOut?: string | null;
    note?: string | null;
    updatedBy: string;
  }
) {
  return client
    .from("timeCardEntry")
    .update(
      sanitize({
        clockIn: args.clockIn,
        clockOut: args.clockOut,
        note: args.note,
        updatedBy: args.updatedBy,
        updatedAt: new Date().toISOString()
      })
    )
    .eq("id", args.entryId);
}
