-- CreateTable
CREATE TABLE "message_conversations" (
    "id" TEXT NOT NULL,
    "participantKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "message_conversations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "message_conversation_participants" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "message_conversation_participants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "direct_messages" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "senderId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "direct_messages_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "message_conversations_participantKey_key" ON "message_conversations"("participantKey");

-- CreateIndex
CREATE UNIQUE INDEX "message_conversation_participants_conversationId_userId_key" ON "message_conversation_participants"("conversationId", "userId");

-- CreateIndex
CREATE INDEX "message_conversation_participants_conversationId_idx" ON "message_conversation_participants"("conversationId");

-- CreateIndex
CREATE INDEX "message_conversation_participants_userId_idx" ON "message_conversation_participants"("userId");

-- CreateIndex
CREATE INDEX "direct_messages_conversationId_createdAt_idx" ON "direct_messages"("conversationId", "createdAt");

-- CreateIndex
CREATE INDEX "direct_messages_senderId_idx" ON "direct_messages"("senderId");

-- AddForeignKey
ALTER TABLE "message_conversation_participants" ADD CONSTRAINT "message_conversation_participants_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "message_conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "message_conversation_participants" ADD CONSTRAINT "message_conversation_participants_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "direct_messages" ADD CONSTRAINT "direct_messages_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "message_conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "direct_messages" ADD CONSTRAINT "direct_messages_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
