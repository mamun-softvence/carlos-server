# Frontend Change Notes: Recurring Booking Packages

This document describes the frontend updates needed for the recurring booking flow. It is intentionally instruction-only and does not include frontend code.

## What Changed In The Backend

- Recurring schedule creation now materializes bookings immediately inside the tutor’s `openingWindowDays`.
- Package semantics are now occurrence-based, not whole-schedule-based.
- A recurring package is a group of adjacent hourly segments on the same date.
- Different dates from the same recurring template are separate package units.
- Students can book one package occurrence at a time, not the entire recurring schedule.

## Frontend Updates Needed

### 1. Recurring Schedule Creation Screens

- Keep the existing create flow and API contract.
- After successful schedule creation, expect the response to include a `bookings` array.
- Render the newly generated bookings immediately in the UI instead of waiting for cron.
- If the schedule is package-based, show that the created bookings are already available for booking.

### 2. Schedule Details Views

- Display package groupings by occurrence, not by recurring schedule id alone.
- When showing package items, group segments that share the same `groupBookingId`.
- If `groupBookingId` is missing on older data, fall back to `recurringScheduleId` only for compatibility.
- Show each date occurrence as its own package card or row.

### 3. Booking Lists

- Update list grouping logic so multiple dates from the same recurring template do not collapse into one package.
- Preserve chronological ordering of segments within a package occurrence.
- Show the first segment time as the package start time.
- Show the package duration as the sum of its segment durations.

### 4. Student Booking Actions

- Keep the single-slot booking action for `isPackage: false` slots.
- For package slots, the student should book the next available package occurrence, not the full recurring template.
- Update any button labels or helper text that imply the whole recurring schedule is booked in one action.

### 5. UI Copy And State

- Replace any copy that says “book the full recurring schedule” with “book this package occurrence” or similar.
- Clarify that package bookings are tied to one date occurrence and may contain multiple adjacent hourly segments.
- Ensure the booking action state handles the case where earlier occurrences are already booked but later ones remain available.

### 6. Data Handling

- Make sure the frontend does not assume `recurringScheduleId` is the package grouping key.
- Prefer `groupBookingId` for grouping package segments.
- Treat `recurringScheduleId` as the schedule template reference, not the occurrence bundle identifier.

## Screens To Review

- Recurring schedule create modal or page.
- Tutor schedule details page.
- Student available bookings list.
- Student booking details page.
- Any booking package summary or grouped booking component.

## Acceptance Criteria

- Newly created recurring schedules show generated bookings immediately.
- Package bookings are grouped per date occurrence.
- Different dates from the same recurring schedule render as separate package units.
- Single-slot booking still works for non-package slots.
- Existing historical records still render safely.

