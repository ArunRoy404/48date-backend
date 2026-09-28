import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
// ESM Jest does not inject the `jest` global — it must be imported.
import { jest } from '@jest/globals';
import { ChatService } from './chat.service.js';
import { MessageType } from '../../generated/prisma/enums.js';
import { PrismaService } from '../../common/prisma/prisma.service.js';

/**
 * Authorization matrix for conversation access:
 *
 * | caller            | match status | result                    |
 * |-------------------|--------------|---------------------------|
 * | participant       | ACTIVE       | allowed                   |
 * | non-participant   | ACTIVE       | 403 (enumeration-proof)   |
 * | participant       | UNMATCHED    | 403 — conversation closed |
 * | unknown thread    | —            | 404                       |
 *
 * Regression target: blocked/unmatched users could previously keep reading
 * and sending messages because only participation was checked.
 */
describe('ChatService — conversation access control', () => {
  const ALICE = 'alice-id';
  const BOB = 'bob-id';
  const EVE = 'eve-id';
  const CONVERSATION_ID = 'conversation-id';

  let service: ChatService;
  let prisma: {
    conversation: { findUnique: jest.Mock; update: jest.Mock };
    message: { findMany: jest.Mock; create: jest.Mock };
    $transaction: jest.Mock;
  };

  const conversationWith = (status: 'ACTIVE' | 'UNMATCHED') => ({
    id: CONVERSATION_ID,
    match: {
      userLowId: ALICE < BOB ? ALICE : BOB,
      userHighId: ALICE < BOB ? BOB : ALICE,
      status,
    },
  });

  beforeEach(async () => {
    prisma = {
      conversation: {
        findUnique: jest.fn(),
        update: jest.fn().mockResolvedValue({}),
      },
      message: { findMany: jest.fn(), create: jest.fn() },
      $transaction: jest.fn(),
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        ChatService,
        {
          provide: PrismaService,
          useValue: prisma,
        },
      ],
    }).compile();

    service = moduleRef.get(ChatService);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('getMessages', () => {
    it('returns history for a participant of an ACTIVE match', async () => {
      prisma.conversation.findUnique.mockResolvedValue(
        conversationWith('ACTIVE'),
      );
      const stored = [{ id: 'm1', content: 'hello' }];
      prisma.message.findMany.mockResolvedValue([...stored].reverse());

      const messages = await service.getMessages(ALICE, CONVERSATION_ID);

      expect(messages).toEqual(stored);
      expect(prisma.message.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { conversationId: CONVERSATION_ID } }),
      );
    });

    it('rejects a non-participant with the same 403 as an invalid thread', async () => {
      prisma.conversation.findUnique.mockResolvedValue(
        conversationWith('ACTIVE'),
      );

      await expect(service.getMessages(EVE, CONVERSATION_ID)).rejects.toThrow(
        ForbiddenException,
      );
      expect(prisma.message.findMany).not.toHaveBeenCalled();
    });

    it('rejects a participant once the match is UNMATCHED (regression)', async () => {
      prisma.conversation.findUnique.mockResolvedValue(
        conversationWith('UNMATCHED'),
      );

      await expect(service.getMessages(ALICE, CONVERSATION_ID)).rejects.toThrow(
        ForbiddenException,
      );
      expect(prisma.message.findMany).not.toHaveBeenCalled();
    });

    it('returns 404 when the conversation does not exist', async () => {
      prisma.conversation.findUnique.mockResolvedValue(null);

      await expect(service.getMessages(ALICE, CONVERSATION_ID)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('sendMessage', () => {
    it('persists a message for a participant of an ACTIVE match', async () => {
      prisma.conversation.findUnique.mockResolvedValue(
        conversationWith('ACTIVE'),
      );
      const saved = { id: 'm2', content: 'hi' };
      prisma.$transaction.mockImplementation((fn: unknown) =>
        (fn as (tx: unknown) => Promise<unknown>)(prisma),
      );
      prisma.message.create.mockResolvedValue(saved);

      const result = await service.sendMessage(
        BOB,
        CONVERSATION_ID,
        'hi',
        MessageType.TEXT,
        null,
      );

      expect(result.message).toEqual(saved);
    });

    it('rejects sending once the match is UNMATCHED (regression)', async () => {
      prisma.conversation.findUnique.mockResolvedValue(
        conversationWith('UNMATCHED'),
      );

      await expect(
        service.sendMessage(ALICE, CONVERSATION_ID, 'still here?'),
      ).rejects.toThrow(ForbiddenException);
      expect(prisma.message.create).not.toHaveBeenCalled();
    });

    it('rejects sending from a non-participant', async () => {
      prisma.conversation.findUnique.mockResolvedValue(
        conversationWith('ACTIVE'),
      );

      await expect(
        service.sendMessage(EVE, CONVERSATION_ID, 'let me in'),
      ).rejects.toThrow(ForbiddenException);
      expect(prisma.message.create).not.toHaveBeenCalled();
    });

    it('rejects an empty message before touching the database', async () => {
      await expect(
        service.sendMessage(ALICE, CONVERSATION_ID, '   '),
      ).rejects.toThrow(/content or mediaUrl/);
      expect(prisma.conversation.findUnique).not.toHaveBeenCalled();
    });
  });
});
