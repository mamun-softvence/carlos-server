# Frontend API Integration Guide: Tutor Recurring Schedules & Casual Bookings

This document provides a guide for frontend developers to integrate the new Tutor Recurring Schedule and Casual (One-Off) Booking workflow.

All endpoints require Bearer Token authentication via the `Authorization` header.

---

## 1. Authentication

### Log In (Tutor / User)
Authenticates the user and retrieves the JSON Web Token (JWT).
* **Route**: `POST /auth/login`
* **cURL Request**:
  ```bash
  curl -X POST http://localhost:3000/api/v1/auth/login \
    -H "Content-Type: application/json" \
    -d '{
      "email": "tutor@example.com",
      "password": "Password123"
    }'
  ```
* **Response Sample (200 OK)**:
  ```json
  {
    "statusCode": 200,
    "message": "User logged in successfully",
    "data": {
      "user": {
        "id": "tutor-uuid-1111",
        "email": "tutor@example.com",
        "role": "TUTOR"
      },
      "accessToken": "eyJhbGciOi...",
      "refreshToken": "eyJhbGciOi..."
    }
  }
  ```

---

## 2. Check Overlap
Before creating a casual booking or a recurring template, check if the proposed slot conflicts with another booking or recurring schedule template.
* **Route**: `GET /tutor/bookings/check-overlap`
* **Query Parameters**:
  * `scheduledAt` (Required): ISO-8601 Datetime string.
  * `durationMinutes` (Required): Must be `50`.
  * `excludeId` (Optional): ID of a schedule or booking to ignore (useful during edits).
* **cURL Request**:
  ```bash
  curl -X GET "http://localhost:3000/api/v1/tutor/bookings/check-overlap?scheduledAt=2026-07-10T14:00:00.000Z&durationMinutes=50" \
    -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
  ```
* **Response Sample (No Conflict)**:
  ```json
  {
    "overlapping": false,
    "conflictType": null,
    "conflict": null
  }
  ```
* **Response Sample (Conflict Detected)**:
  ```json
  {
    "overlapping": true,
    "conflictType": "RECURRING_TEMPLATE",
    "conflict": {
      "id": "schedule-uuid-9999",
      "title": "Weekly Math Class",
      "scheduledAt": "2026-07-10T14:00:00.000Z",
      "durationMinutes": 50,
      "frequency": "WEEKLY"
    }
  }
  ```

---

## 3. Recurring Schedules

### Create a Recurring Schedule Template
Adds a recurring schedule template slot with optional syllabus configuration (`occurrencesConfig`). The backend automatically calculates the exact `startDate` based on your timing configurations.
When the template is created, the backend immediately materializes matching `Booking` rows within `openingWindowDays`; tutors do not need to wait for the first cron run.
* **Route**: `POST /tutor/recurring-schedules`
* **Request Parameters**:
  * `frequency` (Required): `"DAILY" | "WEEKLY" | "BIWEEKLY" | "MONTHLY"`.
  * `timeOfDay` (Required): `"HH:MM"` (24-hour format, e.g. `"14:00"`).
  * `dayOfWeek` (Required if WEEKLY or BIWEEKLY): `0` (Sunday) to `6` (Saturday).
  * `dayOfMonth` (Required if MONTHLY): `1` to `31`.
  * `startFromDate` (Optional): ISO-8601 Date-time string indicating the starting point (e.g. `"2026-07-04T00:00:00.000Z"`). Defaults to current date.
  * `endDate` (Optional): ISO-8601 Date-time string indicating when the recurring cycle ends.
  * `durationHours` (Required): Class length: `1` to `5` hours. Generates separate 50-minute booking sessions.
  * `isPackage` (Optional): Boolean. If `true` (default), adjacent hourly segments for the same occurrence must be booked together.
  * `openingWindowDays` (Required): Any integer between `1` and `2000`.
  * `studentId` (Optional): UUID of a pre-booked student. If `null`, this acts as an **open slot**.
  * `title` (Optional): Topic of generated classes.
  * `description` (Optional): Info notes.
  * `tags` (Optional): Array of string labels.
  * `lessonType` (Optional): `"REGULAR" | "CONVERSATION" | "BOTH"`. Defaults to `"REGULAR"`.
  * `blockedDateRanges` (Optional): JSON Array of date range objects where bookings should NOT be generated:
    * `startDate` (Required): `"YYYY-MM-DD"` format (e.g. `"2026-07-10"`).
    * `endDate` (Required): `"YYYY-MM-DD"` format (e.g. `"2026-07-15"`).
  * `occurrencesConfig` (Optional): JSON Array of occurrence configurations:
    * `scheduledAt` (Required): ISO-8601 Datetime string representing the exact class time.
    * `title` (Optional): Specific topic for this class.
    * `description` (Optional): Specific description for this class.
    * `tags` (Optional): Specific array of string labels for this class.
    * `lessonType` (Optional): `"REGULAR" | "CONVERSATION" | "BOTH"`. Overrides the schedule-level setting for this occurrence.
