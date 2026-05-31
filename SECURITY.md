# Security Policy

## Local-Only Scope

Storybook AI Local is designed for a trusted local machine and a single user. It intentionally does not include login, registration, password reset, user isolation, quotas, or a hosted worker queue.

Do not expose the app to the public internet as-is. Anyone who can reach the running app can create books with the configured server-side Doubao credentials and read or delete local generated books.

## Secrets

Keep `.env` local and never commit real API keys. Only `.env.example` belongs in the repository.

## Reporting Issues

Please report security issues through GitHub Security Advisories when available, or open a minimal issue that avoids disclosing exploitable details publicly.
