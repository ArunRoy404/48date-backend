import {
  ActionType,
  DateStatus,
  MatchStatus,
  MessageType,
  NotificationType,
  ReportStatus,
  SessionStatus,
  StoryStatus,
  SubscriptionPlan,
  SubscriptionStatus,
  TrustEventType,
} from '../../src/generated/prisma/enums.js';
import type { PrismaClient } from '../../src/generated/prisma/client.js';
import type { UserMap } from './users.seed.js';

/** Match rows store the pair with the smaller UUID first. */
const pair = (a: string, b: string) =>
  a < b ? { userLowId: a, userHighId: b } : { userLowId: b, userHighId: a };

const daysFromNow = (d: number) => new Date(Date.now() + d * 86_400_000);

/**
 * Relational demo data, so every endpoint returns something real:
 *
 * - ava ↔ liam   : match with chat history, a finished game, a COMPLETED date + ratings
 * - ava ↔ noah   : match with a PENDING date invitation **addressed to ava**, so
 *                  DT-06 accept / DT-07 decline work while logged in as ava
 * - ethan, kabir : liked nobody, swiped by nobody — ava's discovery feed
 * - zara         : blocked and reported by ava
 * - liam ↔ mia   : the PUBLISHED success story, with a like and a comment
 */
export async function seedSocial(
  prisma: PrismaClient,
  u: UserMap,
): Promise<void> {
  console.log('🤝 Seeding matches, chat, games, dates and social data...');

  // ---------------------------------------------------------------- swipes
  const swipes: [string, string, ActionType][] = [
    [u.ava, u.liam, ActionType.LIKE],
    [u.liam, u.ava, ActionType.LIKE],
    [u.ava, u.noah, ActionType.SUPER_LIKE],
    [u.noah, u.ava, ActionType.LIKE],
    [u.liam, u.mia, ActionType.LIKE],
    [u.ava, u.zara, ActionType.PASS],
  ];
  for (const [actorId, targetUserId, action] of swipes) {
    await prisma.discoveryAction.upsert({
      where: { actorId_targetUserId: { actorId, targetUserId } },
      create: { actorId, targetUserId, action },
      update: { action },
    });
  }

  // Drop swipes the seed did not create. Without this, every Postman/newman run
  // that calls D-05 permanently shrinks the demo discovery feed until it is
  // empty, because a swiped user is never shown again.
  const demoIds = Object.values(u);
  const keptPairs = swipes.map(([a, t]) => `${a}:${t}`);
  const strayActions = await prisma.discoveryAction.findMany({
    where: { actorId: { in: demoIds } },
    select: { id: true, actorId: true, targetUserId: true },
  });
  const strayIds = strayActions
    .filter((a) => !keptPairs.includes(`${a.actorId}:${a.targetUserId}`))
    .map((a) => a.id);
  if (strayIds.length) {
    await prisma.discoveryAction.deleteMany({
      where: { id: { in: strayIds } },
    });
    console.log(
      `  🧹 removed ${strayIds.length} swipe(s) left over from API runs`,
    );
  }

  // --------------------------------------------------------------- matches
  const mkMatch = async (a: string, b: string) => {
    const p = pair(a, b);
    const existing = await prisma.match.findUnique({
      where: { userLowId_userHighId: p },
    });
    const match =
      existing ??
      (await prisma.match.create({
        data: { ...p, status: MatchStatus.ACTIVE },
      }));
    if (existing && existing.status !== MatchStatus.ACTIVE) {
      await prisma.match.update({
        where: { id: match.id },
        data: { status: MatchStatus.ACTIVE, unmatchedAt: null },
      });
    }
    const conversation = await prisma.conversation.upsert({
      where: { matchId: match.id },
      create: { matchId: match.id },
      update: {},
    });
    return { match, conversation };
  };

  const avaLiam = await mkMatch(u.ava, u.liam);
  const avaNoah = await mkMatch(u.ava, u.noah);

  // Same idea for matches created by API runs, so the demo always has exactly
  // the two documented matches (and both are ACTIVE again after an M-02 unmatch).
  const strayMatches = await prisma.match.findMany({
    where: {
      userLowId: { in: Object.values(u) },
      userHighId: { in: Object.values(u) },
      id: { notIn: [avaLiam.match.id, avaNoah.match.id] },
    },
    select: { id: true },
  });
  if (strayMatches.length) {
    await prisma.match.deleteMany({
      where: { id: { in: strayMatches.map((m) => m.id) } },
    });
    console.log(
      `  🧹 removed ${strayMatches.length} match(es) left over from API runs`,
    );
  }

  // ------------------------------------------------------------------ chat
  await prisma.message.deleteMany({
    where: { conversationId: avaLiam.conversation.id },
  });
  const thread: [string, MessageType, string][] = [
    [
      u.liam,
      MessageType.TEXT,
      'Hey Ava! Your photography work looks amazing 📸',
    ],
    [
      u.ava,
      MessageType.TEXT,
      'Thank you! I saw you play basketball — how long have you been at it?',
    ],
    [
      u.liam,
      MessageType.TEXT,
      'Since university. Still terrible at free throws though.',
    ],
    [u.ava, MessageType.TEXT, 'Ha! Coffee sometime and you can tell me more?'],
    [u.liam, MessageType.TEXT, 'I would love that. Sending an invite now.'],
    [u.liam, MessageType.DATE_INVITE, 'Date invitation: Cafe Mango, Gulshan'],
  ];
  for (let i = 0; i < thread.length; i++) {
    const [senderId, type, content] = thread[i];
    await prisma.message.create({
      data: {
        conversationId: avaLiam.conversation.id,
        senderId,
        type,
        content,
        createdAt: new Date(Date.now() - (thread.length - i) * 3_600_000),
      },
    });
  }

  // ----------------------------------------------------------------- games
  const game = await prisma.game.findFirst({
    where: { isActive: true },
    include: {
      questions: { where: { isActive: true }, orderBy: { order: 'asc' } },
    },
  });
  if (game && game.questions.length) {
    await prisma.gameSession.deleteMany({
      where: { matchId: avaLiam.match.id },
    });
    const session = await prisma.gameSession.create({
      data: {
        matchId: avaLiam.match.id,
        gameId: game.id,
        status: SessionStatus.COMPLETED,
        completedAt: new Date(),
      },
    });
    // Both players answered every question; they agree on all but the last one.
    for (let i = 0; i < game.questions.length; i++) {
      const q = game.questions[i];
      const last = i === game.questions.length - 1;
      for (const [userId, option] of [
        [u.ava, q.optionA],
        [u.liam, last ? q.optionB : q.optionA],
      ] as const) {
        await prisma.gameAnswer.create({
          data: {
            gameSessionId: session.id,
            questionId: q.id,
            userId,
            selectedOption: option,
          },
        });
      }
    }
    // A second, still-open session on the other match.
    await prisma.gameSession.deleteMany({
      where: { matchId: avaNoah.match.id },
    });
    await prisma.gameSession.create({
      data: {
        matchId: avaNoah.match.id,
        gameId: game.id,
        status: SessionStatus.IN_PROGRESS,
      },
    });
  }

  // ----------------------------------------------------------------- dates
  await prisma.dateRating.deleteMany({});
  await prisma.datePlan.deleteMany({
    where: { matchId: { in: [avaLiam.match.id, avaNoah.match.id] } },
  });

  const completed = await prisma.datePlan.create({
    data: {
      matchId: avaLiam.match.id,
      proposerId: u.liam,
      receiverId: u.ava,
      venueName: 'Cafe Mango',
      venueAddress: '12 Gulshan Ave, Dhaka 1212',
      latitude: 23.7925,
      longitude: 90.4078,
      date: daysFromNow(-7),
      startTime: daysFromNow(-7),
      endTime: daysFromNow(-7),
      status: DateStatus.COMPLETED,
    },
  });
  await prisma.dateRating.createMany({
    data: [
      {
        datePlanId: completed.id,
        reviewerId: u.ava,
        reviewedUserId: u.liam,
        behaviorScore: 5,
        punctualityScore: 5,
        safetyScore: 5,
        overallScore: 5,
        comment: 'Lovely evening, great conversation and right on time.',
        isAnonymous: false,
      },
      {
        datePlanId: completed.id,
        reviewerId: u.liam,
        reviewedUserId: u.ava,
        behaviorScore: 5,
        punctualityScore: 4,
        safetyScore: 5,
        overallScore: 5,
        comment: 'Really easy to talk to. Would happily meet again.',
        isAnonymous: false,
      },
    ],
  });

  // Cancelled history on the same match (only one PENDING/ACCEPTED is allowed).
  await prisma.datePlan.create({
    data: {
      matchId: avaLiam.match.id,
      proposerId: u.ava,
      receiverId: u.liam,
      venueName: 'Rooftop 71',
      venueAddress: '71 Banani Rd, Dhaka',
      latitude: 23.7936,
      longitude: 90.4066,
      date: daysFromNow(-2),
      startTime: daysFromNow(-2),
      status: DateStatus.CANCELLED,
    },
  });

  // PENDING invitation addressed TO ava, so DT-06 / DT-07 work as ava.
  await prisma.datePlan.create({
    data: {
      matchId: avaNoah.match.id,
      proposerId: u.noah,
      receiverId: u.ava,
      venueName: 'North End Coffee Roasters',
      venueAddress: '5 Dhanmondi 27, Dhaka',
      latitude: 23.7465,
      longitude: 90.376,
      date: daysFromNow(3),
      startTime: daysFromNow(3),
      endTime: daysFromNow(3),
      status: DateStatus.PENDING,
    },
  });

  // ----------------------------------------------------------- trust events
  await prisma.trustScoreEvent.deleteMany({
    where: { userId: { in: Object.values(u) } },
  });
  await prisma.trustScoreEvent.createMany({
    data: [
      {
        userId: u.ava,
        type: TrustEventType.PROFILE_VERIFIED,
        points: 10,
        reason: 'Selfie verification passed',
      },
      {
        userId: u.ava,
        type: TrustEventType.DATE_ATTENDED,
        points: 8,
        reason: 'Attended date at Cafe Mango',
      },
      {
        userId: u.ava,
        type: TrustEventType.POSITIVE_FEEDBACK,
        points: 4,
        reason: '5-star rating received',
      },
      {
        userId: u.liam,
        type: TrustEventType.PROFILE_VERIFIED,
        points: 10,
        reason: 'Selfie verification passed',
      },
      {
        userId: u.liam,
        type: TrustEventType.DATE_ATTENDED,
        points: 8,
        reason: 'Attended date at Cafe Mango',
      },
      {
        userId: u.zara,
        type: TrustEventType.NO_SHOW,
        points: -15,
        reason: 'Did not attend a confirmed date',
      },
      {
        userId: u.zara,
        type: TrustEventType.ABUSIVE_BEHAVIOR,
        points: -10,
        reason: 'Reported for harassment',
      },
    ],
  });

  // ---------------------------------------------------------------- safety
  await prisma.block.deleteMany({ where: { blockerId: u.ava } });
  await prisma.block.create({
    data: { blockerId: u.ava, blockedUserId: u.zara },
  });

  await prisma.report.deleteMany({ where: { reporterId: u.ava } });
  await prisma.report.create({
    data: {
      reporterId: u.ava,
      reportedUserId: u.zara,
      reason: 'Inappropriate messages',
      description: 'Sent harassing messages after I declined a date.',
      status: ReportStatus.PENDING,
    },
  });

  // --------------------------------------------------------- subscriptions
  await prisma.subscription.deleteMany({
    where: { userId: { in: [u.ava, u.kabir] } },
  });
  const sub = await prisma.subscription.create({
    data: {
      userId: u.ava,
      plan: SubscriptionPlan.MONTHLY,
      provider: 'revenuecat',
      productId: 'com.date48.monthly',
      priceUsd: '14.99',
      status: SubscriptionStatus.ACTIVE,
      startedAt: daysFromNow(-10),
      expiresAt: daysFromNow(20),
    },
  });
  await prisma.user.update({
    where: { id: u.ava },
    data: { subscriptionId: sub.id },
  });
  await prisma.subscriptionEvent.deleteMany({
    where: { externalEventId: 'demo_evt_initial_purchase' },
  });
  await prisma.subscriptionEvent.create({
    data: {
      subscriptionId: sub.id,
      externalEventId: 'demo_evt_initial_purchase',
      eventType: 'INITIAL_PURCHASE',
      payload: { store: 'APP_STORE', environment: 'SANDBOX', currency: 'USD' },
      processedAt: new Date(),
    },
  });
  // An expired subscription, so the "not premium any more" branch has data too.
  await prisma.subscription.create({
    data: {
      userId: u.kabir,
      plan: SubscriptionPlan.WEEKLY,
      provider: 'revenuecat',
      productId: 'com.date48.weekly',
      priceUsd: '4.99',
      status: SubscriptionStatus.EXPIRED,
      startedAt: daysFromNow(-30),
      expiresAt: daysFromNow(-23),
    },
  });

  // ------------------------------------------------------- success stories
  await prisma.successStory.deleteMany({
    where: { authorId: { in: [u.liam, u.ava] } },
  });
  const published = await prisma.successStory.create({
    data: {
      authorId: u.liam,
      partnerId: u.mia,
      title: 'Two coffees and a shared playlist later',
      story:
        'We matched on a Tuesday and planned a date within 48 hours, exactly the way the app intends. One year on we have moved in together and still argue about whose playlist gets to run the kitchen.',
      images: ['https://cdn.48date.app/demo/story-liam-mia.jpg'],
      status: StoryStatus.PUBLISHED,
    },
  });
  await prisma.successStoryLike.createMany({
    data: [
      { storyId: published.id, userId: u.ava },
      { storyId: published.id, userId: u.noah },
    ],
  });
  await prisma.successStoryComment.createMany({
    data: [
      {
        storyId: published.id,
        userId: u.ava,
        content: 'Congratulations to you both! 🎉',
      },
      {
        storyId: published.id,
        userId: u.kabir,
        content: 'This is the sweetest thing I have read today.',
      },
    ],
  });
  // One still awaiting moderation, so the PENDING state is represented.
  await prisma.successStory.create({
    data: {
      authorId: u.ava,
      partnerId: u.liam,
      title: 'Our first 48 hours',
      story:
        'Still writing this one, but the short version is that a rainy first date at Cafe Mango turned into every weekend since.',
      images: [],
      status: StoryStatus.PENDING,
    },
  });

  // --------------------------------------------------------- notifications
  await prisma.notification.deleteMany({
    where: { userId: { in: Object.values(u) } },
  });
  await prisma.notification.createMany({
    data: [
      {
        userId: u.ava,
        type: NotificationType.MATCH,
        title: "It's a match!",
        body: 'You and Liam Chen liked each other.',
      },
      {
        userId: u.ava,
        type: NotificationType.MESSAGE,
        title: 'New message',
        body: 'Liam Chen sent you a message.',
      },
      {
        userId: u.ava,
        type: NotificationType.DATE_INVITE,
        title: 'Date invitation',
        body: 'Noah Reed invited you to North End Coffee Roasters.',
      },
      {
        userId: u.liam,
        type: NotificationType.MATCH,
        title: "It's a match!",
        body: 'You and Ava Stone liked each other.',
      },
    ],
  });

  console.log(
    '  🤝 2 matches, 6 messages, 2 game sessions, 3 date plans, 2 stories',
  );
}
