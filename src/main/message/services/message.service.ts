import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { BookingStatus, Prisma, UserRole, UserStatus } from '@prisma/client';
import { PrismaService } from '@/lib/prisma/prisma.service';
import { MessageQueryDto } from '../dto/message-query.dto';

const messageUserSelect = {
  id: true,
  name: true,
  email: true,
  role: true,
  avatarUrl: true,
} as const satisfies Prisma.UserSelect;

const messageInclude = {
  sender: {
    select: messageUserSelect,
  },
} as const satisfies Prisma.DirectMessageInclude;

const conversationInclude = {
  participants: {
    select: {
      user: {
        select: messageUserSelect,
      },
    },
    orderBy: {
      createdAt: 'asc',
    },
  },
  messages: {
    take: 1,
    orderBy: {
      createdAt: 'desc',
    },
    include: messageInclude,
  },
} as const satisfies Prisma.MessageConversationInclude;

type ConversationWithDetails = Prisma.MessageConversationGetPayload<{
  include: typeof conversationInclude;
}>;

type MessageWithSender = Prisma.DirectMessageGetPayload<{
  include: typeof messageInclude;
}>;

@Injectable()
export class MessageService {
  constructor(private readonly prisma: PrismaService) {}

  private getPagination(query: MessageQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 50;

    return {
      page,
      limit,
      skip: (page - 1) * limit,
      take: limit,
    };
  }

  private getParticipantKey(firstUserId: string, secondUserId: string) {
    return [firstUserId, secondUserId].sort().join(':');
  }

