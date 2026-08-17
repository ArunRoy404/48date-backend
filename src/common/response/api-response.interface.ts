export interface ApiSuccessResponse<T> {
  success: true;
  message: string;
  messages: string[];
  data: T;
}

export interface ApiErrorResponse {
  success: false;
  message: string;
  messages: string[];
  statusCode: number;
}

export type ApiResponse<T> = ApiSuccessResponse<T> | ApiErrorResponse;