* **cURL Request**:
  ```bash
  curl -X POST http://localhost:3000/api/v1/tutor/recurring-schedules \
    -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
    -H "Content-Type: application/json" \
    -d '{
      "frequency": "WEEKLY",
      "dayOfWeek": 3,
      "timeOfDay": "14:00",
      "startFromDate": "2026-07-04T00:00:00.000Z",
      "endDate": "2026-08-31T23:59:59.000Z",
      "durationHours": 3,
      "isPackage": true,
      "openingWindowDays": 30,
      "title": "Physics Lab",
      "description": "Weekly lab session",
      "tags": ["Physics", "Lab"],
      "lessonType": "BOTH",
      "blockedDateRanges": [
        {
          "startDate": "2026-07-20",
          "endDate": "2026-07-25"
        }
      ],
      "occurrencesConfig": [
        { 
          "scheduledAt": "2026-07-08T14:00:00.000Z",
          "title": "Lab 1: Vectors", 
          "description": "Forces & vector math",
          "tags": ["Physics", "Vectors"],
          "lessonType": "REGULAR"
        },
        { 
          "scheduledAt": "2026-07-15T14:00:00.000Z",
          "title": "Lab 2: Acceleration", 
          "description": "Gravity & free fall experiments",
          "lessonType": "CONVERSATION"
        }
      ]
    }'
  ```
* **Response Sample (201 Created)**:
  ```json
  {
    "message": "Recurring schedule created successfully",
    "data": {
      "id": "schedule-uuid-9999",
      "tutorId": "tutor-uuid-1111",
      "studentId": null,
      "title": "Physics Lab",
      "description": "Weekly lab session",
      "tags": ["Physics", "Lab"],
      "frequency": "WEEKLY",
      "dayOfWeek": 3,
      "dayOfMonth": null,
      "timeOfDay": "14:00",
      "startDate": "2026-07-08T14:00:00.000Z",
      "endDate": "2026-08-31T23:59:59.000Z",
      "durationHours": 3,
      "isPackage": true,
      "lessonType": "BOTH",
      "openingWindowDays": 30,
      "isActive": true,
      "blockedDateRanges": [
        {
          "startDate": "2026-07-20",
          "endDate": "2026-07-25"
        }
      ],
      "lastGeneratedUpTo": null,
      "occurrencesConfig": [
        { 
          "scheduledAt": "2026-07-08T14:00:00.000Z",
          "title": "Lab 1: Vectors", 
          "description": "Forces & vector math",
          "tags": ["Physics", "Vectors"],
          "lessonType": "REGULAR"
        },
        { 
          "scheduledAt": "2026-07-15T14:00:00.000Z",
          "title": "Lab 2: Acceleration", 
          "description": "Gravity & free fall experiments",
          "tags": null,
          "lessonType": "CONVERSATION"
        }
      ],
      "createdAt": "2026-07-04T08:50:00.000Z",
      "updatedAt": "2026-07-04T08:50:00.000Z",
      "bookings": [
        {
          "id": "booking-uuid-0001",
          "recurringScheduleId": "schedule-uuid-9999",
          "tutorBookingType": "RECURRING",
          "status": "SCHEDULED",
          "scheduledAt": "2026-07-08T14:00:00.000Z",
          "durationMinutes": 50,
          "isPackage": true,
          "lessonType": "REGULAR"
        }
      ]
    }
  }
  ```

