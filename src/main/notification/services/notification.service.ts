import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, UserRole, UserStatus } from '@prisma/client';
import { PrismaService } from '@/lib/prisma/prisma.service';
import { NotificationQueryDto } from '../dto/notification-query.dto';

type NotificationPayload = {
  recipientId: string;
  type: string;
  title: string;
  message: string;
  data?: Prisma.InputJsonValue;
};

type BroadcastPayload = Omit<NotificationPayload, 'recipientId'>;

@Injectable()
export class NotificationService {
  constructor(private readonly prisma: PrismaService) {}

  private getPagination(query: NotificationQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 50;

    return {
      page,
      limit,
      skip: (page - 1) * limit,
      take: limit,
    };
  }

  async create(payload: NotificationPayload) {
    return this.prisma.client.notification.create({
      data: {
        recipientId: payload.recipientId,
        type: payload.type,
        title: payload.title,
        message: payload.message,
        data: payload.data,
      },
    });
  }

  async createMany(recipientIds: string[], payload: BroadcastPayload) {
    const uniqueRecipientIds = [...new Set(recipientIds)].filter(Boolean);

    if (uniqueRecipientIds.length === 0) {
      return { count: 0 };
    }

    return this.prisma.client.notification.createMany({
      data: uniqueRecipientIds.map((recipientId) => ({
        recipientId,
        type: payload.type,
        title: payload.title,
        message: payload.message,
        data: payload.data ?? Prisma.JsonNull,
      })),
    });
  }

  async createForAdmins(payload: BroadcastPayload) {
    const admins = await this.prisma.client.user.findMany({
      where: {
        role: UserRole.ADMIN,
        status: UserStatus.ACTIVE,
      },
      select: {
        id: true,
      },
    });

    return this.createMany(
      admins.map((admin) => admin.id),
      payload,
    );
  }

  async getNotifications(userId: string, query: NotificationQueryDto) {
    const pagination = this.getPagination(query);
    const where: Prisma.NotificationWhereInput = {
      recipientId: userId,
    };

    if (query.isRead === true) {
      where.readAt = {
        not: null,
      };
    }

    if (query.isRead === false) {
      where.readAt = null;
    }

    if (query.type) {
      where.type = query.type;
    }

    const [notifications, total] = await Promise.all([
      this.prisma.client.notification.findMany({
        where,
        orderBy: {
          createdAt: 'desc',
        },
        skip: pagination.skip,
        take: pagination.take,
      }),
      this.prisma.client.notification.count({
        where,
      }),
    ]);

    return {
      message: 'Notifications fetched successfully',
      data: notifications,
      meta: {
        page: pagination.page,
        limit: pagination.limit,
        total,
        totalPage: Math.ceil(total / pagination.limit),
      },
    };
  }

  async getUnreadCount(userId: string) {
    const count = await this.prisma.client.notification.count({
      where: {
        recipientId: userId,
        readAt: null,
      },
    });

    return {
      message: 'Unread notification count fetched successfully',
      data: {
        count,
      },
    };
  }

  async markAsRead(userId: string, notificationId: string) {
    const notification = await this.prisma.client.notification.findFirst({
      where: {
        id: notificationId,
        recipientId: userId,
      },
    });

    if (!notification) {
      throw new NotFoundException('Notification not found');
    }

    const updated = await this.prisma.client.notification.update({
      where: {
        id: notificationId,
      },
      data: {
        readAt: notification.readAt ?? new Date(),
      },
    });

    return {
      message: 'Notification marked as read successfully',
      data: updated,
    };
  }

  async markAllAsRead(userId: string) {
    const updated = await this.prisma.client.notification.updateMany({
      where: {
        recipientId: userId,
        readAt: null,
      },
      data: {
        readAt: new Date(),
      },
    });

    return {
      message: 'Notifications marked as read successfully',
      data: {
        count: updated.count,
      },
    };
  }
}
