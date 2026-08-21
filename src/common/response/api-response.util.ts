import type {
  ApiErrorResponse,
  ApiSuccessResponse,
} from './api-response.interface.js';

/**
 * Builds the standard success envelope.
 *
 * @param data     the payload returned to the client
 * @param message  a short, human-readable summary (non-technical friendly)
 * @param messages additional messages (e.g. info notices); defaults to []
 */
export function successResponse<T>(
  data: T,
  message: string,
  messages: string[] = [],
): ApiSuccessResponse<T> {
  return { success: true, message, messages, data };
}

/**
 * Builds the standard error envelope.
 *
 * @param message    a short, human-readable summary (non-technical friendly)
 * @param messages   every individual message (e.g. each validation error); defaults to [message]
 * @param statusCode the HTTP status code; defaults to 500
 */
export function errorResponse(
  message: string,
  messages: string[] = [message],
  statusCode = 500,
): ApiErrorResponse {
  return { success: false, message, messages, statusCode };
}
