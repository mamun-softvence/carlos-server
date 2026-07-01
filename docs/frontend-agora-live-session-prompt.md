# Frontend Prompt: Implement Agora Live Sessions in Next.js

You are working on the existing tutoring platform frontend built with Next.js.
The backend is already implemented in NestJS. Do not rebuild booking creation.
Use existing booking/session records.

## Goal

Build an embedded live session page inside the website using Agora RTC SDK for:

- tutor/student video and audio
- tutor screen sharing
- basic real-time chat using Socket.IO

Do not redirect users to Agora-hosted pages. Do not use Agora Flexible Classroom.

## Install Packages

```bash
pnpm add agora-rtc-sdk-ng socket.io-client
```

## Environment

```env
NEXT_PUBLIC_API_URL=http://localhost:3000
NEXT_PUBLIC_AGORA_APP_ID=<same Agora App ID configured in backend>
```

Backend responses return `appId`, so prefer the backend value from the token
response when joining Agora.

## Important Backend Model

`sessionId` is the existing `bookingId`.

Use `bookingId` from the current booking/session and pass it as `sessionId` in
all live-session routes.

## Auth

Backend supports either:

- HTTP-only cookie named `accessToken`, sent with `credentials: 'include'`
- `Authorization: Bearer <accessToken>`

Use the same auth style already used in the frontend.

Socket.IO supports:

- cookie auth, or
- `auth: { token: accessToken }`

## Backend Routes To Use

### Session Lifecycle

Tutor starts and ends the session through the session lifecycle routes:

```http
PATCH /api/v1/sessions/:sessionId/start
PATCH /api/v1/sessions/:sessionId/end
```

These routes are only for lifecycle status.

### Live Session

Use these routes for the meeting page:

```http
GET /api/v1/sessions/:sessionId
POST /api/v1/sessions/:sessionId/agora-token
GET /api/v1/sessions/:sessionId/messages
POST /api/v1/sessions/:sessionId/messages
```

`POST /api/v1/sessions/:sessionId/agora-token` only works after the session is
live. The tutor should call the start route first.

## Expected Token Response Shape

```ts
type AgoraTokenResponse = {
  message: string;
  data: {
    appId: string;
    token: string;
    channelName: string;
    uid: string;
    expiresIn: number;
    expiresAt: string;
    rtcRole: 'publisher' | 'subscriber';
    clientRole: 'host' | 'audience';
    participantRole: 'tutor' | 'student' | 'admin';
    session: {
      sessionId: string;
      bookingId: string;
      channelName: string;
      title: string | null;
      topic: string | null;
      scheduledAt: string | null;
      durationMinutes: number | null;
      status: 'scheduled' | 'live' | 'ended';
      lifecycleStatus: 'SCHEDULED' | 'LIVE' | 'ENDED';
      bookingStatus: 'PENDING' | 'SCHEDULED' | 'COMPLETED' | 'CANCELLED';
      tutor: {
        id: string;
        name: string | null;
        email: string;
        avatarUrl: string | null;
      } | null;
      students: Array<{
        id: string;
        name: string | null;
        email: string;
        avatarUrl: string | null;
      }>;
      allowPublishing: boolean;
      allowScreenShare: boolean;
    };
  };
};
```

## Socket.IO Chat

Namespace:

```ts
const socket = io(`${NEXT_PUBLIC_API_URL}/sessions`, {
  withCredentials: true,
  auth: accessToken ? { token: accessToken } : undefined,
});
```

Client emits:

```ts
socket.emit('join-session', { sessionId });
socket.emit('send-session-message', { sessionId, content });
socket.emit('leave-session');
```

Client listens:

```ts
socket.on('session-message', (message) => {});
socket.on('session-user-joined', (payload) => {});
socket.on('session-user-left', (payload) => {});
```

Chat message shape:

```ts
type ChatMessage = {
  id: string;
  sessionId: string;
  bookingId: string;
  senderId: string;
  content: string;
  sender: {
    id: string;
    name: string | null;
    email: string;
    avatarUrl: string | null;
    role: 'STUDENT' | 'TUTOR' | 'ADMIN';
  };
  createdAt: string;
  updatedAt: string;
};
```

