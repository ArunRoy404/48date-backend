import { errorResponse, successResponse } from './api-response.util.js';

describe('api-response.util', () => {
  describe('successResponse', () => {
    it('builds the success envelope with data and message', () => {
      const res = successResponse({ id: '1' }, 'Account created successfully');

      expect(res).toEqual({
        success: true,
        message: 'Account created successfully',
        messages: [],
        data: { id: '1' },
      });
    });

    it('keeps extra messages when provided', () => {
      const res = successResponse(null, 'Done', ['info 1', 'info 2']);
      expect(res.messages).toEqual(['info 1', 'info 2']);
    });
  });

  describe('errorResponse', () => {
    it('defaults messages to [message] and statusCode to 500', () => {
      const res = errorResponse('Something went wrong');

      expect(res).toEqual({
        success: false,
        message: 'Something went wrong',
        messages: ['Something went wrong'],
        statusCode: 500,
      });
    });

    it('carries all validation messages', () => {
      const res = errorResponse(
        'Validation failed',
        ['phone must be valid', 'password too short'],
        400,
      );

      expect(res.success).toBe(false);
      expect(res.messages).toHaveLength(2);
      expect(res.statusCode).toBe(400);
    });
  });
});
