import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma, StudentStatus } from '@prisma/client';
import { PrismaService } from '@database/prisma.service';
import { AuditLogService } from '@common/services/audit-log.service';
import { StorageService } from '@common/storage/storage.service';
import { PdfService } from '@common/pdf/pdf.service';
import { paginate } from '@common/dto/paginated-response.dto';
import { formatEntityCode } from '@common/utils/ids.util';
import { buildStudentQrPayload, renderQrDataUrl, renderQrPng } from '@common/utils/qr.util';
import { formatINR } from '@common/utils/money.util';
import type { EnvVars } from '@config/env.validation';
import type { AuthenticatedRequest } from '@common/types/authenticated-request';
import type { CreateStudentInput } from './dto/create-student.dto';
import type { UpdateStudentInput } from './dto/update-student.dto';
import type { AssignBatchInput, HistoryEntryInput, ListStudentsQuery } from './dto/list-students.dto';
import * as path from 'path';

const STUDENT_INCLUDE = {
  branch: { select: { id: true, name: true, code: true } },
  parentLinks: {
    include: {
      parent: {
        select: { id: true, firstName: true, lastName: true, email: true, phone: true },
      },
    },
  },
  batches: {
    include: {
      batch: {
        select: { id: true, name: true, classId: true, isActive: true },
      },
    },
  },
  _count: {
    select: {
      attendances: true,
      feeInvoices: true,
      payments: true,
      beltExams: true,
      certificates: true,
    },
  },
} as const;

@Injectable()
export class StudentsService {
  private readonly logger = new Logger(StudentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditLogService,
    private readonly storage: StorageService,
    private readonly pdf: PdfService,
    private readonly config: ConfigService<EnvVars, true>,
  ) {}

  // ── Create ────────────────────────────────────────────────────────────────
  async create(academyId: string, input: CreateStudentInput, req: AuthenticatedRequest) {
    if (input.branchId) await this.assertBranchInAcademy(academyId, input.branchId);
    if (input.parentId) await this.assertParentInAcademy(academyId, input.parentId);

    const student = await this.prisma.$transaction(async (tx) => {
      const settings = await tx.academySetting.findUnique({ where: { academyId } });
      const prefix = settings?.studentCodePrefix ?? 'STU';
      // Compute next code as (max numeric suffix among active students) + 1.
      // This makes soft-deleted students release their number so the sequence
      // truly restarts at 1 when the academy has no active students.
      const active = await tx.student.findMany({
        where: { academyId, deletedAt: null },
        select: { studentCode: true },
      });
      const suffixRegex = new RegExp(`^${prefix}-(\\d+)$`);
      const highest = active.reduce((max, s) => {
        const m = s.studentCode.match(suffixRegex);
        if (!m) return max;
        const n = parseInt(m[1], 10);
        return Number.isFinite(n) && n > max ? n : max;
      }, 0);
      const studentCode = formatEntityCode(prefix, highest + 1, 4);

      const { payload, signature } = buildStudentQrPayload({
        secret: this.config.get('QR_HMAC_SECRET', { infer: true }),
        academyId,
        studentCode,
      });

      const created = await tx.student.create({
        data: {
          academyId,
          branchId: input.branchId,
          studentCode,
          firstName: input.firstName,
          lastName: input.lastName,
          dateOfBirth: input.dateOfBirth,
          gender: input.gender,
          bloodGroup: input.bloodGroup,
          qrCode: payload,
          qrSignature: signature,
          admissionDate: input.admissionDate ?? new Date(),
          status: input.status ?? StudentStatus.ACTIVE,
          currentBelt: input.currentBelt,
          currentBeltSince: input.currentBeltSince,
          email: input.email,
          phone: input.phone,
          addressLine1: input.addressLine1,
          addressLine2: input.addressLine2,
          city: input.city,
          state: input.state,
          country: input.country,
          postalCode: input.postalCode,
          schoolName: input.schoolName,
          schoolClass: input.schoolClass,
          hobbies: input.hobbies,
          languages: input.languages,
          medicalConditions: input.medicalConditions,
          allergies: input.allergies,
          medications: input.medications,
          bloodPressure: input.bloodPressure,
          heightCm: input.heightCm,
          weightKg: input.weightKg,
          emergencyContactName: input.emergencyContactName,
          emergencyContactPhone: input.emergencyContactPhone,
          emergencyContactRelation: input.emergencyContactRelation,
          guardianName: input.guardianName,
          guardianPhone: input.guardianPhone,
          guardianEmail: input.guardianEmail,
          guardianOccupation: input.guardianOccupation,
          notes: input.notes,
        },
      });

      if (input.parentId) {
        await tx.parentStudent.create({
          data: {
            parentId: input.parentId,
            studentId: created.id,
            relationship: 'Guardian',
            isPrimary: true,
            canPickup: true,
          },
        });
      }
      if (input.batchIds?.length) {
        for (const batchId of input.batchIds) {
          const batch = await tx.batch.findFirst({ where: { id: batchId, academyId } });
          if (!batch) throw new BadRequestException(`Batch ${batchId} not found in this academy`);
          await tx.batchStudent.create({ data: { batchId, studentId: created.id } });
        }
      }
      await tx.studentHistory.create({
        data: {
          studentId: created.id,
          academyId,
          eventType: 'ADMISSION',
          title: 'Student admitted',
          description: `Admission recorded (${studentCode})`,
          occurredAt: created.admissionDate,
          createdBy: req.user?.id,
        },
      });
      return created;
    });

    await this.audit.fromRequest(req, 'CREATE', 'Student', student.id, { after: student });
    return this.findById(academyId, student.id);
  }

