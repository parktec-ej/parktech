-- CreateTable
CREATE TABLE "SnsBroadcast" (
    "id" TEXT NOT NULL,
    "caption" TEXT NOT NULL,
    "imageUrl" TEXT,
    "toIg" BOOLEAN NOT NULL DEFAULT true,
    "toFb" BOOLEAN NOT NULL DEFAULT true,
    "fbPostId" TEXT,
    "igPostId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "error" TEXT,
    "postedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SnsBroadcast_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SnsBroadcast_status_idx" ON "SnsBroadcast"("status");

-- CreateIndex
CREATE INDEX "SnsBroadcast_createdAt_idx" ON "SnsBroadcast"("createdAt");

