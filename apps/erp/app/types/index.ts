import type { ValidationErrorResponseData } from "@carbon/form";
import type { ListedFileObject } from "@carbon/object-storage/server";
import type { ReactElement, ReactNode } from "react";
import type { IconType } from "react-icons";
import type { useSettings } from "~/hooks";

export type Action = {
  label: string;
  icon: ReactElement;
  onClick: () => void;
};

export type Authenticated<T = {}> = T & {
  role?: Role;
  permission?: string;
  internal?: boolean;
};

export type AuthenticatedRouteGroup<T = {}> = T & {
  name: string;
  icon?: any;
  routes: Authenticated<Route & T>[];
};

export type FormActionData = Promise<ValidationErrorResponseData | Result>;

export type ListItem = {
  id: string;
  name: string;
  email?: string;
  // Optional secondary human-readable identifier (e.g. a supplier's readableId).
  readableId?: string;
};

// Topbar notification shape. `payload` mirrors what notify.ts writes into
// the notification row's payload jsonb column.
export type Notification = {
  _id: string;
  read: boolean;
  seen: boolean;
  createdAt: string;
  payload: {
    documentId?: string;
    description?: string;
    event?: string;
    from?: string;
    documentType?: string;
  };
};

export type ModelUpload = {
  modelId: string | null;
  modelName: string | null;
  modelPath: string | null;
  modelSize: number | null;
  thumbnailPath: string | null;
};

export type UserContext = {
  locationId: string;
  companyId: string;
};

export type NavItem = Omit<Route, "icon"> & {
  icon: IconType;
  backgroundColor?: string;
  foregroundColor?: string;
};

export type Result = {
  success: boolean;
  message?: string;
};

export type PostgrestError = {
  message: string;
  details?: string;
  hint?: string;
  code?: string;
};

type PostgrestResponseSuccess<T> = {
  data: T;
  error: null;
  count: number | null;
  status: number;
  statusText: string;
};

type PostgrestResponseFailure = {
  data: null;
  error: PostgrestError;
  count: number | null;
  status: number;
  statusText: string;
};

export type PostgrestResponse<T = unknown> =
  | PostgrestResponseSuccess<T[]>
  | PostgrestResponseFailure;

export type PostgrestSingleResponse<T = unknown> =
  | PostgrestResponseSuccess<T>
  | PostgrestResponseFailure;

export type Role = "employee" | "customer" | "supplier";

export type Route<T = {}> = T & {
  name: string;
  to: string;
  icon?: any;
  tag?: ReactNode;
  setting?: keyof ReturnType<typeof useSettings>;
  views?: {
    id: string;
    name: string;
    to: string;
    sortOrder: number;
  }[];
  q?: string; // TODO: this is dumb
  table?: string;
};

export type RouteGroup<T = {}> = {
  name: string;
  icon?: any;
  routes: (Route & T)[];
};

export interface SelectOption {
  label: string;
  value: string;
  helper?: string;
}

export type FileObject = ListedFileObject;

export type StorageItem = FileObject & {
  bucket?: string;
  itemId?: string;
};
