# Frontend Guide: Teacher Availability Search And Schedule

This guide describes how the frontend should implement teacher discovery, teacher availability routine, and scheduled-class visibility for students.

## Goal

Students should be able to search teachers, see who is available, open a teacher schedule, and book an available slot. Teacher search should return best-fit teachers first by matching teacher name, available class title/topic, tags, and description/notes.

## Main User Flow

1. Student opens teacher search.
2. Frontend calls `GET /api/v1/student/tutors/search`.
3. Student filters by search text, lesson type, and optional date range.
4. Student opens a teacher result.
5. Frontend calls `GET /api/v1/student/tutors/:tutorId/schedule`.
6. Frontend renders bookable availability slots and occupied scheduled class blocks.
7. Student books an available slot with `POST /api/v1/student/availabilities/:id/book`.

## Existing Reusable Routes

### Browse Open Booking Slots

`GET /api/v1/student/bookings/available`

Use this only for browsing individual open booking slots. Do not use it as the main teacher search API because it returns slots, not teacher cards.

### Get One Tutor's Simple Availability List

`GET /api/v1/student/tutors/:tutorId/availabilities`

Use this when the UI only needs future unbooked availability slots for a known tutor.

### Book An Availability Slot

`POST /api/v1/student/availabilities/:id/book`

Use this to book a concrete tutor availability slot from the schedule UI.

### Student's Own Bookings

`GET /api/v1/student/bookings`

Use this only for the authenticated student's own booking list.

## New Routes

### Search Teachers

`GET /api/v1/student/tutors/search`

Query parameters:

- `page`: optional number, default `1`.
- `limit`: optional number, default `10`, max `100`.
- `search`: optional text. Matches teacher name, available booking topic/title, tags, and notes.
- `lessonType`: optional `REGULAR | CONVERSATION | BOTH`.
- `dateFrom`: optional ISO date.
- `dateTo`: optional ISO date.
- `hasAvailability`: optional boolean. If true, only teachers with matching future availability are returned.
- `sortBy`: optional `relevance | nextAvailable | newest`.
- `sortOrder`: optional `asc | desc`.

Response shape:

```json
{
  "message": "Tutors fetched successfully",
  "data": [
    {
      "id": "tutor-uuid",
      "name": "Teacher Name",
      "avatarUrl": "https://example.com/avatar.png",
      "tutorRoles": ["REGULAR", "CONVERSATION"],
      "timeZone": "Asia/Dhaka",
      "nextAvailableSlot": "2026-07-08T10:00:00.000Z",
      "availableSlotCount": 6,
      "matchedFields": ["teacherName", "title"]
    }
  ],
  "meta": {
    "total": 1,
    "page": 1,
    "limit": 10,
    "totalPages": 1
  }
}
```

Search ranking:

- Exact teacher name match ranks highest.
- Partial teacher name match ranks next.
- Available booking title/topic match ranks next.
- Tag match ranks next.
- Description/note match ranks next.
- Nearer future availability breaks ties.

### Get Teacher Schedule

`GET /api/v1/student/tutors/:tutorId/schedule`

Query parameters:

- `dateFrom`: optional ISO date.
- `dateTo`: optional ISO date.
- `lessonType`: optional `REGULAR | CONVERSATION | BOTH`.
- `page`: optional number, default `1`.
- `limit`: optional number, default `50`, max `100`.

Response shape:

```json
{
  "message": "Tutor schedule fetched successfully",
  "data": {
    "tutor": {
      "id": "tutor-uuid",
      "name": "Teacher Name",
      "avatarUrl": "https://example.com/avatar.png",
      "tutorRoles": ["REGULAR"],
      "timeZone": "Asia/Dhaka"
    },
    "availabilities": [
      {
        "id": "availability-uuid",
        "tutorId": "tutor-uuid",
        "scheduledAt": "2026-07-08T10:00:00.000Z",
        "durationMinutes": 50,
        "isBookable": true,
        "status": "AVAILABLE"
      }
    ],
    "scheduledClasses": [
      {
        "id": "booking-uuid",
        "scheduledAt": "2026-07-08T11:00:00.000Z",
        "durationMinutes": 50,
        "lessonType": "REGULAR",
        "status": "SCHEDULED",
        "liveClassStatus": "SCHEDULED",
        "isBookable": false
      }
    ]
  },
  "meta": {
    "total": 1,
    "page": 1,
    "limit": 50,
    "totalPages": 1
  }
}
```

## Frontend Responsibilities

- Use `GET /student/tutors/search` for the teacher search page.
- Reset `page` to `1` whenever search text or filters change.
- Show teacher cards with name, avatar, teaching roles, next available time, and availability count.
- Use `matchedFields` only as optional UI metadata.
- Use `GET /student/tutors/:tutorId/schedule` for teacher detail or calendar view.
- Render `availabilities` as bookable slots.
- Render `scheduledClasses` as occupied or unavailable blocks.
- Use `POST /student/availabilities/:id/book` when the student chooses a bookable availability slot.

## Privacy Rules

- Do not show other students' names, emails, IDs, participants, notes, or private booking details.
- Scheduled class blocks should only communicate that the teacher is occupied at that time.
- Teacher email is not returned in student-facing teacher search.

## UI States

- Empty search: show available teachers ordered by nearest availability.
- No result: show an empty state and suggest adjusting filters.
- No schedule availability: show the teacher profile and an empty availability state.
- Loading: use separate loading states for search results and schedule details.
- Error: show a retry action and preserve the student's current filters.

## Acceptance Criteria

- Student can search teachers by teacher name.
- Student can search teachers by available booking topic/title.
- Student can search teachers by tag.
- Student can search teachers by description/note.
- Best-fit teachers appear first.
- Pagination metadata is displayed and used correctly.
- Teacher schedule shows bookable availability slots and occupied scheduled blocks.
- Scheduled class blocks do not expose private student information.
- Student can book an availability slot from the schedule UI.