---

### List Recurring Schedules
Retrieve all recurring schedule templates created by the logged-in tutor.
* **Route**: `GET /tutor/recurring-schedules`
* **cURL Request**:
  ```bash
  curl -X GET http://localhost:3000/api/v1/tutor/recurring-schedules \
    -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
  ```

### Get Schedule Details
Retrieve a single template setup.
* **Route**: `GET /tutor/recurring-schedules/:id`
* **cURL Request**:
  ```bash
  curl -X GET http://localhost:3000/api/v1/tutor/recurring-schedules/schedule-uuid-9999 \
    -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
  ```

### Preview Generated Dates
Returns all date/time entries this template will generate inside the active `openingWindowDays` parameter without writing them to the database.
* **Route**: `GET /tutor/recurring-schedules/:id/preview`
* **cURL Request**:
  ```bash
  curl -X GET http://localhost:3000/api/v1/tutor/recurring-schedules/schedule-uuid-9999/preview \
    -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
  ```
* **Response Sample (200 OK)**:
  ```json
  {
    "message": "Schedule dates preview computed successfully",
    "data": [
      "2026-07-08T14:00:00.000Z",
      "2026-07-15T14:00:00.000Z",
      "2026-07-22T14:00:00.000Z",
      "2026-07-29T14:00:00.000Z"
    ]
  }
  ```

### Update a Recurring Schedule
Update a recurring slot configuration, syllabus, or deactivate it.

* **Route**: `PATCH /tutor/recurring-schedules/:id`
* **Syncing Behavior**:
  * **Timing/Structural Changes** (`startDate`, `frequency`, `durationMinutes`, `lessonType`): Cleans up all future unbooked generated bookings (`studentId IS NULL` and `scheduledAt > NOW`) and triggers fresh slot generation.
  * **Content Changes** (`title`, `description`, `tags`, `occurrencesConfig`): Automatically updates all future unbooked generated bookings with the new text or syllabus mapping. Passing `occurrencesConfig` fully replaces the existing syllabus array.
* **cURL Request (Content Sync Example)**:
  ```bash
  curl -X PATCH http://localhost:3000/api/v1/tutor/recurring-schedules/schedule-uuid-9999 \
    -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
    -H "Content-Type: application/json" \
    -d '{
      "title": "Advanced Physics Seminar",
      "occurrencesConfig": [
        { "title": "Syllabus 1: Relativistic Dynamics" },
        { "title": "Syllabus 2: Quantum Field Theory" }
      ]
    }'
  ```

### Delete a Recurring Schedule
Deletes the schedule template and immediately deletes all future unbooked slots associated with it.
* **Route**: `DELETE /tutor/recurring-schedules/:id`
* **cURL Request**:
  ```bash
  curl -X DELETE http://localhost:3000/api/v1/tutor/recurring-schedules/schedule-uuid-9999 \
    -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
  ```

---

## 4. Casual (One-Off) Bookings

### Create a Casual Booking Slot
Schedules one or more back-to-back one-off class slots directly. Bypasses admin approval.
* **Route**: `POST /tutor/bookings/casual`
* **Request Parameters**:
  * `scheduledAt` (Required): ISO date string. Must be within the tutor's maximum `openingWindowDays` (fallback 7 days if no templates exist) and not in the past.
  * `durationMinutes` (Optional): Must be `50` (deprecated in favor of `durationHours`).
  * `durationHours` (Optional): Number of back-to-back 50-minute booking sessions to generate (1 to 5, default `1`). If `durationHours > 1`, they are automatically treated as a package (`isPackage: true`).
  * `studentId` (Optional): UUID of a student if pre-assigned.
  * `title` (Optional): Topic.
  * `description` (Optional): Notes.
  * `tags` (Optional): Array of strings.
  * `lessonType` (Optional): `"REGULAR" | "CONVERSATION" | "BOTH"`. Defaults to `"REGULAR"`.
