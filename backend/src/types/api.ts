export type ApiSuccessBody<T> = {
  data: T;
  meta?: Record<string, unknown>;
};

export type ApiErrorBody = {
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
};
