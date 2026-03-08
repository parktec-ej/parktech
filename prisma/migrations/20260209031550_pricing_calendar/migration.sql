-- CreateTable
CREATE TABLE "PricingCalendar" (
    "id" TEXT NOT NULL,
    "targetDate" TIMESTAMP(3) NOT NULL,
    "priceYen" INTEGER NOT NULL,
    "label" TEXT NOT NULL DEFAULT 'NORMAL',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PricingCalendar_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PricingCalendar_targetDate_key" ON "PricingCalendar"("targetDate");
