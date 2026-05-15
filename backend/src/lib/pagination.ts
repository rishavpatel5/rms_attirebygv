const MAX_LIMIT = 100;
const DEFAULT_LIMIT = 20;

export type PaginationMeta = {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
};

export function parsePagination(query: Record<string, unknown>): {
  page: number;
  limit: number;
  skip: number;
} {
  const pageRaw = Number(query.page ?? 1);
  const limitRaw = Number(query.limit ?? DEFAULT_LIMIT);
  const page = Number.isFinite(pageRaw) && pageRaw >= 1 ? Math.floor(pageRaw) : 1;
  let limit = Number.isFinite(limitRaw) && limitRaw >= 1 ? Math.floor(limitRaw) : DEFAULT_LIMIT;
  if (limit > MAX_LIMIT) limit = MAX_LIMIT;
  const skip = (page - 1) * limit;
  return { page, limit, skip };
}

export function buildMeta(
  page: number,
  limit: number,
  total: number,
): PaginationMeta {
  return {
    page,
    limit,
    total,
    totalPages: total === 0 ? 0 : Math.ceil(total / limit),
  };
}
