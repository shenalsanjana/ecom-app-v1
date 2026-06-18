-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "customerDispatchEmailSentAt" TIMESTAMP(3),
ADD COLUMN     "deliveryCompany" TEXT;
