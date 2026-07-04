# Sequential API Audit

Run the full QA workflow audit against a locally running server:

```bash
pnpm test:api-audit
```

What it does:

- Verifies the API is reachable at `http://localhost:3000/api/v1`
- Creates or repairs the named QA tutor/student fixtures
- Registers the self-signup QA student
- Seeds direct database rows for credit balances and one active subscription/payment
- Executes the planned API workflow sequentially
- Writes a machine-readable report to `api-audit-results/latest.json`

Notes:

- Start the Nest app before running the audit.
- The script auto-creates local files in `fixtures/` if they do not exist.
- The audit uses real external integrations for Cloudinary and Agora-dependent routes.
