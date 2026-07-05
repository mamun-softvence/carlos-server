#!/usr/bin/env node

require('dotenv').config();

const fs = require('fs');
const path = require('path');
const { randomUUID } = require('crypto');
const { Client } = require('pg');

const BASE_URL = process.env.API_AUDIT_BASE_URL || 'http://localhost:3000/api/v1';
const REPORT_DIR = path.join(process.cwd(), 'api-audit-results');
const FIXTURE_DIR = path.join(process.cwd(), 'fixtures');
const PLAN_ID = 'e31e4048-81b9-41fe-935e-87cc01a175a5';

const FIXTURE_USERS = {
  admin: {
    email: 'admin@gmail.com',
    password: '123456',
  },
  tutor: {
    name: 'QA Tutor',
    email: 'qa.tutor.20260704@example.com',
    password: 'QaPass@123!',
    role: 'TUTOR',
  },
  student1: {
    name: 'QA Student One',
    email: 'qa.student1.20260704@example.com',
    password: 'QaPass@123!',
    role: 'STUDENT',
  },
  student2: {
    name: 'QA Student Two',
    email: 'qa.student2.20260704@example.com',
    password: 'QaPass@123!',
    role: 'STUDENT',
  },
  selfStudent: {
    email: 'qa.self.20260704@example.com',
    password: 'QaPass@123!',
  },
};

const FIXED_DATES = {
  studentRequestDate: '2026-07-10',
  assignedBookingAt: '2026-07-12T10:00:00.000Z',
  tutorBookingAt: '2026-07-13T10:00:00.000Z',
  casualBookingAt: '2026-07-14T10:00:00.000Z',
  recurringTimeOfDay: '09:00',
  taskDueAt: '2026-07-20T18:00:00.000Z',
};

const FILES = {
  avatar: path.join(FIXTURE_DIR, 'avatar.png'),
  taskPdf: path.join(FIXTURE_DIR, 'task.pdf'),
  answerPdf: path.join(FIXTURE_DIR, 'answer.pdf'),
};

const state = {
  ids: {},
  tokens: {},
  refreshTokens: {},
  report: {
    startedAt: new Date().toISOString(),
    baseUrl: BASE_URL,
    steps: [],
    vars: {},
  },
};

function log(message) {
  process.stdout.write(`${message}\n`);
}

