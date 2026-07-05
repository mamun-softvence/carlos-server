# Frontend API Integration Guide: Student Search, Booking, and Packages

This document provides a guide for frontend developers to integrate the student booking, searching, and package claiming workflows.

All endpoints require Bearer Token authentication via the `Authorization` header.

---

## 1. Authentication

### Log In (Student / User)
Authenticates the user and retrieves the JSON Web Token (JWT).
* **Route**: `POST /auth/login`
* **cURL Request**:
  ```bash
  curl -X POST http://localhost:3000/api/v1/auth/login \
    -H "Content-Type: application/json" \
    -d '{
      "email": "student@example.com",
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
        "id": "student-uuid-8888",
        "email": "student@example.com",
        "role": "STUDENT"
      },
      "accessToken": "eyJhbGciOi...",
      "refreshToken": "eyJhbGciOi..."
    }
  }
  ```

---

## 2. Search Available Bookings

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
        "groupBookingId": "group-uuid-abc",
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

---

## 3. Booking Actions

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
Claims all future unbooked slots of a package recurring template in a single transaction.
* **Route**: `POST /student/bookings/package/:recurringScheduleId`
* **Constraint**: Deducts 1 credit per session. Requires the student to have enough credits to cover all sessions in the package.
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
      }
    ]
  }
  ```

### Batch Book Package/Casual Slots
Claims multiple unbooked slots (useful for booking casual packages that lack a `recurringScheduleId` but share a `groupBookingId`) in a single transaction.
* **Route**: `POST /student/bookings/batch`
* **Request Body**:
  * `bookingIds` (Required): Array of UUID strings representing the slots.
* **Constraint**: Deducts 1 credit per slot.
* **cURL Request**:
  ```bash
  curl -X POST http://localhost:3000/api/v1/student/bookings/batch \
    -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
    -H "Content-Type: application/json" \
    -d '{
      "bookingIds": ["booking-uuid-1", "booking-uuid-2"]
    }'
  ```
* **Response Sample (200 OK)**:
  ```json
  {
    "message": "Successfully booked 2 sessions.",
    "data": [
      {
        "id": "booking-uuid-1",
        "studentId": "student-uuid-8888",
        "status": "SCHEDULED",
        "creditCost": 1
      },
      {
        "id": "booking-uuid-2",
        "studentId": "student-uuid-8888",
        "status": "SCHEDULED",
        "creditCost": 1
      }
    ]
  }
  ```

---

## 4. Retrieving Grouped Bookings

### Get My Bookings (Student List)
Retrieve the student's scheduled bookings. Bookings belonging to a package (sharing `recurringScheduleId` or `groupBookingId` where `isPackage: true`) are automatically grouped into a single parent entity containing a nested `segments` array.
* **Route**: `GET /student/bookings`
* **cURL Request**:
  ```bash
  curl -X GET http://localhost:3000/api/v1/student/bookings \
    -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
  ```
* **Response Sample (200 OK)**:
  ```json
  {
    "message": "Student bookings fetched successfully",
    "data": [
      {
        "id": "booking-uuid-1",
        "isPackage": true,
        "recurringScheduleId": null,
        "groupBookingId": "group-uuid-abc",
        "topic": "Special Kinematics Q&A",
        "note": "Kinematics prep and equations guide",
        "tags": ["Physics"],
        "tutorBookingType": "CASUAL",
        "scheduledAt": "2026-07-12T10:00:00.000Z",
        "durationMinutes": 100,
        "status": "SCHEDULED",
        "createdBy": "TUTOR",
        "liveClassStatus": "SCHEDULED",
        "tutorId": "tutor-uuid-1111",
        "tutor": {
          "id": "tutor-uuid-1111",
          "name": "QA Tutor",
          "email": "tutor@example.com",
          "avatarUrl": "http://localhost:3000/avatar.png"
        },
        "segments": [
          {
            "id": "booking-uuid-1",
            "topic": "Special Kinematics Q&A (Session 1/2)",
            "scheduledAt": "2026-07-12T10:00:00.000Z",
            "durationMinutes": 50
          },
          {
            "id": "booking-uuid-2",
            "topic": "Special Kinematics Q&A (Session 2/2)",
            "scheduledAt": "2026-07-12T11:00:00.000Z",
            "durationMinutes": 50
          }
        ]
      }
    ]
  }
  ```

### Get Specific Booking/Package Details
Retrieve details of a single booking slot. If it is part of a package, all other segments are attached to the response.
* **Route**: `GET /student/bookings/:id`
* **cURL Request**:
  ```bash
  curl -X GET http://localhost:3000/api/v1/student/bookings/booking-uuid-1 \
    -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
  ```
* **Response Sample (200 OK)**:
  ```json
  {
    "id": "booking-uuid-1",
    "studentId": "student-uuid-8888",
    "tutorId": "tutor-uuid-1111",
    "status": "SCHEDULED",
    "topic": "Special Kinematics Q&A (Session 1/2)",
    "note": "Kinematics prep and equations guide",
    "tags": ["Physics"],
    "isPackage": true,
    "groupBookingId": "group-uuid-abc",
    "scheduledAt": "2026-07-12T10:00:00.000Z",
    "durationMinutes": 50,
    "segments": [
      {
        "id": "booking-uuid-1",
        "topic": "Special Kinematics Q&A (Session 1/2)",
        "scheduledAt": "2026-07-12T10:00:00.000Z",
        "durationMinutes": 50
      },
      {
        "id": "booking-uuid-2",
        "topic": "Special Kinematics Q&A (Session 2/2)",
        "scheduledAt": "2026-07-12T11:00:00.000Z",
        "durationMinutes": 50
      }
    ]
  }
  ```
