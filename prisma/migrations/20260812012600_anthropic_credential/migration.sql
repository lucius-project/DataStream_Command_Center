-- CreateTable
CREATE TABLE "AnthropicCredential" (
    "id" TEXT NOT NULL PRIMARY KEY DEFAULT 'anthropic',
    "model" TEXT NOT NULL DEFAULT 'claude-sonnet-5',
    "encryptedApiKey" TEXT NOT NULL,
    "updatedAt" DATETIME NOT NULL
);
