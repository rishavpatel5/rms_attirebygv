import { apiGetJsonAuthedWithMeta, type PaginationMeta } from "@/lib/api-client";

/** Fetches every page for a list endpoint (max 100 items per page). */
export async function fetchAllPaginated<T>(buildUrl: (page: number) => string): Promise<T[]> {
  const all: T[] = [];
  let page = 1;
  let totalPages = 1;
  do {
    const { data, meta } = await apiGetJsonAuthedWithMeta<T[]>(buildUrl(page));
    all.push(...data);
    totalPages = meta?.totalPages ?? 1;
    page += 1;
  } while (page <= totalPages);
  return all;
}

export async function fetchListMeta(buildUrl: (page: number) => string): Promise<PaginationMeta> {
  const { meta } = await apiGetJsonAuthedWithMeta<unknown[]>(buildUrl(1));
  return meta ?? { page: 1, limit: 100, total: 0, totalPages: 0 };
}
