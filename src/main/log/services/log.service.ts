import { PrismaService } from '@/lib/prisma/prisma.service';
import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { UpdateStudentMarkDto } from '../dto/update-student-mark.dto';

@Injectable()
export class LogService {
  constructor(private readonly prisma: PrismaService) {}

  private readonly maxScorePerField = 50;

  private readonly studentLogScoreSelect = {
    id: true,
    studentId: true,
    tutorId: true,
    territoryExpansion: true,
    totalPoints: true,
    input: true,
    output: true,
    architecture: true,
    lexicon: true,
    dynamics: true,
    createdAt: true,
    updatedAt: true,
  } satisfies Prisma.StudentLogCompetencySelect;

  private formatStudentLog<
    T extends {
      territoryExpansion: Prisma.Decimal;
    },
  >(studentLog: T) {
    return {
      ...studentLog,
      territoryExpansion: Number(studentLog.territoryExpansion),
    };
  }

  private capScore(value: number) {
    return Math.min(value, this.maxScorePerField);
  }

  async getTutorStudentLog(studentId: string, tutorId: string) {
    const studentLog = await this.prisma.client.studentLogCompetency.findUnique(
      {
        where: {
          studentId_tutorId: {
            studentId,
            tutorId,
          },
        },
        select: this.studentLogScoreSelect,
      },
    );

    return {
      message: 'Student log fetched successfully',
      data: studentLog ? this.formatStudentLog(studentLog) : null,
    };
  }

  async getStudentLogsByStudent(studentId: string) {
    const studentLogs = await this.prisma.client.studentLogCompetency.findMany({
      where: {
        studentId,
      },
      select: this.studentLogScoreSelect,
      orderBy: {
        createdAt: 'desc',
      },
    });

    return {
      message: 'Student logs fetched successfully',
      data: studentLogs.map((studentLog) => this.formatStudentLog(studentLog)),
    };
  }

  async upsertStudentMark(
    studentId: string,
    tutorId: string,
    dto: UpdateStudentMarkDto,
  ) {
    const studentLog = await this.prisma.client.$transaction(async (tx) => {
      const existingLog = await tx.studentLogCompetency.findUnique({
        where: {
          studentId_tutorId: {
            studentId,
            tutorId,
          },
        },
        select: {
          id: true,
          input: true,
          output: true,
          architecture: true,
          lexicon: true,
          dynamics: true,
        },
      });

      const nextInput = this.capScore((existingLog?.input ?? 0) + dto.input);
      const nextOutput = this.capScore((existingLog?.output ?? 0) + dto.output);
      const nextArchitecture = this.capScore(
        (existingLog?.architecture ?? 0) + dto.architecture,
      );
      const nextLexicon = this.capScore(
        (existingLog?.lexicon ?? 0) + dto.lexicon,
      );
      const nextDynamics = this.capScore(
        (existingLog?.dynamics ?? 0) + dto.dynamics,
      );
      const totalPoints =
        nextInput + nextOutput + nextArchitecture + nextLexicon + nextDynamics;

      if (!existingLog) {
        return tx.studentLogCompetency.create({
          data: {
            studentId,
            tutorId,
            input: nextInput,
            output: nextOutput,
            architecture: nextArchitecture,
            lexicon: nextLexicon,
            dynamics: nextDynamics,
            totalPoints,
          },
          select: this.studentLogScoreSelect,
        });
      }

      return tx.studentLogCompetency.update({
        where: {
          id: existingLog.id,
        },
        data: {
          input: nextInput,
          output: nextOutput,
          architecture: nextArchitecture,
          lexicon: nextLexicon,
          dynamics: nextDynamics,
          totalPoints,
        },
        select: this.studentLogScoreSelect,
      });
    });

    return {
      message: 'Student mark saved successfully',
      data: this.formatStudentLog(studentLog),
    };
  }
}