* **cURL Request**:
  ```bash
  curl -X POST http://localhost:3000/api/v1/tutor/bookings/casual \
    -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
    -H "Content-Type: application/json" \
    -d '{
      "scheduledAt": "2026-07-12T10:00:00.000Z",
      "durationHours": 2,
      "title": "Special Kinematics Q&A",
      "description": "Kinematics prep and equations guide",
      "tags": ["Physics"]
    }'
  ```
* **Response Sample (201 Created)**:
  ```json
  {
    "message": "Casual booking scheduled successfully",
    "data": {
      "id": "booking-uuid-7777",
      "studentId": null,
      "tutorId": "tutor-uuid-1111",
      "createdBy": "TUTOR",
      "status": "SCHEDULED",
      "topic": "Special Kinematics Q&A (Session 1/2)",
      "note": "Kinematics prep and equations guide",
      "tags": ["Physics"],
      "tutorBookingType": "CASUAL",
      "scheduledAt": "2026-07-12T10:00:00.000Z",
      "durationMinutes": 50,
      "isPackage": true,
      "liveClassStatus": "SCHEDULED",
      "createdAt": "2026-07-04T08:52:00.000Z",
      "updatedAt": "2026-07-04T08:52:00.000Z"
    },
    "bookings": [
      {
        "id": "booking-uuid-7777",
        "studentId": null,
        "tutorId": "tutor-uuid-1111",
        "createdBy": "TUTOR",
        "status": "SCHEDULED",
        "topic": "Special Kinematics Q&A (Session 1/2)",
        "note": "Kinematics prep and equations guide",
        "tags": ["Physics"],
        "tutorBookingType": "CASUAL",
        "scheduledAt": "2026-07-12T10:00:00.000Z",
        "durationMinutes": 50,
        "isPackage": true,
        "liveClassStatus": "SCHEDULED",
        "createdAt": "2026-07-04T08:52:00.000Z",
        "updatedAt": "2026-07-04T08:52:00.000Z"
      },
      {
        "id": "booking-uuid-8888",
        "studentId": null,
        "tutorId": "tutor-uuid-1111",
        "createdBy": "TUTOR",
        "status": "SCHEDULED",
        "topic": "Special Kinematics Q&A (Session 2/2)",
        "note": "Kinematics prep and equations guide",
        "tags": ["Physics"],
        "tutorBookingType": "CASUAL",
        "scheduledAt": "2026-07-12T11:00:00.000Z",
        "durationMinutes": 50,
        "isPackage": true,
        "liveClassStatus": "SCHEDULED",
        "createdAt": "2026-07-04T08:52:00.000Z",
        "updatedAt": "2026-07-04T08:52:00.000Z"
      }
    ]
  }
  ```

---

## 5. Testing the Booking Generator (Cron Bypass)

Exposes an endpoint to trigger the daily cron generation logic manually. Schedule creation already generates matching `Booking` rows inside `openingWindowDays`; later cron runs use the same idempotent generator to extend or fill the opening window without duplicating existing bookings.
* **Route**: `POST /tutor/bookings/trigger-generator`
* **cURL Request**:
  ```bash
  curl -X POST http://localhost:3000/api/v1/tutor/bookings/trigger-generator \
    -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
  ```
* **Response Sample (200 OK)**:
  ```json
  {
    "message": "Booking generation triggered successfully"
  }
  ```

---

## 6. Cancel or Block Booking

Cancel a booking (whether a casual booking or a generated open slot).
* **Route**: `PATCH /bookings/:bookingId/cancel`
* **Request Parameters**:
  * `cancelReason` (Optional): String reason.
* **Tutor Bypass Rule**:
  * Tutors can cancel any unbooked slot (`studentId === null`) **at any time**, bypassing the restriction check for the standard cancellation window.
* **cURL Request**:
  ```bash
  curl -X PATCH http://localhost:3000/api/v1/bookings/booking-uuid-7777/cancel \
    -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
    -H "Content-Type: application/json" \
    -d '{
      "cancelReason": "Tutor unavailable on this day."
    }'
  ```

---

## 7. Impact on Other Routes

Except for standard validation schema updates, no other booking endpoints need to be modified. However, the frontend should notice that existing query endpoints will now return new properties and format types:

