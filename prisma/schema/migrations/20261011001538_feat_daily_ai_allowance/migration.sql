-- CreateTable
CREATE TABLE "ai_allowances" (
    "user_id" UUID NOT NULL,
    "day" DATE NOT NULL,
    "kind" TEXT NOT NULL,
    "used" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ai_allowances_pkey" PRIMARY KEY ("user_id","day","kind")
);
