-- CreateTable
CREATE TABLE "GoogleCompletion" (
    "userId" TEXT NOT NULL,
    "key" TEXT NOT NULL,

    PRIMARY KEY ("userId", "key"),
    CONSTRAINT "GoogleCompletion_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
