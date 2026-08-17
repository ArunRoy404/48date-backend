-- CreateEnum
CREATE TYPE "Gender" AS ENUM ('MALE', 'FEMALE', 'PREFER_NOT_TO_SAY');

-- CreateEnum
CREATE TYPE "HabitFrequency" AS ENUM ('REGULAR', 'OCCASIONALLY', 'NONE');

-- CreateEnum
CREATE TYPE "KidsStatus" AS ENUM ('HAVE', 'DONT_HAVE');

-- CreateEnum
CREATE TYPE "LookingFor" AS ENUM ('REAL_RELATIONSHIP', 'SOMETHING_MEANINGFUL', 'SEE_WHERE_IT_GOES', 'NEW_FRIENDS_FIRST');

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('USER', 'ADMIN');

-- CreateTable
CREATE TABLE "images" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "hash" TEXT,
    "width" INTEGER,
    "height" INTEGER,
    "isMain" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "images_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "email" TEXT,
    "passwordHash" TEXT,
    "role" "Role" NOT NULL DEFAULT 'USER',
    "emailVerified" BOOLEAN NOT NULL DEFAULT false,
    "phoneVerified" BOOLEAN NOT NULL DEFAULT false,
    "name" TEXT,
    "firstName" TEXT,
    "lastName" TEXT,
    "username" TEXT,
    "birthDate" TIMESTAMP(3),
    "occupation" TEXT,
    "gender" "Gender",
    "interestedIn" "Gender",
    "smoker" "HabitFrequency",
    "alcohol" "HabitFrequency",
    "kids" "KidsStatus",
    "wantsKids" BOOLEAN,
    "lookingFor" "LookingFor",
    "locations" TEXT[],
    "lastLocation" TEXT,
    "heightCm" INTEGER,
    "weightKg" INTEGER,
    "creativity" TEXT[],
    "sports" TEXT[],
    "moviesAndDramas" TEXT[],
    "selfieUrl" TEXT,
    "selfieVerified" BOOLEAN NOT NULL DEFAULT false,
    "notificationsEnabled" BOOLEAN NOT NULL DEFAULT true,
    "subscriptionId" TEXT,
    "lastLoginAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "images_userId_idx" ON "images"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "users_phone_key" ON "users"("phone");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "users_username_key" ON "users"("username");

-- AddForeignKey
ALTER TABLE "images" ADD CONSTRAINT "images_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
