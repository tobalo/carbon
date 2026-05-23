import type { TableRow } from "@carbon/database/schema";

export interface Email {
  company: Company;
  recipient: {
    firstName?: string;
    lastName?: string;
    email: string;
  };
  sender: {
    firstName: string;
    lastName: string;
    email: string;
  };
  locale: string;
}

export interface PDF {
  title?: string;
  meta?: Meta;
  company: Company;
  locale: string;
}

export type Meta = {
  author?: string;
  keywords?: string;
  subject?: string;
};

export type Company = TableRow<"companies">;
export type CompanySettings =
  TableRow<"companySettings">;
export type QuoteCustomerDetails =
  TableRow<"quoteCustomerDetails">;
export type AccountsPayableBillingAddress =
  TableRow<"companyAccountsPayableBillingAddress">;
export type AccountsReceivableBillingAddress =
  TableRow<"companyAccountsReceivableBillingAddress">;
