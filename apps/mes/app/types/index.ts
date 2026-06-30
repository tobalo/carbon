export type ListItem = {
  id: string;
  name: string;
};

export type PinnedInUser = {
  userId: string;
  name: string;
  avatarUrl: string | null;
};

export type UserContext = {
  locationId: string;
  companyId: string;
  consoleMode: boolean;
  effectiveUserId: string;
  pinnedInUser: PinnedInUser | null;
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

export type RealtimeChannel = {
  on(...args: any[]): RealtimeChannel;
  subscribe(...args: any[]): RealtimeChannel;
  unsubscribe(): Promise<unknown>;
};