  // ── List / detail / search ────────────────────────────────────────────────
  async list(academyId: string, query: ListStudentsQuery) {
    const where: Prisma.StudentWhereInput = {
      academyId,
      deletedAt: null,
      ...(query.status ? { status: query.status } : {}),
      ...(query.belt ? { currentBelt: query.belt } : {}),
      ...(query.branchId ? { branchId: query.branchId } : {}),
      ...(query.batchId ? { batches: { some: { batchId: query.batchId } } } : {}),
      ...(query.admittedFrom || query.admittedTo
        ? {
            admissionDate: {
              ...(query.admittedFrom ? { gte: query.admittedFrom } : {}),
              ...(query.admittedTo ? { lte: query.admittedTo } : {}),
            },
          }
        : {}),
      ...(query.search
        ? {
            OR: [
              { firstName: { contains: query.search, mode: 'insensitive' } },
              { lastName: { contains: query.search, mode: 'insensitive' } },
              { studentCode: { contains: query.search, mode: 'insensitive' } },
              { email: { contains: query.search, mode: 'insensitive' } },
              { phone: { contains: query.search, mode: 'insensitive' } },
              { guardianName: { contains: query.search, mode: 'insensitive' } },
              { guardianPhone: { contains: query.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
    const orderBy: Prisma.StudentOrderByWithRelationInput = query.sortBy
      ? ({ [query.sortBy]: query.sortDir } as Prisma.StudentOrderByWithRelationInput)
      : { createdAt: 'desc' };

    const [total, rows] = await Promise.all([
      this.prisma.student.count({ where }),
      this.prisma.student.findMany({
        where,
        orderBy,
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        include: {
          branch: { select: { id: true, name: true, code: true } },
          _count: { select: { attendances: true, feeInvoices: true } },
        },
      }),
    ]);
    return paginate(rows, query.page, query.pageSize, total);
  }

  async findByUserId(academyId: string, userId: string) {
    const student = await this.prisma.student.findFirst({
      where: { academyId, userId, deletedAt: null },
      include: STUDENT_INCLUDE,
    });
    if (!student) throw new NotFoundException('Student profile not found');
    return student;
  }

  async findById(academyId: string, id: string) {
    const student = await this.prisma.student.findFirst({
      where: { id, academyId, deletedAt: null },
      include: STUDENT_INCLUDE,
    });
    if (!student) throw new NotFoundException('Student not found');
    return student;
  }

  async findByCode(academyId: string, code: string) {
    const student = await this.prisma.student.findFirst({
      where: { academyId, studentCode: code, deletedAt: null },
      include: STUDENT_INCLUDE,
    });
    if (!student) throw new NotFoundException('Student not found');
    return student;
  }

  // ── Update ────────────────────────────────────────────────────────────────
  async update(academyId: string, id: string, input: UpdateStudentInput, req: AuthenticatedRequest) {
    const before = await this.findById(academyId, id);
    if (input.branchId) await this.assertBranchInAcademy(academyId, input.branchId);

    const after = await this.prisma.student.update({
      where: { id },
      data: input as Prisma.StudentUpdateInput,
    });

    if (input.currentBelt && input.currentBelt !== before.currentBelt) {
      await this.prisma.studentHistory.create({
        data: {
          studentId: id,
          academyId,
          eventType: 'BELT_CHANGE',
          title: `Belt updated to ${input.currentBelt}`,
          description: `Changed from ${before.currentBelt} to ${input.currentBelt}`,
          data: { from: before.currentBelt, to: input.currentBelt },
          createdBy: req.user?.id,
        },
      });
    }
    if (input.status && input.status !== before.status) {
      await this.prisma.studentHistory.create({
        data: {
          studentId: id,
          academyId,
          eventType: 'STATUS_CHANGE',
          title: `Status changed to ${input.status}`,
          data: { from: before.status, to: input.status },
          createdBy: req.user?.id,
        },
      });
    }

    await this.audit.fromRequest(req, 'UPDATE', 'Student', id, { before, after });
    return this.findById(academyId, id);
  }

  async remove(academyId: string, id: string, req: AuthenticatedRequest) {
    const before = await this.findById(academyId, id);
    // Free the code slot so it can be reissued to a future student while still
    // preserving the historical row for audit/foreign-key integrity.
    const stamp = Date.now();
    const freedCode = `${before.studentCode}-DEL-${stamp}`;
    await this.prisma.student.update({
      where: { id },
      data: {
        deletedAt: new Date(),
        status: StudentStatus.INACTIVE,
        studentCode: freedCode,
      },
    });
    await this.audit.fromRequest(req, 'DELETE', 'Student', id, { before });
    return { deleted: true };
  }

  // ── Photo upload ──────────────────────────────────────────────────────────
  async uploadPhoto(
    academyId: string,
    id: string,
    file: { buffer: Buffer; mimetype: string; originalname: string; size: number },
    req: AuthenticatedRequest,
  ) {
    const student = await this.findById(academyId, id);
    if (!/^image\/(jpe?g|png|webp|gif)$/i.test(file.mimetype)) {
      throw new BadRequestException('Photo must be a JPEG, PNG, WEBP or GIF image');
    }
    if (file.size > 5 * 1024 * 1024) {
      throw new BadRequestException('Photo must be 5 MB or smaller');
    }
    const upload = await this.storage.upload({
      bucket: 'photos',
      keyPrefix: `students/${academyId}/${student.id}`,
      buffer: file.buffer,
      mimeType: file.mimetype,
      originalName: file.originalname,
      metadata: { studentCode: student.studentCode },
    });
    const after = await this.prisma.student.update({
      where: { id },
      data: { photoUrl: upload.url },
    });
    await this.audit.fromRequest(req, 'UPDATE', 'Student', id, {
      before: { photoUrl: student.photoUrl },
      after: { photoUrl: after.photoUrl },
    });
    return { photoUrl: after.photoUrl };
  }

  // ── QR ────────────────────────────────────────────────────────────────────
  async getQrPng(academyId: string, id: string): Promise<Buffer> {
    const student = await this.findById(academyId, id);
    return renderQrPng(student.qrCode);
  }

  // ── History ───────────────────────────────────────────────────────────────
  async addHistory(academyId: string, id: string, input: HistoryEntryInput, req: AuthenticatedRequest) {
    await this.findById(academyId, id);
    return this.prisma.studentHistory.create({
      data: {
        studentId: id,
        academyId,
        eventType: input.eventType,
        title: input.title,
        description: input.description,
        data: input.data as Prisma.InputJsonValue | undefined,
        occurredAt: input.occurredAt ?? new Date(),
        createdBy: req.user?.id,
      },
    });
  }

  async listHistory(academyId: string, id: string) {
    await this.findById(academyId, id);
    return this.prisma.studentHistory.findMany({
      where: { studentId: id, academyId },
      orderBy: { occurredAt: 'desc' },
      take: 200,
    });
  }

  // ── Batch assignment ──────────────────────────────────────────────────────
  async addToBatch(academyId: string, studentId: string, input: AssignBatchInput, req: AuthenticatedRequest) {
    const student = await this.findById(academyId, studentId);
    const batch = await this.prisma.batch.findFirst({
      where: { id: input.batchId, academyId, isActive: true },
    });
    if (!batch) throw new NotFoundException('Batch not found in this academy');
    try {
      const link = await this.prisma.batchStudent.create({
        data: { batchId: batch.id, studentId },
      });
      await this.audit.fromRequest(req, 'CREATE', 'BatchStudent', link.id, {
        after: { studentId: student.id, batchId: batch.id },
      });
      return link;
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new ConflictException('Student is already enrolled in this batch');
      }
      throw err;
    }
  }

  async removeFromBatch(academyId: string, studentId: string, batchId: string, req: AuthenticatedRequest) {
    await this.findById(academyId, studentId);
    const link = await this.prisma.batchStudent.findFirst({
      where: { studentId, batchId, batch: { academyId } },
    });
    if (!link) throw new NotFoundException('Batch enrolment not found');
    await this.prisma.batchStudent.update({
      where: { id: link.id },
      data: { leftAt: new Date() },
    });
    await this.audit.fromRequest(req, 'DELETE', 'BatchStudent', link.id, {
      before: { studentId, batchId },
    });
    return { removed: true };
  }

  // ── Exports ───────────────────────────────────────────────────────────────
  async exportCsv(academyId: string, query: ListStudentsQuery): Promise<string> {
    const students = await this.prisma.student.findMany({
      where: {
        academyId,
        deletedAt: null,
        ...(query.status ? { status: query.status } : {}),
        ...(query.belt ? { currentBelt: query.belt } : {}),
        ...(query.branchId ? { branchId: query.branchId } : {}),
      },
      orderBy: { studentCode: 'asc' },
      include: { branch: { select: { name: true, code: true } } },
    });

    const columns = [
      'studentCode', 'firstName', 'lastName', 'gender', 'dateOfBirth',
      'status', 'currentBelt', 'branch', 'phone', 'email',
      'guardianName', 'guardianPhone', 'admissionDate', 'city', 'state',
    ];

    const escape = (v: unknown): string => {
      if (v === null || v === undefined) return '';
      const s = v instanceof Date ? v.toISOString().slice(0, 10) : String(v);
      if (/[,"\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
      return s;
    };

    const rows = [columns.join(',')];
    for (const s of students) {
      rows.push([
        s.studentCode, s.firstName, s.lastName, s.gender, s.dateOfBirth,
        s.status, s.currentBelt, s.branch?.name ?? '', s.phone ?? '', s.email ?? '',
        s.guardianName ?? '', s.guardianPhone ?? '', s.admissionDate, s.city ?? '', s.state ?? '',
      ].map(escape).join(','));
    }
    return rows.join('\n');
  }

  async exportPdf(academyId: string, query: ListStudentsQuery): Promise<Buffer> {
    const [academy, students] = await Promise.all([
      this.prisma.academy.findUnique({
        where: { id: academyId },
        select: { name: true, city: true, state: true, primaryColor: true, logoUrl: true },
      }),
      this.prisma.student.findMany({
        where: {
          academyId,
          deletedAt: null,
          ...(query.status ? { status: query.status } : {}),
          ...(query.belt ? { currentBelt: query.belt } : {}),
          ...(query.branchId ? { branchId: query.branchId } : {}),
        },
        orderBy: { studentCode: 'asc' },
        include: { branch: { select: { name: true, code: true } } },
        take: 2000,
      }),
    ]);
    if (!academy) throw new NotFoundException('Academy not found');

    const templatePath = path.resolve(__dirname, 'templates', 'students-report.hbs');
    return this.pdf.renderTemplate({
      templatePath,
      context: {
        academyName: academy.name,
        academyLocation: [academy.city, academy.state].filter(Boolean).join(', '),
        academyLogoUrl: academy.logoUrl,
        primaryColor: academy.primaryColor ?? '#B91C1C',
        generatedAt: new Date().toLocaleString('en-IN'),
        totalCount: students.length,
        students: students.map((s, idx) => ({
          index: idx + 1,
          studentCode: s.studentCode,
          fullName: `${s.firstName} ${s.lastName}`,
          gender: s.gender,
          dob: s.dateOfBirth.toISOString().slice(0, 10),
          status: s.status,
          belt: s.currentBelt,
          branch: s.branch?.name ?? '—',
          phone: s.phone ?? s.guardianPhone ?? '—',
          admittedOn: s.admissionDate.toISOString().slice(0, 10),
        })),
      },
    });
  }

  // ── Per-student export (JSON) ─────────────────────────────────────────────
  async exportStudentJson(academyId: string, id: string): Promise<Record<string, unknown>> {
    const bundle = await this.buildStudentBundle(academyId, id);
    return {
      exportedAt: new Date().toISOString(),
      academy: bundle.academy,
      student: bundle.studentRaw,
      parents: bundle.parents,
      batches: bundle.batches,
      beltExams: bundle.beltExams,
      certificates: bundle.certificates,
      invoices: bundle.invoices,
      payments: bundle.payments,
      attendance: bundle.attendance,
      history: bundle.history,
    };
  }

  // ── Per-student export (PDF) ──────────────────────────────────────────────
  async exportStudentPdf(academyId: string, id: string): Promise<{ pdf: Buffer; filename: string }> {
    const bundle = await this.buildStudentBundle(academyId, id);
    const s = bundle.studentRaw;

    const dash = (v: unknown): string => {
      if (v === null || v === undefined) return '—';
      const str = v instanceof Date ? v.toISOString().slice(0, 10) : String(v);
      return str.trim() === '' ? '—' : str;
    };

    const initials = `${(s.firstName ?? '').charAt(0)}${(s.lastName ?? '').charAt(0)}`.toUpperCase() || 'S';
    const cityState = [s.city, s.state].filter(Boolean).join(', ');
    const schoolLabel = s.schoolName
      ? `${s.schoolName}${s.schoolClass ? ` (${s.schoolClass})` : ''}`
      : '—';

    let qrDataUrl: string | null = null;
    try {
      qrDataUrl = await renderQrDataUrl(s.qrCode);
    } catch {
      qrDataUrl = null;
    }

    const templatePath = path.resolve(__dirname, 'templates', 'student-profile.hbs');
    const pdf = await this.pdf.renderTemplate({
      templatePath,
      context: {
        academyName: bundle.academy.name,
        academyLocation: [bundle.academy.city, bundle.academy.state].filter(Boolean).join(', '),
        primaryColor: bundle.academy.primaryColor ?? '#B91C1C',
        generatedAt: new Date().toLocaleString('en-IN'),
        qrDataUrl,
        counts: bundle.counts,
        hasMedical: !!(s.medicalConditions || s.allergies || s.medications || s.bloodPressure),
        student: {
          studentCode: s.studentCode,
          fullName: `${s.firstName} ${s.lastName}`,
          initials,
          photoUrl: s.photoUrl ?? null,
          status: s.status,
          currentBelt: s.currentBelt,
          branch: bundle.branchName,
          dob: dash(s.dateOfBirth),
          gender: dash(s.gender),
          bloodGroup: dash(s.bloodGroup),
          height: s.heightCm ? `${s.heightCm} cm` : '—',
          weight: s.weightKg ? `${s.weightKg} kg` : '—',
          admissionDate: dash(s.admissionDate),
          currentBeltSince: dash(s.currentBeltSince),
          email: dash(s.email),
          phone: dash(s.phone),
          addressLine1: dash(s.addressLine1),
          cityState: cityState || '—',
          postalCode: dash(s.postalCode),
          school: schoolLabel,
          guardianName: dash(s.guardianName),
          guardianPhone: dash(s.guardianPhone),
          guardianEmail: dash(s.guardianEmail),
          guardianOccupation: dash(s.guardianOccupation),
          emergencyContactName: dash(s.emergencyContactName),
          emergencyContactPhone: dash(s.emergencyContactPhone),
          emergencyContactRelation: dash(s.emergencyContactRelation),
          medicalConditions: dash(s.medicalConditions),
          allergies: dash(s.allergies),
          medications: dash(s.medications),
          bloodPressure: dash(s.bloodPressure),
        },
        parents: bundle.parents.map((p) => ({
          name: `${p.firstName} ${p.lastName}`,
          relationship: dash(p.relationship),
          phone: dash(p.phone),
          email: dash(p.email),
        })),
        batches: bundle.batches.map((b) => ({
          name: b.batchName,
          joinedAt: dash(b.joinedAt),
          status: b.status,
        })),
        beltExams: bundle.beltExams.map((b) => ({
          examDate: dash(b.examDate),
          fromBelt: b.fromBelt,
          toBelt: b.toBelt,
          marks: b.totalMarks !== null ? `${b.totalMarks}${b.maxMarks ? ` / ${b.maxMarks}` : ''}` : '—',
          result: b.result,
        })),
        certificates: bundle.certificates.map((c) => ({
          certificateNumber: c.certificateNumber,
          title: c.title,
          type: c.type,
          issuedOn: dash(c.issuedOn),
          verificationCode: c.verificationCode,
        })),
        invoices: bundle.invoices.slice(0, 20).map((i) => ({
          invoiceNumber: i.invoiceNumber,
          dueDate: dash(i.dueDate),
          totalFormatted: formatINR(i.totalPaise),
          balanceFormatted: formatINR(i.balancePaise),
          status: i.status,
        })),
        attendance: bundle.attendance.slice(0, 15).map((a) => ({
          date: dash(a.date),
          status: a.status,
          note: dash(a.notes),
        })),
        history: bundle.history.slice(0, 20).map((h) => ({
          occurredAt: dash(h.occurredAt),
          eventType: h.eventType,
          title: h.title,
        })),
      },
    });

    const safeName = `${s.firstName}_${s.lastName}`.replace(/[^A-Za-z0-9_-]+/g, '').slice(0, 60);
    return {
      pdf,
      filename: `${s.studentCode}_${safeName || 'student'}.pdf`,
    };
  }

  private async buildStudentBundle(academyId: string, id: string) {
    const [academy, studentRaw, parentLinks, batchLinks, beltExams, certificates, invoices, payments, attendance, history] =
      await Promise.all([
        this.prisma.academy.findUnique({
          where: { id: academyId },
          select: { name: true, city: true, state: true, primaryColor: true, logoUrl: true },
        }),
        this.prisma.student.findFirst({
          where: { id, academyId, deletedAt: null },
          include: { branch: { select: { id: true, name: true, code: true } } },
        }),
        this.prisma.parentStudent.findMany({
          where: { studentId: id, parent: { academyId } },
          include: {
            parent: {
              select: { id: true, firstName: true, lastName: true, phone: true, email: true, occupation: true },
            },
          },
        }),
        this.prisma.batchStudent.findMany({
          where: { studentId: id, batch: { academyId } },
          include: { batch: { select: { id: true, name: true, isActive: true } } },
          orderBy: { joinedAt: 'desc' },
        }),
        this.prisma.beltExam.findMany({
          where: { studentId: id, academyId },
          orderBy: { examDate: 'desc' },
          take: 50,
        }),
        this.prisma.certificate.findMany({
          where: { studentId: id, academyId },
          orderBy: { issuedOn: 'desc' },
          take: 50,
        }),
        this.prisma.feeInvoice.findMany({
          where: { studentId: id, academyId },
          orderBy: { createdAt: 'desc' },
          take: 50,
        }),
        this.prisma.payment.findMany({
          where: { studentId: id, academyId },
          orderBy: { createdAt: 'desc' },
          take: 50,
        }),
        this.prisma.attendance.findMany({
          where: { studentId: id, academyId },
          orderBy: { date: 'desc' },
          take: 100,
        }),
        this.prisma.studentHistory.findMany({
          where: { studentId: id, academyId },
          orderBy: { occurredAt: 'desc' },
          take: 100,
        }),
      ]);

    if (!academy) throw new NotFoundException('Academy not found');
    if (!studentRaw) throw new NotFoundException('Student not found');

    return {
      academy,
      studentRaw,
      branchName: studentRaw.branch?.name ?? null,
      counts: {
        attendances: attendance.length,
        beltExams: beltExams.length,
        certificates: certificates.length,
        feeInvoices: invoices.length,
        payments: payments.length,
      },
      parents: parentLinks.map((link) => ({
        id: link.parent.id,
        firstName: link.parent.firstName,
        lastName: link.parent.lastName,
        phone: link.parent.phone,
        email: link.parent.email,
        occupation: link.parent.occupation,
        relationship: link.relationship,
        isPrimary: link.isPrimary,
      })),
      batches: batchLinks.map((link) => ({
        batchId: link.batchId,
        batchName: link.batch.name,
        joinedAt: link.joinedAt,
        leftAt: link.leftAt,
        status: link.leftAt ? 'INACTIVE' : link.batch.isActive ? 'ACTIVE' : 'INACTIVE',
      })),
      beltExams,
      certificates,
      invoices,
      payments,
      attendance,
      history,
    };
  }

  // ── Guards ────────────────────────────────────────────────────────────────
  private async assertBranchInAcademy(academyId: string, branchId: string): Promise<void> {
    const branch = await this.prisma.branch.findFirst({
      where: { id: branchId, academyId, deletedAt: null },
      select: { id: true },
    });
    if (!branch) throw new BadRequestException('Branch does not belong to this academy');
  }

  private async assertParentInAcademy(academyId: string, parentId: string): Promise<void> {
    const parent = await this.prisma.parent.findFirst({
      where: { id: parentId, academyId, deletedAt: null },
      select: { id: true },
    });
    if (!parent) throw new BadRequestException('Parent does not belong to this academy');
  }
}
