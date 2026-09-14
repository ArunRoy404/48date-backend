import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Response } from 'express';
import { errorResponse } from '../response/api-response.util.js';

interface HttpExceptionBody {
  message?: string | string[];
  error?: string;
  /** Seconds until the caller may retry; rendered as the `Retry-After` header. */
  retryAfterSeconds?: number;
}

/**
 * Catches every exception thrown by the app (HTTP exceptions, validation
 * errors, and unexpected errors) and formats it into the standard envelope:
 * { success: false, message, messages, statusCode }.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const body = exception.getResponse();

      if (typeof body === 'string') {
        return response
          .status(status)
          .json(errorResponse(body, [body], status));
      }

      const { message, error, retryAfterSeconds } = (body ??
        {}) as HttpExceptionBody;

      // The response envelope has a fixed shape, so a rate-limit countdown
      // travels in the standard header rather than as an extra body field.
      if (typeof retryAfterSeconds === 'number') {
        response.setHeader('Retry-After', String(retryAfterSeconds));
      }

      if (Array.isArray(message)) {
        // Validation errors — one message per failed field.
        return response
          .status(status)
          .json(errorResponse('Validation failed', message, status));
      }

      const text = message ?? error ?? 'Request failed';
      return response.status(status).json(errorResponse(text, [text], status));
    }

    // Unknown/unexpected error — log details server-side.
    const errObj =
      typeof exception === 'object' && exception !== null
        ? (exception as Record<string, unknown>)
        : undefined;
    const errCode =
      (typeof errObj?.code === 'string' && errObj.code) ||
      (typeof errObj?.name === 'string' && errObj.name) ||
      'ERROR';
    const errMsg =
      (typeof errObj?.message === 'string' && errObj.message) ||
      String(exception);

    this.logger.error(
      `Unhandled exception [${errCode}]: ${errMsg}`,
      exception instanceof Error ? exception.stack : String(exception),
    );

    if (errCode === 'ECONNREFUSED') {
      return response
        .status(HttpStatus.SERVICE_UNAVAILABLE)
        .json(
          errorResponse(
            'Database connection refused. Please start your PostgreSQL container with "docker compose up -d".',
            ['Cannot connect to PostgreSQL database'],
            HttpStatus.SERVICE_UNAVAILABLE,
          ),
        );
    }

    return response
      .status(HttpStatus.INTERNAL_SERVER_ERROR)
      .json(
        errorResponse(
          'Something went wrong on our side',
          ['Internal server error'],
          HttpStatus.INTERNAL_SERVER_ERROR,
        ),
      );
  }
}
