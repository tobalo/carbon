import type { TableRow } from "@carbon/database/schema";
import { CalendarDate, getLocalTimeZone, today } from "@internationalized/date";

export function calculatePromisedDate(
  leadTime: number,
  holidays: TableRow<"holiday">[]
) {
  const now = new Date();
  const cutoffHour = 10;
  const timeZone = getLocalTimeZone();

  let startDate = today(timeZone);

  if (now.getHours() >= cutoffHour) {
    startDate = startDate.add({ days: 1 });
  }

  const holidayDates = new Set(
    holidays.map((holiday) => {
      const holidayDate = new Date(holiday.date);
      return new CalendarDate(
        holidayDate.getFullYear(),
        holidayDate.getMonth() + 1,
        holidayDate.getDate()
      ).toString();
    })
  );

  let businessDaysAdded = 0;
  let currentDate = startDate;

  while (businessDaysAdded < leadTime) {
    currentDate = currentDate.add({ days: 1 });

    const dayOfWeek = currentDate.toDate(timeZone).getDay();
    const isWeekday = dayOfWeek >= 1 && dayOfWeek <= 5;

    const isNotHoliday = !holidayDates.has(currentDate.toString());

    if (isWeekday && isNotHoliday) {
      businessDaysAdded++;
    }
  }

  return currentDate.toDate(timeZone).toISOString();
}