function safeJsonParse(value) {
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function summarizeBody(body) {
  if (body === null || body === undefined) {
    return body;
  }

  if (Array.isArray(body)) {
    return { type: 'array', length: body.length };
  }

  if (typeof body !== 'object') {
    return body;
  }

  const summary = {};
  for (const key of ['success', 'message', 'meta', 'metadata']) {
    if (key in body) {
      summary[key] = body[key];
    }
  }

  if ('data' in body) {
    if (Array.isArray(body.data)) {
      summary.data = { type: 'array', length: body.data.length };
    } else if (body.data && typeof body.data === 'object') {
      summary.dataKeys = Object.keys(body.data);
    } else {
      summary.data = body.data;
    }
  } else {
    summary.keys = Object.keys(body);
  }

  return summary;
}

function getAuthHeader(token) {
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function parseResponse(response) {
  const text = await response.text();
  const body = text ? safeJsonParse(text) : null;
  return { status: response.status, body, headers: response.headers };
}

async function apiRequest(method, route, options = {}) {
  const headers = { ...(options.headers || {}) };
  const init = { method, headers };

  if (options.json !== undefined) {
    headers['Content-Type'] = 'application/json';
    init.body = JSON.stringify(options.json);
  } else if (options.formData) {
    init.body = options.formData;
  }

  const response = await fetch(`${BASE_URL}${route}`, init);
  const parsed = await parseResponse(response);

  if (options.expectStatus && parsed.status !== options.expectStatus) {
    throw new Error(
      `${method} ${route} failed with status ${parsed.status}: ${JSON.stringify(parsed.body, null, 2)}`,
    );
  }

  if (!options.allowFailure && parsed.status >= 400) {
    throw new Error(
      `${method} ${route} failed with status ${parsed.status}: ${JSON.stringify(parsed.body, null, 2)}`,
    );
  }

  return parsed;
}

async function runStep(name, fn) {
  const startedAt = Date.now();
  log(`• ${name}`);

  try {
    const result = await fn();
    const durationMs = Date.now() - startedAt;
    state.report.steps.push({
      name,
      ok: true,
      durationMs,
      response: summarizeBody(result),
    });
    return result;
  } catch (error) {
    const durationMs = Date.now() - startedAt;
    state.report.steps.push({
      name,
      ok: false,
      durationMs,
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

async function ensureServerReachable() {
  let lastError = null;
  for (let attempt = 1; attempt <= 5; attempt += 1) {
    try {
      const response = await fetch(`${BASE_URL}/docs/`);
      if (response.ok) {
        return;
      }
      lastError = new Error(`Health check returned ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    await sleep(1000 * attempt);
  }

  throw new Error(
    `API is not reachable at ${BASE_URL}. Start the Nest app first. Last error: ${
      lastError instanceof Error ? lastError.message : String(lastError)
    }`,
  );
}

function ensureFixtureFiles() {
  fs.mkdirSync(FIXTURE_DIR, { recursive: true });

  if (!fs.existsSync(FILES.avatar)) {
    const pngBase64 =
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9s2vNh8AAAAASUVORK5CYII=';
    fs.writeFileSync(FILES.avatar, Buffer.from(pngBase64, 'base64'));
  }

  const pdfBuffer = Buffer.from(
    '%PDF-1.1\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Count 1/Kids[3 0 R]>>endobj\n3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 300 144]/Contents 4 0 R/Resources<</Font<</F1 5 0 R>>>>>>endobj\n4 0 obj<</Length 48>>stream\nBT /F1 18 Tf 40 90 Td (QA Fixture PDF) Tj ET\nendstream\nendobj\n5 0 obj<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>endobj\nxref\n0 6\n0000000000 65535 f \n0000000009 00000 n \n0000000058 00000 n \n0000000115 00000 n \n0000000241 00000 n \n0000000340 00000 n \ntrailer<</Root 1 0 R/Size 6>>\nstartxref\n410\n%%EOF\n',
    'utf8',
  );

  if (!fs.existsSync(FILES.taskPdf)) {
    fs.writeFileSync(FILES.taskPdf, pdfBuffer);
  }

  if (!fs.existsSync(FILES.answerPdf)) {
    fs.writeFileSync(FILES.answerPdf, pdfBuffer);
  }
}

function toFile(filePath, mimeType) {
  const buffer = fs.readFileSync(filePath);
  return new File([buffer], path.basename(filePath), { type: mimeType });
}

async function withDb(fn) {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.end();
  }
}

async function getAdminUsers(adminToken, route) {
  const response = await apiRequest('GET', route, {
    headers: getAuthHeader(adminToken),
  });
  return response.body.data || [];
}

async function findUserByEmail(adminToken, email) {
  const [students, tutors] = await Promise.all([
    getAdminUsers(adminToken, '/admin/students'),
    getAdminUsers(adminToken, '/admin/tutors'),
  ]);

  const admins = [];
  const combined = [...students, ...tutors, ...admins];
  return combined.find((user) => user.email === email) || null;
}

async function login(email, password) {
  const response = await apiRequest('POST', '/auth/login', {
    json: { email, password },
  });

  const payload = response.body.data;
  return {
    token: payload.accessToken,
    refreshToken: payload.refreshToken,
    user: payload.user,
    response: response.body,
  };
}

async function tryLogin(email, password) {
  const response = await apiRequest('POST', '/auth/login', {
    json: { email, password },
    allowFailure: true,
  });

  if (response.status >= 400) {
    return null;
  }

  return {
    token: response.body.data.accessToken,
    refreshToken: response.body.data.refreshToken,
    user: response.body.data.user,
  };
}

async function adminDeleteUser(adminToken, userId) {
  return apiRequest('DELETE', `/admin/users/${userId}`, {
    headers: getAuthHeader(adminToken),
  });
}

async function adminCreateUser(adminToken, user) {
  return apiRequest('POST', '/admin/users', {
    headers: getAuthHeader(adminToken),
    json: {
      name: user.name,
      email: user.email,
      password: user.password,
      role: user.role,
    },
  });
}

async function adminUpdateUserStatus(adminToken, userId, status) {
  return apiRequest('PATCH', `/admin/users/${userId}/status`, {
    headers: getAuthHeader(adminToken),
    json: { status },
  });
}

async function ensureAdmin() {
  const adminLogin = await runStep('Admin login', () =>
    login(FIXTURE_USERS.admin.email, FIXTURE_USERS.admin.password),
  );

  state.tokens.ADMIN_TOKEN = adminLogin.token;
  state.refreshTokens.ADMIN_TOKEN = adminLogin.refreshToken;
  state.ids.ADMIN_ID = adminLogin.user.id;
}

async function ensureFixtureUser(userKey) {
  const fixtureUser = FIXTURE_USERS[userKey];
  const adminToken = state.tokens.ADMIN_TOKEN;
  let existingUser = await findUserByEmail(adminToken, fixtureUser.email);

  if (existingUser && existingUser.status !== 'ACTIVE') {
    await runStep(`Re-activate ${fixtureUser.email}`, () =>
      adminUpdateUserStatus(adminToken, existingUser.id, 'ACTIVE'),
    );
    existingUser = { ...existingUser, status: 'ACTIVE' };
  }

  let userLogin = await tryLogin(fixtureUser.email, fixtureUser.password);

  if (!existingUser) {
    await runStep(`Create ${fixtureUser.role.toLowerCase()} ${fixtureUser.email}`, () =>
      adminCreateUser(adminToken, fixtureUser),
    );
    existingUser = await findUserByEmail(adminToken, fixtureUser.email);
    userLogin = await login(fixtureUser.email, fixtureUser.password);
  } else if (!userLogin) {
    await runStep(`Recreate ${fixtureUser.email}`, async () => {
      await adminDeleteUser(adminToken, existingUser.id);
      await adminCreateUser(adminToken, fixtureUser);
    });

    existingUser = await findUserByEmail(adminToken, fixtureUser.email);
    userLogin = await login(fixtureUser.email, fixtureUser.password);
  }

  if (!existingUser || !userLogin) {
    throw new Error(`Unable to prepare fixture user ${fixtureUser.email}`);
  }

  const tokenKey = `${userKey.toUpperCase()}_TOKEN`;
  const idKey =
    userKey === 'student1'
      ? 'STUDENT1_ID'
      : userKey === 'student2'
        ? 'STUDENT2_ID'
        : 'TUTOR_ID';

  state.tokens[tokenKey] = userLogin.token;
  state.refreshTokens[tokenKey] = userLogin.refreshToken;
  state.ids[idKey] = existingUser.id;
}

async function ensureSelfRegisteredStudent() {
  const adminToken = state.tokens.ADMIN_TOKEN;
  let existingUser = await findUserByEmail(adminToken, FIXTURE_USERS.selfStudent.email);

  if (existingUser && existingUser.status !== 'ACTIVE') {
    await runStep(`Re-activate ${FIXTURE_USERS.selfStudent.email}`, () =>
      adminUpdateUserStatus(adminToken, existingUser.id, 'ACTIVE'),
    );
    existingUser = { ...existingUser, status: 'ACTIVE' };
  }

  let selfLogin = await tryLogin(
    FIXTURE_USERS.selfStudent.email,
    FIXTURE_USERS.selfStudent.password,
  );

  if (!existingUser) {
    const response = await runStep(`Register ${FIXTURE_USERS.selfStudent.email}`, () =>
      apiRequest('POST', '/auth/register', {
        json: {
          email: FIXTURE_USERS.selfStudent.email,
          password: FIXTURE_USERS.selfStudent.password,
          confirmPassword: FIXTURE_USERS.selfStudent.password,
          acceptedTerms: true,
        },
      }),
    );

    selfLogin = {
      token: response.body.data.accessToken,
      refreshToken: response.body.data.refreshToken,
      user: response.body.data.user,
    };
    existingUser = { id: selfLogin.user.id, email: selfLogin.user.email };
  } else if (!selfLogin) {
    await runStep(`Recreate ${FIXTURE_USERS.selfStudent.email}`, async () => {
      await adminDeleteUser(adminToken, existingUser.id);
      await apiRequest('POST', '/auth/register', {
        json: {
          email: FIXTURE_USERS.selfStudent.email,
          password: FIXTURE_USERS.selfStudent.password,
          confirmPassword: FIXTURE_USERS.selfStudent.password,
          acceptedTerms: true,
        },
      });
    });

    selfLogin = await login(
      FIXTURE_USERS.selfStudent.email,
      FIXTURE_USERS.selfStudent.password,
    );
    existingUser = { id: selfLogin.user.id, email: selfLogin.user.email };
  }

  if (!selfLogin) {
    throw new Error(`Unable to prepare self-registered user ${FIXTURE_USERS.selfStudent.email}`);
  }

  state.tokens.SELF_STUDENT_TOKEN = selfLogin.token;
  state.refreshTokens.SELF_STUDENT_TOKEN = selfLogin.refreshToken;
  state.ids.SELF_STUDENT_ID = existingUser.id;
}

async function seedStudentSupportData() {
  const now = new Date();
  const monthAhead = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

  await runStep('Seed credit balances and active subscription rows', () =>
    withDb(async (client) => {
      const creditTargets = [
        [state.ids.STUDENT1_ID, 8],
        [state.ids.STUDENT2_ID, 4],
        [state.ids.SELF_STUDENT_ID, 2],
      ];

      for (const [studentId, totalCredits] of creditTargets) {
        await client.query(
          `
            INSERT INTO "student_credit_balances" ("id", "studentId", "totalCredits", "createdAt", "updatedAt")
            VALUES ($1, $2, $3, NOW(), NOW())
            ON CONFLICT ("studentId")
            DO UPDATE SET "totalCredits" = EXCLUDED."totalCredits", "updatedAt" = NOW()
          `,
          [randomUUID(), studentId, totalCredits],
        );
      }

      const existingSubscription = await client.query(
        `
          SELECT "id"
          FROM "student_subscriptions"
          WHERE "studentId" = $1
            AND "status" = 'ACTIVE'
            AND ("endDate" IS NULL OR "endDate" > NOW())
          ORDER BY "createdAt" DESC
          LIMIT 1
        `,
        [state.ids.STUDENT1_ID],
      );

      let subscriptionId = existingSubscription.rows[0]?.id;

      if (!subscriptionId) {
        subscriptionId = randomUUID();
        await client.query(
          `
            INSERT INTO "student_subscriptions" (
              "id",
              "studentId",
              "planId",
              "status",
              "startDate",
              "endDate",
              "autoRenew",
              "createdAt",
              "updatedAt"
            )
            VALUES ($1, $2, $3, 'ACTIVE', $4, $5, true, NOW(), NOW())
          `,
          [subscriptionId, state.ids.STUDENT1_ID, PLAN_ID, now, monthAhead],
        );
      }

      const existingPayment = await client.query(
        `
          SELECT "id"
          FROM "student_subscription_payments"
          WHERE "studentSubscriptionId" = $1
          LIMIT 1
        `,
        [subscriptionId],
      );

      if (existingPayment.rowCount === 0) {
        await client.query(
          `
            INSERT INTO "student_subscription_payments" (
              "id",
              "studentId",
              "studentSubscriptionId",
              "planId",
              "amountPaid",
              "currency",
              "status",
              "paidAt",
              "createdAt",
              "updatedAt"
            )
            VALUES ($1, $2, $3, $4, 5000, 'usd', 'paid', NOW(), NOW(), NOW())
          `,
          [randomUUID(), state.ids.STUDENT1_ID, subscriptionId, PLAN_ID],
        );
      }

      return {
        student1Id: state.ids.STUDENT1_ID,
        student2Id: state.ids.STUDENT2_ID,
        selfStudentId: state.ids.SELF_STUDENT_ID,
        subscriptionId,
      };
    }),
  );
}

async function refreshToken(tokenKey) {
  const response = await apiRequest('POST', '/auth/refresh-token', {
    json: { refreshToken: state.refreshTokens[tokenKey] },
  });

  state.tokens[tokenKey] = response.body.data.accessToken;
  state.refreshTokens[tokenKey] = response.body.data.refreshToken;

  return response.body;
}

async function getProfile(tokenKey) {
  return apiRequest('GET', '/auth/profile', {
    headers: getAuthHeader(state.tokens[tokenKey]),
  });
}

async function logout(tokenKey) {
  return apiRequest('POST', '/auth/logout', {
    headers: getAuthHeader(state.tokens[tokenKey]),
  });
}

async function apiJsonStep(name, method, route, tokenKey, json) {
  return runStep(name, () =>
    apiRequest(method, route, {
      headers: getAuthHeader(state.tokens[tokenKey]),
      json,
    }),
  );
}

async function apiGetStep(name, route, tokenKey) {
  return runStep(name, () =>
    apiRequest('GET', route, {
      headers: getAuthHeader(state.tokens[tokenKey]),
    }),
  );
}

async function uploadStep(name, method, route, tokenKey, formValues) {
  return runStep(name, () => {
    const formData = new FormData();

    for (const [key, value] of Object.entries(formValues)) {
      formData.append(key, value);
    }

    return apiRequest(method, route, {
      headers: getAuthHeader(state.tokens[tokenKey]),
      formData,
    });
  });
}

function unwrapData(body) {
  return body && typeof body === 'object' && 'data' in body ? body.data : body;
}

async function runAudit() {
  await ensureServerReachable();
  ensureFixtureFiles();
  fs.mkdirSync(REPORT_DIR, { recursive: true });

  await ensureAdmin();
  await ensureFixtureUser('tutor');
  await ensureFixtureUser('student1');
  await ensureFixtureUser('student2');
  await ensureSelfRegisteredStudent();
  await seedStudentSupportData();

  for (const tokenKey of ['ADMIN_TOKEN', 'TUTOR_TOKEN', 'STUDENT1_TOKEN', 'STUDENT2_TOKEN']) {
    await runStep(`Refresh ${tokenKey}`, () => refreshToken(tokenKey));
  }

  for (const tokenKey of ['ADMIN_TOKEN', 'TUTOR_TOKEN', 'STUDENT1_TOKEN', 'STUDENT2_TOKEN']) {
    await runStep(`Profile ${tokenKey}`, () => getProfile(tokenKey));
  }

  await apiGetStep('Admin overview', '/admin/overview', 'ADMIN_TOKEN');
  await apiGetStep('Admin revenue growth', '/admin/revenue-growth?year=2026', 'ADMIN_TOKEN');
  await apiGetStep('Admin class distribution', '/admin/class-distribution?year=2026', 'ADMIN_TOKEN');
  await apiGetStep('Admin students', '/admin/students', 'ADMIN_TOKEN');
  await apiGetStep('Admin tutors', '/admin/tutors', 'ADMIN_TOKEN');

  await apiGetStep('Student mydata', '/student/mydata', 'STUDENT1_TOKEN');
  await apiGetStep('Student overview', '/student/overview', 'STUDENT1_TOKEN');
  await apiGetStep('Student credits', '/student/credits', 'STUDENT1_TOKEN');
  await apiGetStep('Student credit history', '/student/credit-history', 'STUDENT1_TOKEN');
  await apiGetStep('Student current subscription', '/student/subscriptions/current', 'STUDENT1_TOKEN');
  await apiJsonStep(
    'Student profile update',
    'PATCH',
    '/student/profile',
    'STUDENT1_TOKEN',
    {
      name: 'QA Student One Updated',
      phoneNumber: '+8801712345678',
      timeZone: 'Asia/Dhaka',
      googleCalendarEnabled: false,
    },
  );
  await uploadStep('Student profile image upload', 'PATCH', '/user/profile-image', 'STUDENT1_TOKEN', {
    avatar: toFile(FILES.avatar, 'image/png'),
  });

  const bookingRequest = await apiJsonStep(
    'Student booking request create',
    'POST',
    '/student/bookings/request',
    'STUDENT1_TOKEN',
    {
      topic: 'Physics Revision',
      note: 'Need help with vectors and motion.',
      requestedDate: FIXED_DATES.studentRequestDate,
      requestedTimeLabel: '4:00 PM - 5:00 PM',
    },
  );
  state.ids.REQUEST_BOOKING_ID = unwrapData(bookingRequest.body).id;

  await apiGetStep('Admin get all bookings', '/admin/bookings', 'ADMIN_TOKEN');
  await apiGetStep('Admin get booking rule', '/admin/bookings/booking-rule', 'ADMIN_TOKEN');
  await apiJsonStep(
    'Admin update booking rule',
    'PATCH',
    '/admin/bookings/booking-rule',
    'ADMIN_TOKEN',
    {
      minimumNoticeHours: 24,
      cancellationHours: 12,
    },
  );

  const assignedBooking = await apiJsonStep(
    'Admin assign tutor to booking request',
    'PATCH',
    `/admin/bookings/${state.ids.REQUEST_BOOKING_ID}/assign-tutor`,
    'ADMIN_TOKEN',
    {
      tutorId: state.ids.TUTOR_ID,
      scheduledAt: FIXED_DATES.assignedBookingAt,
      durationMinutes: 50,
      topic: 'Physics Revision',
      courseReference: 'PHY-101',
      moduleReference: 'Vectors',
      note: 'Admin assigned for QA flow.',
    },
  );
  state.ids.ASSIGNED_BOOKING_ID = unwrapData(assignedBooking.body).id;

  await apiGetStep('Student bookings', '/student/bookings', 'STUDENT1_TOKEN');
  await apiGetStep('Tutor bookings after admin assignment', '/tutor/bookings', 'TUTOR_TOKEN');
  await apiGetStep('Tutor students', '/tutor/students', 'TUTOR_TOKEN');

  const tutorBooking = await apiJsonStep(
    'Tutor create group booking',
    'POST',
    '/tutor/bookings',
    'TUTOR_TOKEN',
    {
      studentIds: [state.ids.STUDENT1_ID, state.ids.STUDENT2_ID],
      scheduledAt: FIXED_DATES.tutorBookingAt,
      durationMinutes: 50,
      topic: 'Group Algebra',
      courseReference: 'MTH-201',
      moduleReference: 'Algebra',
      note: 'Group session for QA.',
    },
  );
  state.ids.TUTOR_BOOKING_ID = unwrapData(tutorBooking.body).id;

  const recurringSchedule = await apiJsonStep(
    'Tutor create recurring schedule',
    'POST',
    '/tutor/recurring-schedules',
    'TUTOR_TOKEN',
    {
      studentId: state.ids.STUDENT1_ID,
      title: 'Weekly Math Slot',
      description: 'Recurring QA slot',
      tags: ['qa', 'weekly'],
      frequency: 'WEEKLY',
      dayOfWeek: [1],
      timeOfDay: FIXED_DATES.recurringTimeOfDay,
      durationHours: 1,
      openingWindowDays: 7,
    },
  );
  state.ids.RECURRING_SCHEDULE_ID = unwrapData(recurringSchedule.body).id;

  await apiGetStep('Tutor list recurring schedules', '/tutor/recurring-schedules', 'TUTOR_TOKEN');
  await apiGetStep(
    'Tutor get recurring schedule by id',
    `/tutor/recurring-schedules/${state.ids.RECURRING_SCHEDULE_ID}`,
    'TUTOR_TOKEN',
  );
  await apiGetStep(
    'Tutor preview recurring schedule',
    `/tutor/recurring-schedules/${state.ids.RECURRING_SCHEDULE_ID}/preview`,
    'TUTOR_TOKEN',
  );
  await apiJsonStep(
    'Tutor update recurring schedule',
    'PATCH',
    `/tutor/recurring-schedules/${state.ids.RECURRING_SCHEDULE_ID}`,
    'TUTOR_TOKEN',
    {
      title: 'Weekly Math Slot Updated',
      description: 'Updated recurring QA slot',
      tags: ['qa', 'weekly', 'updated'],
      frequency: 'WEEKLY',
      dayOfWeek: [1],
      timeOfDay: FIXED_DATES.recurringTimeOfDay,
      durationHours: 1,
      openingWindowDays: 30,
    },
  );
  await apiGetStep(
    'Tutor check overlap',
    `/tutor/bookings/check-overlap?scheduledAt=${encodeURIComponent(
      FIXED_DATES.tutorBookingAt,
    )}&durationMinutes=50`,
    'TUTOR_TOKEN',
  );

  const casualBooking = await apiJsonStep(
    'Tutor create casual booking',
    'POST',
    '/tutor/bookings/casual',
    'TUTOR_TOKEN',
    {
      studentId: state.ids.STUDENT1_ID,
      title: 'Casual Chemistry Slot',
      description: 'One-off QA booking',
      tags: ['qa', 'casual'],
      scheduledAt: FIXED_DATES.casualBookingAt,
      durationMinutes: 50,
    },
  );
  state.ids.CASUAL_BOOKING_ID = unwrapData(casualBooking.body).id;

  await apiGetStep('Tutor bookings after scheduling', '/tutor/bookings', 'TUTOR_TOKEN');
  await apiGetStep(
    'Tutor get booking by id',
    `/tutor/bookings/${state.ids.CASUAL_BOOKING_ID}`,
    'TUTOR_TOKEN',
  );
  await apiJsonStep(
    'Tutor trigger recurring generator',
    'POST',
    '/tutor/bookings/trigger-generator',
    'TUTOR_TOKEN',
  );

  await apiGetStep(
    'Booking live class details',
    `/bookings/${state.ids.ASSIGNED_BOOKING_ID}/live-class`,
    'TUTOR_TOKEN',
  );
  await apiGetStep(
    'Booking live class messages',
    `/bookings/${state.ids.ASSIGNED_BOOKING_ID}/live-class/messages`,
    'TUTOR_TOKEN',
  );
  await apiJsonStep(
    'Booking live class start',
    'PATCH',
    `/bookings/${state.ids.ASSIGNED_BOOKING_ID}/live-class/start`,
    'TUTOR_TOKEN',
    {},
  );
  await apiJsonStep(
    'Booking live class create message',
    'PATCH',
    `/bookings/${state.ids.ASSIGNED_BOOKING_ID}/live-class/messages`,
    'TUTOR_TOKEN',
    { message: 'Live class message from tutor via booking route.' },
  );
  await apiJsonStep(
    'Booking live class end',
    'PATCH',
    `/bookings/${state.ids.ASSIGNED_BOOKING_ID}/live-class/end`,
    'TUTOR_TOKEN',
    {},
  );

  await apiGetStep('Session details', `/sessions/${state.ids.TUTOR_BOOKING_ID}`, 'TUTOR_TOKEN');
  await apiJsonStep(
    'Session start',
    'PATCH',
    `/sessions/${state.ids.TUTOR_BOOKING_ID}/start`,
    'TUTOR_TOKEN',
    {},
  );
  await apiJsonStep(
    'Session Agora token',
    'POST',
    `/sessions/${state.ids.TUTOR_BOOKING_ID}/agora-token`,
    'TUTOR_TOKEN',
    {},
  );
  await apiGetStep('Session messages list', `/sessions/${state.ids.TUTOR_BOOKING_ID}/messages`, 'TUTOR_TOKEN');

  const createdSessionMessage = await apiJsonStep(
    'Session create message',
    'POST',
    `/sessions/${state.ids.TUTOR_BOOKING_ID}/messages`,
    'TUTOR_TOKEN',
    { content: 'Session message from tutor via session route.' },
  );
  state.ids.SESSION_MESSAGE_ID = unwrapData(createdSessionMessage.body).id;

  const savedSessionMessage = await apiJsonStep(
    'Session save message',
    'POST',
    `/sessions/${state.ids.TUTOR_BOOKING_ID}/messages/saved`,
    'TUTOR_TOKEN',
    { messageId: state.ids.SESSION_MESSAGE_ID },
  );
  state.ids.SAVED_MESSAGE_ID = unwrapData(savedSessionMessage.body).savedMessage?.id;

  await apiGetStep(
    'Session saved messages list',
    `/sessions/${state.ids.TUTOR_BOOKING_ID}/messages/saved`,
    'TUTOR_TOKEN',
  );
  await apiGetStep('Session tasks before task creation', `/sessions/${state.ids.TUTOR_BOOKING_ID}/tasks`, 'TUTOR_TOKEN');
  await apiJsonStep(
    'Session create shared PDF',
    'POST',
    `/sessions/${state.ids.TUTOR_BOOKING_ID}/shared-pdfs`,
    'TUTOR_TOKEN',
    {
      title: 'Session Notes PDF',
      messageIds: [state.ids.SESSION_MESSAGE_ID],
    },
  );
  await apiGetStep('Session shared PDFs list', `/sessions/${state.ids.TUTOR_BOOKING_ID}/shared-pdfs`, 'TUTOR_TOKEN');

  await apiGetStep('Message contacts', '/messages/contacts', 'STUDENT1_TOKEN');
  const directConversation = await apiJsonStep(
    'Create direct conversation',
    'POST',
    '/messages/conversations/direct',
    'STUDENT1_TOKEN',
    { receiverId: state.ids.TUTOR_ID },
  );
  state.ids.CONVERSATION_ID = unwrapData(directConversation.body).id;

  await apiJsonStep('Send direct message', 'POST', '/messages/direct', 'STUDENT1_TOKEN', {
    receiverId: state.ids.TUTOR_ID,
    content: "Can we review yesterday's class?",
  });
  await apiGetStep('Message conversations list', '/messages/conversations', 'STUDENT1_TOKEN');
  await apiGetStep(
    'Get conversation by id',
    `/messages/conversations/${state.ids.CONVERSATION_ID}`,
    'STUDENT1_TOKEN',
  );
  await apiGetStep(
    'Get conversation messages',
    `/messages/conversations/${state.ids.CONVERSATION_ID}/messages`,
    'STUDENT1_TOKEN',
  );
  await apiJsonStep(
    'Send existing conversation message',
    'POST',
    `/messages/conversations/${state.ids.CONVERSATION_ID}/messages`,
    'STUDENT1_TOKEN',
    { content: 'Follow-up message in existing conversation.' },
  );

  const createdTask = await uploadStep('Tutor create task', 'POST', '/tutor/tasks', 'TUTOR_TOKEN', {
    bookingId: state.ids.TUTOR_BOOKING_ID,
    studentId: state.ids.STUDENT1_ID,
    title: 'QA Homework 01',
    dueDate: FIXED_DATES.taskDueAt,
    pdf: toFile(FILES.taskPdf, 'application/pdf'),
  });
  state.ids.TASK_ID = unwrapData(createdTask.body).id;

  await apiGetStep('Tutor tasks list', '/tutor/tasks', 'TUTOR_TOKEN');
  await apiGetStep('Admin tasks list', '/admin/tasks', 'ADMIN_TOKEN');
  await apiGetStep('Student tasks list', '/student/tasks', 'STUDENT1_TOKEN');
  await apiGetStep('Student get task by id', `/student/tasks/${state.ids.TASK_ID}`, 'STUDENT1_TOKEN');
  await uploadStep(
    'Student submit task answer',
    'PATCH',
    `/student/tasks/${state.ids.TASK_ID}/submit`,
    'STUDENT1_TOKEN',
    { answerPdf: toFile(FILES.answerPdf, 'application/pdf') },
  );
  await apiGetStep('Session tasks after task creation', `/sessions/${state.ids.TUTOR_BOOKING_ID}/tasks`, 'TUTOR_TOKEN');

  const unreadNotifications = await apiGetStep(
    'Notifications unread list',
    '/notifications?isRead=false&limit=50',
    'STUDENT1_TOKEN',
  );
  const notificationItems = unreadNotifications.body.data || [];
  const firstUnread = notificationItems.find((item) => item.readAt === null);
  if (!firstUnread) {
    throw new Error('No unread notification found for STUDENT1 after message/task/booking workflow');
  }
  state.ids.NOTIFICATION_ID = firstUnread.id;

  await apiGetStep('Notifications unread count', '/notifications/unread-count', 'STUDENT1_TOKEN');
  await apiJsonStep(
    'Mark single notification as read',
    'PATCH',
    `/notifications/${state.ids.NOTIFICATION_ID}/read`,
    'STUDENT1_TOKEN',
    {},
  );
  await apiJsonStep('Mark all notifications as read', 'PATCH', '/notifications/read-all', 'STUDENT1_TOKEN', {});

  await apiGetStep(
    'Tutor get student log',
    `/tutor/logs/students/${state.ids.STUDENT1_ID}`,
    'TUTOR_TOKEN',
  );
  await apiJsonStep(
    'Tutor update student competency mark',
    'PATCH',
    `/tutor/logs/students/${state.ids.STUDENT1_ID}/mark`,
    'TUTOR_TOKEN',
    {
      input: 4,
      output: 4,
      architecture: 4,
      lexicon: 4,
      dynamics: 4,
    },
  );
  await apiGetStep('Student logs', '/student/logs', 'STUDENT1_TOKEN');
  await apiGetStep(
    'Admin student overview log route',
    `/admin/logs/students/${state.ids.STUDENT1_ID}/overview`,
    'ADMIN_TOKEN',
  );
  await apiGetStep(
    'Admin student profile log route',
    `/admin/logs/students/${state.ids.STUDENT1_ID}/profile`,
    'ADMIN_TOKEN',
  );
  await apiGetStep(
    'Admin student logs route',
    `/admin/logs/students/${state.ids.STUDENT1_ID}/logs`,
    'ADMIN_TOKEN',
  );
  await apiGetStep(
    'Admin student bookings history route',
    `/admin/logs/students/${state.ids.STUDENT1_ID}/bookings`,
    'ADMIN_TOKEN',
  );
  await apiGetStep(
    'Admin student upcoming classes route',
    `/admin/logs/students/${state.ids.STUDENT1_ID}/upcoming-classes`,
    'ADMIN_TOKEN',
  );
  await apiGetStep(
    'Admin student transactions route',
    `/admin/logs/students/${state.ids.STUDENT1_ID}/transactions`,
    'ADMIN_TOKEN',
  );
  await apiGetStep(
    'Admin student tutors route',
    `/admin/logs/students/${state.ids.STUDENT1_ID}/tutors`,
    'ADMIN_TOKEN',
  );
  await apiGetStep(
    'Admin student aggregate route',
    `/admin/logs/students/${state.ids.STUDENT1_ID}`,
    'ADMIN_TOKEN',
  );
  await apiJsonStep(
    'Admin update student competency mark',
    'PATCH',
    `/admin/logs/students/${state.ids.STUDENT1_ID}/tutors/${state.ids.TUTOR_ID}/mark`,
    'ADMIN_TOKEN',
    {
      input: 4,
      output: 4,
      architecture: 4,
      lexicon: 4,
      dynamics: 4,
    },
  );

  await apiGetStep('Admin subscriptions list', '/admin/subscriptions', 'ADMIN_TOKEN');
  await apiGetStep('Admin subscriptions history', '/admin/subscriptions/history', 'ADMIN_TOKEN');
  const tempPlan = await apiJsonStep(
    'Admin create temporary subscription plan',
    'POST',
    '/admin/subscriptions',
    'ADMIN_TOKEN',
    {
      name: 'QA Temp Plan',
      price: '99.00',
      durationDays: '30',
      creditsPerMonth: '4',
      features: {
        sessionsPerMonth: 4,
        support: 'email',
      },
      currency: 'usd',
      billingInterval: 'month',
      isActive: true,
    },
  );
  state.ids.TEMP_PLAN_ID = unwrapData(tempPlan.body).id;

  await apiJsonStep(
    'Admin update temporary subscription plan',
    'PATCH',
    `/admin/subscriptions/${state.ids.TEMP_PLAN_ID}`,
    'ADMIN_TOKEN',
    {
      name: 'QA Temp Plan Updated',
      price: '109.00',
      creditsPerMonth: '5',
      currency: 'usd',
      billingInterval: 'month',
      isActive: true,
    },
  );
  await runStep('Admin delete temporary subscription plan', () =>
    apiRequest('DELETE', `/admin/subscriptions/${state.ids.TEMP_PLAN_ID}`, {
      headers: getAuthHeader(state.tokens.ADMIN_TOKEN),
    }),
  );

  await apiJsonStep(
    'Cancel casual booking',
    'PATCH',
    `/bookings/${state.ids.CASUAL_BOOKING_ID}/cancel`,
    'TUTOR_TOKEN',
    { cancelReason: 'QA cancellation flow validation.' },
  );

  await apiJsonStep(
    'Delete recurring schedule',
    'DELETE',
    `/tutor/recurring-schedules/${state.ids.RECURRING_SCHEDULE_ID}`,
    'TUTOR_TOKEN',
  );

  await apiJsonStep(
    'Set self student inactive',
    'PATCH',
    `/admin/users/${state.ids.SELF_STUDENT_ID}/status`,
    'ADMIN_TOKEN',
    { status: 'INACTIVE' },
  );
  await apiJsonStep(
    'Set self student active',
    'PATCH',
    `/admin/users/${state.ids.SELF_STUDENT_ID}/status`,
    'ADMIN_TOKEN',
    { status: 'ACTIVE' },
  );
  await runStep('Delete self student fixture', () =>
    apiRequest('DELETE', `/admin/users/${state.ids.SELF_STUDENT_ID}`, {
      headers: getAuthHeader(state.tokens.ADMIN_TOKEN),
    }),
  );

  await apiJsonStep('Session end', 'PATCH', `/sessions/${state.ids.TUTOR_BOOKING_ID}/end`, 'TUTOR_TOKEN', {});

  for (const tokenKey of ['STUDENT1_TOKEN', 'STUDENT2_TOKEN', 'TUTOR_TOKEN', 'ADMIN_TOKEN']) {
    await runStep(`Logout ${tokenKey}`, () => logout(tokenKey));
  }
}

function writeReport(error) {
  state.report.finishedAt = new Date().toISOString();
  state.report.vars = {
    ...state.tokens,
    ...state.ids,
  };

  if (error) {
    state.report.ok = false;
    state.report.error = error instanceof Error ? error.message : String(error);
  } else {
    state.report.ok = true;
  }

  const reportPath = path.join(REPORT_DIR, 'latest.json');
  fs.writeFileSync(reportPath, JSON.stringify(state.report, null, 2));
  log(`Audit report written to ${reportPath}`);
}

async function main() {
  try {
    await runAudit();
    writeReport();
    log('Sequential API audit completed successfully.');
  } catch (error) {
    writeReport(error);
    log(error instanceof Error ? error.stack || error.message : String(error));
    process.exitCode = 1;
  }
}

main();