### `GET /tutor/bookings` (and existing query APIs)
The query result payloads for `Booking` will now include:
1. `studentId` as optional (`string | null`). The UI should render `"Open Slot"`, `"Available"`, or allow registration if `studentId` is `null`.
2. `tutorBookingType` as optional (`"CASUAL" | "RECURRING" | null`).
3. `tags` as an array of strings (`string[]`).
4. `recurringScheduleId` as optional (`string | null`).
5. `isPackage` as boolean (`boolean`).

---

## 8. Student Booking Actions

### Search Available Bookings
Search, filter, and paginate available (unbooked) class slots in the system.
* **Route**: `GET /student/bookings/available`
* **Query Parameters**:
  * `page` (Optional): Page number (min 1, default `1`).
  * `limit` (Optional): Max items per page (min 1, max 100, default `10`).
  * `sortOrder` (Optional): Chronological order by scheduled date (`asc` | `desc`, default `asc`).
  * `search` (Optional): Case-insensitive string search matching against the tutor name, topic/title, or description/notes.
* **cURL Request**:
  ```bash
  curl -X GET "http://localhost:3000/api/v1/student/bookings/available?page=1&limit=2&sortOrder=asc&search=Physics" \
    -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
  ```
* **Response Sample (200 OK)**:
  ```json
  {
    "message": "Available bookings retrieved successfully",
    "data": [
      {
        "id": "booking-uuid-7777",
        "studentId": null,
        "tutorId": "tutor-uuid-1111",
        "createdBy": "TUTOR",
        "status": "SCHEDULED",
        "topic": "Special Kinematics Q&A (Session 1/2)",
        "note": "Kinematics prep and equations guide",
        "tags": ["Physics"],
        "tutorBookingType": "CASUAL",
        "scheduledAt": "2026-07-12T10:00:00.000Z",
        "durationMinutes": 50,
        "isPackage": true,
        "liveClassStatus": "SCHEDULED",
        "tutor": {
          "id": "tutor-uuid-1111",
          "name": "QA Tutor",
          "email": "tutor@example.com",
          "avatarUrl": "http://localhost:3000/avatar.png"
        }
      }
    ],
    "meta": {
      "total": 1,
      "page": 1,
      "limit": 2,
      "totalPages": 1
    }
  }
  ```

### Book a Single Non-Package Open Slot
Claims a single unbooked class slot (casual or recurring where `isPackage: false`).
* **Route**: `POST /student/bookings/:bookingId/book`
* **Constraint**: If the slot belongs to a package (`isPackage: true`), this route will return a `400 Bad Request` error.
* **cURL Request**:
  ```bash
  curl -X POST http://localhost:3000/api/v1/student/bookings/booking-uuid-7777/book \
    -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
  ```
* **Response Sample (200 OK)**:
  ```json
  {
    "message": "Booking slot confirmed successfully",
    "data": {
      "id": "booking-uuid-7777",
      "studentId": "student-uuid-8888",
      "status": "SCHEDULED",
      "creditCost": 1,
      "creditDeductedAt": "2026-07-04T13:12:00.000Z"
    }
  }
  ```

### Book a Recurring Schedule Package
Claims the next unbooked package occurrence of a recurring template in a single transaction.
* **Route**: `POST /student/bookings/package/:recurringScheduleId`
* **Constraint**: Deducts 1 credit per session. Requires the student to have enough credits to cover all sessions in the package. Maximum slots of a package is limited to 5.
* **cURL Request**:
  ```bash
  curl -X POST http://localhost:3000/api/v1/student/bookings/package/schedule-uuid-9999 \
    -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
  ```
