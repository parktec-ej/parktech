-- CreateEnum
CREATE TYPE "ReservationType" AS ENUM ('general', 'bus');

-- CreateEnum
CREATE TYPE "VehicleType" AS ENUM ('bus', 'car');

-- AlterTable
ALTER TABLE "Reservation" ADD COLUMN     "arrivalTime" TEXT,
ADD COLUMN     "busPartnerId" TEXT,
ADD COLUMN     "eventName" TEXT,
ADD COLUMN     "hasExtraCar" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "note" TEXT,
ADD COLUMN     "reservationType" "ReservationType" NOT NULL DEFAULT 'general',
ADD COLUMN     "vehicleType" "VehicleType";

-- CreateIndex
CREATE INDEX "Reservation_reservationType_idx" ON "Reservation"("reservationType");

-- CreateIndex
CREATE INDEX "Reservation_busPartnerId_idx" ON "Reservation"("busPartnerId");

-- CreateIndex
CREATE INDEX "Reservation_reservationType_date_idx" ON "Reservation"("reservationType", "date");

-- AddForeignKey
ALTER TABLE "Reservation" ADD CONSTRAINT "Reservation_busPartnerId_fkey" FOREIGN KEY ("busPartnerId") REFERENCES "BusPartner"("id") ON DELETE SET NULL ON UPDATE CASCADE;