  private async getActiveUserOrThrow(userId: string) {
    const user = await this.prisma.client.user.findUnique({
      where: {
        id: userId,
      },
      select: {
        id: true,
        role: true,
        status: true,
      },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    if (user.status === UserStatus.INACTIVE) {
      throw new BadRequestException('User is inactive');
    }

    if (user.status === UserStatus.SUSPENDED) {
      throw new BadRequestException('User is suspended');
    }

    return user;
  }

  private async ensureCanMessage(actorId: string, receiverId: string) {
    if (actorId === receiverId) {
      throw new BadRequestException('Cannot message yourself');
    }

    const users = await this.prisma.client.user.findMany({
      where: {
        id: {
          in: [actorId, receiverId],
        },
      },
      select: {
        id: true,
        role: true,
        status: true,
      },
    });

    const actor = users.find((user) => user.id === actorId);
    const receiver = users.find((user) => user.id === receiverId);

    if (!actor || !receiver) {
      throw new NotFoundException('User not found');
    }

    for (const user of [actor, receiver]) {
      if (user.status === UserStatus.INACTIVE) {
        throw new BadRequestException('User is inactive');
      }

      if (user.status === UserStatus.SUSPENDED) {
        throw new BadRequestException('User is suspended');
      }
    }

    if (actor.role === UserRole.ADMIN) {
      if (
        receiver.role === UserRole.STUDENT ||
        receiver.role === UserRole.TUTOR
      ) {
        return;
      }

      throw new ForbiddenException(
        'Admin can message tutors and students only',
      );
    }

    if (receiver.role === UserRole.ADMIN) {
      if (actor.role === UserRole.STUDENT || actor.role === UserRole.TUTOR) {
        return;
      }

      throw new ForbiddenException(
        'Only tutors and students can message admin',
      );
    }

    const isTutorStudentPair =
      (actor.role === UserRole.TUTOR && receiver.role === UserRole.STUDENT) ||
      (actor.role === UserRole.STUDENT && receiver.role === UserRole.TUTOR);

    if (!isTutorStudentPair) {
      throw new ForbiddenException(
        'Only tutor-student conversations are allowed',
      );
    }

    const tutorId = actor.role === UserRole.TUTOR ? actor.id : receiver.id;
    const studentId = actor.role === UserRole.STUDENT ? actor.id : receiver.id;

    const booking = await this.prisma.client.booking.findFirst({
      where: {
        tutorId,
        status: {
          in: [BookingStatus.SCHEDULED, BookingStatus.COMPLETED],
        },
        OR: [
          {
            studentId,
          },
          {
            participants: {
              some: {
                studentId,
              },
            },
          },
        ],
      },
      select: {
        id: true,
      },
    });

    if (!booking) {
      throw new ForbiddenException(
        'Tutor and student must have a scheduled or completed booking to message',
      );
    }
  }

  async createDirectConversation(actorId: string, receiverId: string) {
    await this.ensureCanMessage(actorId, receiverId);

    const participantKey = this.getParticipantKey(actorId, receiverId);

    const conversation = await this.prisma.client.messageConversation.upsert({
      where: {
        participantKey,
      },
      update: {},
      create: {
        participantKey,
        participants: {
          create: [actorId, receiverId].map((userId) => ({
            user: {
              connect: {
                id: userId,
              },
            },
          })),
        },
      },
      include: conversationInclude,
    });

    return {
      message: 'Conversation fetched successfully',
      data: this.toConversationResponse(conversation),
    };
  }

  async getContacts(userId: string) {
    const user = await this.getActiveUserOrThrow(userId);
    const activeStatus = UserStatus.ACTIVE;
    const allowedBookingStatuses = [
      BookingStatus.SCHEDULED,
      BookingStatus.COMPLETED,
    ];

    if (user.role === UserRole.ADMIN) {
      const contacts = await this.prisma.client.user.findMany({
        where: {
          role: {
            in: [UserRole.STUDENT, UserRole.TUTOR],
          },
          status: activeStatus,
        },
        select: messageUserSelect,
        orderBy: {
          createdAt: 'desc',
        },
      });

      return {
        message: 'Message contacts fetched successfully',
        data: contacts,
      };
    }

    if (user.role === UserRole.TUTOR) {
      const contacts = await this.prisma.client.user.findMany({
        where: {
          role: UserRole.STUDENT,
          status: activeStatus,
          OR: [
            {
              studentBookings: {
                some: {
                  tutorId: userId,
                  status: {
                    in: allowedBookingStatuses,
                  },
                },
              },
            },
            {
              bookingParticipations: {
                some: {
                  booking: {
                    tutorId: userId,
                    status: {
                      in: allowedBookingStatuses,
                    },
                  },
                },
              },
            },
          ],
        },
        select: messageUserSelect,
        orderBy: {
          createdAt: 'desc',
        },
      });

      return {
        message: 'Message contacts fetched successfully',
        data: contacts,
      };
    }

    if (user.role === UserRole.STUDENT) {
      const contacts = await this.prisma.client.user.findMany({
        where: {
          role: UserRole.TUTOR,
          status: activeStatus,
          tutorBookings: {
            some: {
              status: {
                in: allowedBookingStatuses,
              },
              OR: [
                {
                  studentId: userId,
                },
                {
                  participants: {
                    some: {
                      studentId: userId,
                    },
                  },
                },
              ],
            },
          },
        },
        select: messageUserSelect,
        orderBy: {
          createdAt: 'desc',
        },
      });

      return {
        message: 'Message contacts fetched successfully',
        data: contacts,
      };
    }

    return {
      message: 'Message contacts fetched successfully',
      data: [],
    };
  }

  async getConversations(userId: string, query: MessageQueryDto) {
    const pagination = this.getPagination(query);
    const where: Prisma.MessageConversationWhereInput = {
      participants: {
        some: {
          userId,
        },
      },
    };

    const [conversations, total] = await Promise.all([
      this.prisma.client.messageConversation.findMany({
        where,
        include: conversationInclude,
        orderBy: {
          updatedAt: 'desc',
        },
        skip: pagination.skip,
        take: pagination.take,
      }),
      this.prisma.client.messageConversation.count({
        where,
      }),
    ]);

    return {
      message: 'Conversations fetched successfully',
      data: conversations.map((conversation) =>
        this.toConversationResponse(conversation),
      ),
      meta: {
        page: pagination.page,
        limit: pagination.limit,
        total,
        totalPage: Math.ceil(total / pagination.limit),
      },
    };
  }

  async getConversation(userId: string, conversationId: string) {
    const conversation = await this.getConversationForUser(
      userId,
      conversationId,
    );

    return {
      message: 'Conversation fetched successfully',
      data: this.toConversationResponse(conversation),
    };
  }

  async getMessages(
    userId: string,
    conversationId: string,
    query: MessageQueryDto,
  ) {
    await this.getConversationForUser(userId, conversationId);

    const pagination = this.getPagination(query);
    const where: Prisma.DirectMessageWhereInput = {
      conversationId,
    };

    const [messages, total] = await Promise.all([
      this.prisma.client.directMessage.findMany({
        where,
        include: messageInclude,
        orderBy: {
          createdAt: 'asc',
        },
        skip: pagination.skip,
        take: pagination.take,
      }),
      this.prisma.client.directMessage.count({
        where,
      }),
    ]);

    return {
      message: 'Messages fetched successfully',
      data: messages.map((message) => this.toMessageResponse(message)),
      meta: {
        page: pagination.page,
        limit: pagination.limit,
        total,
        totalPage: Math.ceil(total / pagination.limit),
      },
    };
  }

  async sendDirectMessage(
    actorId: string,
    receiverId: string,
    content: string,
  ) {
    const conversationResponse = await this.createDirectConversation(
      actorId,
      receiverId,
    );
    const message = await this.createMessage(
      conversationResponse.data.id,
      actorId,
      content,
      conversationResponse.data.participantIds,
    );

    return {
      message: 'Message sent successfully',
      data: {
        conversation: conversationResponse.data,
        message,
      },
    };
  }

  async sendConversationMessage(
    senderId: string,
    conversationId: string,
    content: string,
  ) {
    const conversation = await this.getConversationForUser(
      senderId,
      conversationId,
    );
    const receiver = conversation.participants.find(
      (participant) => participant.user.id !== senderId,
    );

    if (!receiver) {
      throw new BadRequestException('Conversation recipient not found');
    }

    await this.ensureCanMessage(senderId, receiver.user.id);

    const message = await this.createMessage(
      conversation.id,
      senderId,
      content,
      conversation.participants.map((participant) => participant.user.id),
    );

    return {
      message: 'Message sent successfully',
      data: message,
    };
  }

  private async getConversationForUser(userId: string, conversationId: string) {
    const conversation = await this.prisma.client.messageConversation.findFirst(
      {
        where: {
          id: conversationId,
          participants: {
            some: {
              userId,
            },
          },
        },
        include: conversationInclude,
      },
    );

    if (!conversation) {
      throw new NotFoundException('Conversation not found');
    }

    return conversation;
  }

  private async createMessage(
    conversationId: string,
    senderId: string,
    content: string,
    participantIds: string[],
  ) {
    const trimmedContent = content.trim();

    if (!trimmedContent) {
      throw new BadRequestException('Message cannot be empty');
    }

    const message = await this.prisma.client.$transaction(async (tx) => {
      const created = await tx.directMessage.create({
        data: {
          conversationId,
          senderId,
          content: trimmedContent,
        },
        include: messageInclude,
      });

      await tx.messageConversation.update({
        where: {
          id: conversationId,
        },
        data: {
          updatedAt: new Date(),
        },
      });

      return created;
    });

    return this.toMessageResponse(message, participantIds);
  }

  private toConversationResponse(conversation: ConversationWithDetails) {
    const participantIds = conversation.participants.map(
      (participant) => participant.user.id,
    );

    return {
      id: conversation.id,
      participantIds,
      participants: conversation.participants.map(
        (participant) => participant.user,
      ),
      lastMessage: conversation.messages[0]
        ? this.toMessageResponse(conversation.messages[0], participantIds)
        : null,
      createdAt: conversation.createdAt,
      updatedAt: conversation.updatedAt,
    };
  }

  private toMessageResponse(
    message: MessageWithSender,
    participantIds?: string[],
  ) {
    return {
      id: message.id,
      conversationId: message.conversationId,
      senderId: message.senderId,
      sender: message.sender,
      content: message.content,
      participantIds,
      createdAt: message.createdAt,
      updatedAt: message.updatedAt,
    };
  }
}