## Required Page

Create a route like:

```txt
app/sessions/[sessionId]/page.tsx
```

The page should render the actual meeting UI, not a landing page.

## UI Requirements

Build:

- video grid
- join/leave button
- mic mute/unmute
- camera on/off
- screen share button for tutor only
- chat sidebar
- participant list or compact session header
- loading, permission denied, session not live, and disconnected states

Keep the UI inside the existing app layout and auth system.

## Agora Client Flow

1. Read `sessionId` from route params.
2. Fetch `GET /api/v1/sessions/:sessionId`.
3. When user clicks Join:
   - call `POST /api/v1/sessions/:sessionId/agora-token`
   - create Agora client:

```ts
const client = AgoraRTC.createClient({ mode: 'live', codec: 'vp8' });
```

4. Set role from backend:

```ts
await client.setClientRole(tokenData.clientRole);
```

5. Join channel:

```ts
await client.join(
  tokenData.appId,
  tokenData.channelName,
  tokenData.token,
  tokenData.uid,
);
```

6. If `tokenData.clientRole === 'host'`:
   - create microphone and camera tracks
   - play local camera preview
   - publish audio and video

```ts
const [audioTrack, videoTrack] =
  await AgoraRTC.createMicrophoneAndCameraTracks();

videoTrack.play(localVideoElement);
await client.publish([audioTrack, videoTrack]);
```

7. If audience/student:
   - do not publish tracks in initial version
   - subscribe to remote tracks only

8. Subscribe to remote users:

```ts
client.on('user-published', async (user, mediaType) => {
  await client.subscribe(user, mediaType);

  if (mediaType === 'audio') {
    user.audioTrack?.play();
  }

  if (mediaType === 'video') {
    user.videoTrack?.play(remoteVideoElement);
  }
});
```

9. Join Socket.IO chat:

```ts
socket.emit('join-session', { sessionId });
```

10. On leave:
    - unpublish local tracks if any
    - close local tracks
    - leave Agora channel
    - emit `leave-session`
    - disconnect socket

## Tutor Screen Sharing

Show screen share only when:

```ts
tokenData.session.allowScreenShare === true;
```

Implementation:

1. Create screen video track:

```ts
const screenTrack = await AgoraRTC.createScreenVideoTrack({}, 'disable');
const videoTrack = Array.isArray(screenTrack) ? screenTrack[0] : screenTrack;
```

2. Unpublish camera track.
3. Publish screen track.
4. Play screen preview locally.
5. On stop sharing:
   - unpublish and close screen track
   - publish camera track again

## Recommended Component Structure

```txt
app/sessions/[sessionId]/page.tsx
features/live-session/
  LiveSessionClient.tsx
  VideoGrid.tsx
  VideoTile.tsx
  SessionControls.tsx
  ChatPanel.tsx
  ParticipantList.tsx
  useAgoraSession.ts
  useSessionChat.ts
  types.ts
```

## Error Handling

Handle these backend responses:

- `401`: user not logged in
- `403`: user is not assigned to this session, session has no tutor, or session is not live
- `404`: session/booking not found

If token request returns `403` with "This session is not live yet", show:

```txt
This session has not started yet.
```

For tutor, show a Start button that calls:

```http
PATCH /api/v1/sessions/:sessionId/start
```

After successful start, retry token request.

## Rules

- Do not use old `/bookings/:bookingId/live-class/messages` routes.
- Do not use old `/bookings/:bookingId/live-class` details route.
- Do not use old `/bookings/:bookingId/live-class/start` or `/end` routes.
- Do not add mediasoup/WebRTC signaling.
- Do not use Agora Chat SDK.
- Do not use Agora Flexible Classroom.
- Do not redirect to Agora-hosted pages.
- Students should not publish mic/camera in initial version.
- Tutor can publish camera/mic and screen share.
