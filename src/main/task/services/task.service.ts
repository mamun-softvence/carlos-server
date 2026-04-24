import cloudinary from '@/lib/cloudinary/cloudinary';
import { PrismaService } from '@/lib/prisma/prisma.service';
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, TaskStatus, UserRole, UserStatus } from '@prisma/client';
import { CreateTaskDto } from '../dto/create-task.dto';
import { TaskQueryDto } from '../dto/task-query.dto';

@Injectable()
export class TaskService {
  constructor(private readonly prisma: PrismaService) {}

  private readonly userSelect = {
    id: true,
    name: true,
    email: true,
    avatarUrl: true,
  } as const;

  private readonly taskInclude = {
    student: {
      select: this.userSelect,
    },
    tutor: {
      select: this.userSelect,
    },
  } satisfies Prisma.TaskInclude;

  private async ensureUserRole(userId: string, role: UserRole) {
    const user = await this.prisma.client.user.findUnique({
      where: { id: userId },
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

    if (user.role !== role) {
      throw new BadRequestException(`User is not a ${role.toLowerCase()}`);
    }

    return user;
  }

  private buildTaskWhere(query: TaskQueryDto): Prisma.TaskWhereInput {
    const where: Prisma.TaskWhereInput = {};

    if (query.status) {
      where.status = query.status;
    }

    if (query.studentId) {
      where.studentId = query.studentId;
    }

    return where;
  }

  private assertPdfFile(file: Express.Multer.File | undefined) {
    if (!file) {
      throw new BadRequestException('PDF file is required');
    }

    const isPdf =
      file.mimetype === 'application/pdf' ||
      file.originalname.toLowerCase().endsWith('.pdf');

    if (!isPdf) {
      throw new BadRequestException('Only PDF files allowed');
    }
  }

  private async uploadPdf(file: Express.Multer.File, folder: string) {
    this.assertPdfFile(file);

    const base64 = file.buffer.toString('base64');
    const dataUri = `data:${file.mimetype};base64,${base64}`;

    const uploadResult = await cloudinary.uploader.upload(dataUri, {
      folder,
      resource_type: 'raw',
    });

    return uploadResult.secure_url;
  }

  async createTask(
    tutorId: string,
    dto: CreateTaskDto,
    pdf: Express.Multer.File,
  ) {
    await this.ensureUserRole(tutorId, UserRole.TUTOR);
    await this.ensureUserRole(dto.studentId, UserRole.STUDENT);

    const dueDate = new Date(dto.dueDate);

    if (Number.isNaN(dueDate.getTime())) {
      throw new BadRequestException('Invalid dueDate');
    }

    const pdfUrl = await this.uploadPdf(pdf, 'tasks/assignments');

    const task = await this.prisma.client.task.create({
      data: {
        tutorId,
        studentId: dto.studentId,
        title: dto.title,
        pdfUrl,
        dueDate,
        status: TaskStatus.PENDING,
      },
      include: this.taskInclude,
    });

    return {
      message: 'Task assigned successfully',
      data: task,
    };
  }

  async getTutorTasks(tutorId: string, query: TaskQueryDto) {
    await this.ensureUserRole(tutorId, UserRole.TUTOR);

    const tasks = await this.prisma.client.task.findMany({
      where: {
        ...this.buildTaskWhere(query),
        tutorId,
      },
      include: this.taskInclude,
      orderBy: {
        createdAt: 'desc',
      },
    });

    return {
      message: 'Tutor tasks fetched successfully',
      data: tasks,
    };
  }

  async getStudentTasks(studentId: string, query: TaskQueryDto) {
    await this.ensureUserRole(studentId, UserRole.STUDENT);

    const tasks = await this.prisma.client.task.findMany({
      where: {
        status: query.status,
        studentId,
      },
      include: this.taskInclude,
      orderBy: {
        createdAt: 'desc',
      },
    });

    return {
      message: 'Student tasks fetched successfully',
      data: tasks,
    };
  }

  async getStudentTask(studentId: string, taskId: string) {
    await this.ensureUserRole(studentId, UserRole.STUDENT);

    const task = await this.prisma.client.task.findUnique({
      where: { id: taskId },
      include: this.taskInclude,
    });

    if (!task || task.studentId !== studentId) {
      throw new NotFoundException('Task not found');
    }

    return {
      message: 'Task fetched successfully',
      data: task,
    };
  }

  async submitTask(
    studentId: string,
    taskId: string,
    answerPdf: Express.Multer.File,
  ) {
    await this.ensureUserRole(studentId, UserRole.STUDENT);

    const task = await this.prisma.client.task.findUnique({
      where: { id: taskId },
      select: {
        id: true,
        studentId: true,
        status: true,
      },
    });

    if (!task) {
      throw new NotFoundException('Task not found');
    }

    if (task.studentId !== studentId) {
      throw new ForbiddenException('You cannot submit this task');
    }

    if (task.status === TaskStatus.COMPLETE) {
      throw new BadRequestException('Task already submitted');
    }

    const answerPdfUrl = await this.uploadPdf(answerPdf, 'tasks/submissions');

    const updatedTask = await this.prisma.client.task.update({
      where: { id: taskId },
      data: {
        answerPdfUrl,
        status: TaskStatus.COMPLETE,
        submittedAt: new Date(),
      },
      include: this.taskInclude,
    });

    return {
      message: 'Task submitted successfully',
      data: updatedTask,
    };
  }

  async getAdminTasks(adminId: string, query: TaskQueryDto) {
    await this.ensureUserRole(adminId, UserRole.ADMIN);

    const tasks = await this.prisma.client.task.findMany({
      where: this.buildTaskWhere(query),
      include: this.taskInclude,
      orderBy: {
        createdAt: 'desc',
      },
    });

    return {
      message: 'Tasks fetched successfully',
      data: tasks,
    };
  }
}
