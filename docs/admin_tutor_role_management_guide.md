# Admin API Integration Guide: Tutor Role and User Management

This document provides a guide for frontend developers to integrate tutor role management and user actions executed by an administrator.

All endpoints require Bearer Token authentication of a user with the `ADMIN` role via the `Authorization` header.

---

## 1. Authentication

### Log In (Admin)
Authenticates the administrator and retrieves the JSON Web Token (JWT).
* **Route**: `POST /auth/login`
* **cURL Request**:
  ```bash
  curl -X POST http://localhost:3000/api/v1/auth/login \
    -H "Content-Type: application/json" \
    -d '{
      "email": "admin@example.com",
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
        "id": "admin-uuid-0000",
        "email": "admin@example.com",
        "role": "ADMIN"
      },
      "accessToken": "eyJhbGciOi...",
      "refreshToken": "eyJhbGciOi..."
    }
  }
  ```

---

## 2. Retrieving Users

### Get All Tutors
Retrieve a paginated list of tutor accounts with optional text search.
* **Route**: `GET /admin/tutors`
* **Query Parameters**:
  * `page` (Optional): Page number (min 1, default `1`).
  * `limit` (Optional): Items per page (min 1, max 100, default `10`).
  * `search` (Optional): Case-insensitive search string matching user name or email.
* **cURL Request**:
  ```bash
  curl -X GET "http://localhost:3000/api/v1/admin/tutors?page=1&limit=10&search=John" \
    -H "Authorization: Bearer ADMIN_ACCESS_TOKEN"
  ```
* **Response Sample (200 OK)**:
  ```json
  {
    "message": "Tutors fetched successfully",
    "data": [
      {
        "id": "tutor-uuid-1111",
        "name": "John Doe",
        "email": "john@example.com",
        "role": "TUTOR",
        "status": "ACTIVE",
        "tutorRoles": ["REGULAR", "CONVERSATION"],
        "createdAt": "2026-07-01T10:00:00.000Z"
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

### Get All Students
Retrieve a paginated list of student accounts with optional text search.
* **Route**: `GET /admin/students`
* **Query Parameters**:
  * `page` (Optional): Page number (min 1, default `1`).
  * `limit` (Optional): Items per page (min 1, max 100, default `10`).
  * `search` (Optional): Case-insensitive search string matching user name or email.
* **cURL Request**:
  ```bash
  curl -X GET "http://localhost:3000/api/v1/admin/students?page=1&limit=10&search=Jane" \
    -H "Authorization: Bearer ADMIN_ACCESS_TOKEN"
  ```
* **Response Sample (200 OK)**:
  ```json
  {
    "message": "Students fetched successfully",
    "data": [
      {
        "id": "student-uuid-3333",
        "name": "Jane Smith",
        "email": "jane@example.com",
        "role": "STUDENT",
        "status": "ACTIVE",
        "createdAt": "2026-07-01T12:00:00.000Z"
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

---

## 3. Creating and Deleting Users

### Create Student or Tutor
Allows the administrator to create a student or tutor account manually.
* **Route**: `POST /admin/users`
* **Request Body**:
  * `name` (Required): String.
  * `email` (Required): Valid email address string.
  * `password` (Required): String (min length 6).
  * `role` (Required): `"STUDENT" | "TUTOR"`.
  * `tutorRoles` (Optional): Array of strings containing `"REGULAR" | "CONVERSATION"`. Only applicable when `role` is `"TUTOR"`.
    * Default value if absent: `["REGULAR"]`.
    * Cannot be empty (`[]`) when creating a tutor.
    * Ignored/omitted when creating a student.
* **cURL Request (Create Tutor with Custom Roles)**:
  ```bash
  curl -X POST http://localhost:3000/api/v1/admin/users \
    -H "Authorization: Bearer ADMIN_ACCESS_TOKEN" \
    -H "Content-Type: application/json" \
    -d '{
      "name": "Jane Smith",
      "email": "janesmith@example.com",
      "password": "Password123",
      "role": "TUTOR",
      "tutorRoles": ["REGULAR", "CONVERSATION"]
    }'
  ```
* **Response Sample (201 Created)**:
  ```json
  {
    "message": "tutor created successfully",
    "data": {
      "id": "tutor-uuid-2222",
      "name": "Jane Smith",
      "email": "janesmith@example.com",
      "role": "TUTOR",
      "status": "ACTIVE",
      "tutorRoles": ["REGULAR", "CONVERSATION"],
      "createdAt": "2026-07-05T12:00:00.000Z"
    }
  }
  ```

### Delete Student or Tutor
Permanently deletes a student or tutor account. Admin accounts cannot be deleted.
* **Route**: `DELETE /admin/users/:userId`
* **cURL Request**:
  ```bash
  curl -X DELETE http://localhost:3000/api/v1/admin/users/tutor-uuid-2222 \
    -H "Authorization: Bearer ADMIN_ACCESS_TOKEN"
  ```
* **Response Sample (200 OK)**:
  ```json
  {
    "id": "tutor-uuid-2222",
    "name": "Jane Smith",
    "email": "janesmith@example.com",
    "role": "TUTOR",
    "status": "ACTIVE"
  }
  ```

---

## 4. Account Management

### Update Account Status
Suspends, activates, or sets a student or tutor account status.
* **Route**: `PATCH /admin/users/:userId/status`
* **Request Body**:
  * `status` (Required): `"ACTIVE" | "INACTIVE" | "SUSPENDED"`.
* **cURL Request**:
  ```bash
  curl -X PATCH http://localhost:3000/api/v1/admin/users/tutor-uuid-1111/status \
    -H "Authorization: Bearer ADMIN_ACCESS_TOKEN" \
    -H "Content-Type: application/json" \
    -d '{
      "status": "SUSPENDED"
    }'
  ```
* **Response Sample (200 OK)**:
  ```json
  {
    "message": "User status updated successfully",
    "data": {
      "id": "tutor-uuid-1111",
      "name": "John Doe",
      "email": "john@example.com",
      "role": "TUTOR",
      "status": "SUSPENDED"
    }
  }
  ```

### Update Tutor Sub-Roles
Updates the teaching certifications/sub-roles of a tutor.
* **Route**: `PATCH /admin/users/tutors/:tutorId/roles`
* **Request Body**:
  * `roles` (Required): Non-empty array of enum values `"REGULAR" | "CONVERSATION"`.
* **cURL Request**:
  ```bash
  curl -X PATCH http://localhost:3000/api/v1/admin/users/tutors/tutor-uuid-1111/roles \
    -H "Authorization: Bearer ADMIN_ACCESS_TOKEN" \
    -H "Content-Type: application/json" \
    -d '{
      "roles": ["CONVERSATION"]
    }'
  ```
* **Response Sample (200 OK)**:
  ```json
  {
    "message": "Tutor roles updated successfully",
    "data": {
      "id": "tutor-uuid-1111",
      "name": "John Doe",
      "email": "john@example.com",
      "role": "TUTOR",
      "tutorRoles": ["CONVERSATION"]
    }
  }
  ```
