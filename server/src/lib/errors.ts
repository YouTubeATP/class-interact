export class AppError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: unknown,
  ) {
    super(message);
  }
}

export const notFound = (what = 'Not found') => new AppError(404, 'NOT_FOUND', what);
export const badRequest = (message: string, details?: unknown) => new AppError(400, 'INVALID', message, details);
export const forbidden = (message = 'Not allowed') => new AppError(403, 'FORBIDDEN', message);