* **Response Sample (200 OK)**:
  ```json
  {
    "message": "Package booked successfully. Confirmed 3 sessions.",
    "data": [
      {
        "id": "session-uuid-1",
        "studentId": "student-uuid-8888",
        "status": "SCHEDULED",
        "creditCost": 1
      },
      {
        "id": "session-uuid-2",
        "studentId": "student-uuid-8888",
        "status": "SCHEDULED",
        "creditCost": 1
      },
      {
        "id": "session-uuid-3",
        "studentId": "student-uuid-8888",
        "status": "SCHEDULED",
        "creditCost": 1
      }
    ]
  }

---

## 9. Tutor Availability Slots & Student Booking

### Create Tutor Availability Slots
Tutors can open one or more availability slots for students to book.
* **Route**: `POST /tutor/availabilities`
* **Request Body**:
  ```json
  {
    "slots": [
      { "scheduledAt": "2026-07-15T10:00:00.000Z", "durationMinutes": 50 }
    ]
  }
  ```
* **Response Sample (201 Created)**:
  ```json
  {
    "message": "Availability slots created successfully",
    "data": [
      {
        "id": "slot-uuid-123",
        "tutorId": "tutor-uuid-1111",
        "scheduledAt": "2026-07-15T10:00:00.000Z",
        "durationMinutes": 50,
        "isBooked": false,
        "bookingId": null
      }
    ]
  }
  ```

### Bulk Generate Tutor Availability Slots
Tutors can bulk-generate availability slots automatically for a range of dates and times.
* **Route**: `POST /tutor/availabilities/generate`
* **Request Body**:
  ```json
  {
    "startDate": "2026-07-10T00:00:00.000Z",
    "endDate": "2026-07-20T00:00:00.000Z",
    "startTime": "15:00",
    "endTime": "17:00",
    "dayOfWeek": [1, 2, 3, 4],
    "durationMinutes": 50
  }
  ```
* **Response Sample (201 Created)**:
  ```json
  {
    "message": "Availability slots generated successfully. Created 8 slots.",
    "data": [
      {
        "id": "slot-uuid-1",
        "tutorId": "tutor-uuid-1111",
        "scheduledAt": "2026-07-13T15:00:00.000Z",
        "durationMinutes": 50,
        "isBooked": false,
        "bookingId": null
      }
    ]
  }
  ```

### List Tutor Availability Slots
Tutors can list all their availability slots.
* **Route**: `GET /tutor/availabilities`
* **Response Sample (200 OK)**:
  ```json
  {
    "data": [
      {
        "id": "slot-uuid-123",
        "tutorId": "tutor-uuid-1111",
        "scheduledAt": "2026-07-15T10:00:00.000Z",
        "durationMinutes": 50,
        "isBooked": false,
        "bookingId": null
      }
    ]
  }
  ```

### Delete Tutor Availability Slot
Allows a tutor to delete an unbooked availability slot.
* **Route**: `DELETE /tutor/availabilities/:id`
* **Response Sample (200 OK)**:
  ```json
  {
    "message": "Availability slot deleted successfully"
  }
  ```

### Search Tutor Availability Slots (Student View)
Allows a student to retrieve all active (unbooked, future, and non-overlapping) availability slots for a specific tutor.
* **Route**: `GET /student/tutors/:tutorId/availabilities`
* **Response Sample (200 OK)**:
  ```json
  {
    "data": [
      {
        "id": "slot-uuid-123",
        "tutorId": "tutor-uuid-1111",
        "scheduledAt": "2026-07-15T10:00:00.000Z",
        "durationMinutes": 50
      }
    ]
  }
  ```

### Book Tutor Availability Slot (Student Booking)
Allows a student to book a tutor's availability slot.
* **Route**: `POST /student/availabilities/:id/book`
* **Request Body**:
  * `lessonType` (Required if tutor has both REGULAR and CONVERSATION roles): `"REGULAR" | "CONVERSATION"`.
* **cURL Request**:
  ```bash
  curl -X POST http://localhost:3000/api/v1/student/availabilities/slot-uuid-123/book \
    -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
    -H "Content-Type: application/json" \
    -d '{
      "lessonType": "CONVERSATION"
    }'
  ```
* **Response Sample (200 OK)**:
  ```json
  {
    "message": "Booking confirmed successfully",
    "data": {
      "bookingId": "booking-uuid-xyz",
      "studentIds": ["student-uuid-8888"],
      "scheduledAt": "2026-07-15T10:00:00.000Z",
      "status": "SCHEDULED",
      "lessonType": "CONVERSATION",
      "creditDeducted": 1
    }
  }
  ```
