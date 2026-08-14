# Signal intelligence setup

The production pipeline writes directly to Supabase PostgreSQL from a trusted server or GitHub Actions runner. The browser reads only the generated JSON snapshot (or the migration's published views in a future direct-read integration). It never receives `SUPABASE_DB_URL`, a database password, or a service-role key.

## Local fixture mode (no credentials or network)

Use Python 3.12 or newer and install the existing data-pipeline requirements. Fixture mode deliberately selects SQLite even if `SUPABASE_DB_URL` happens to exist in the shell.

```powershell
python -m pip install -r requirements-data.txt
python -m data_pipeline.signal_cli collect --db .tmp/signals.db --fixtures --as-of 2026-08-14T00:00:00+00:00
python -m data_pipeline.signal_cli brief --db .tmp/signals.db --run-at 2026-08-14T08:00:00+08:00
python -m data_pipeline.signal_cli publish --db .tmp/signals.db --output .tmp/signal-radar.json
python -m data_pipeline.signal_cli health --db .tmp/signals.db
```

This path reads only repository fixtures and needs neither Supabase credentials nor a paid model key.

## Create and migrate Supabase

1. Create a Supabase project in the intended organization and region.
2. In the Supabase SQL editor, apply `supabase/migrations/202608140001_signal_intelligence.sql` as a privileged project administrator. Apply it once per environment and retain the migration in version control.
3. Verify that anonymous users can select from `published_signals`, `published_catalysts`, and `published_daily_briefs`, cannot select base tables, and cannot insert, update, or delete through either surface.
4. As a project administrator, create a dedicated login for automation and grant it membership in the migration-created `signal_pipeline_writer` no-login role. Store only that login's direct or session-pooler connection URL; the role has DML access to the eight pipeline tables through scoped RLS policies and no browser grant. Do not use a browser-facing environment variable and do not put the URL in Vite variables such as `VITE_*`.
5. Install the optional driver only in the trusted automation environment:

```powershell
python -m pip install "psycopg[binary]>=3.2,<4"
```

The adapter imports this driver lazily, so local SQLite tests do not require it.

## GitHub Actions secret

In the repository settings, open **Secrets and variables > Actions** and create an encrypted repository or environment secret named `SUPABASE_DB_URL`. Use it only in the server-side pipeline step:

```yaml
env:
  SUPABASE_DB_URL: ${{ secrets.SUPABASE_DB_URL }}
```

Do not print the environment, connection string, database exceptions containing the URL, or interpolated commands. Do not create `VITE_SUPABASE_DB_URL` or expose a service-role key to frontend code. The JSON snapshot is the browser handoff.

## Credential rotation

1. Create or rotate the automation database credential in Supabase.
2. Replace the GitHub `SUPABASE_DB_URL` secret without echoing its value.
3. Run the workflow manually and confirm `collect`, `brief`, `publish`, and `health` succeed.
4. Revoke the old credential only after the new run succeeds.
5. If a credential may have been disclosed, revoke it immediately, replace the GitHub secret, review recent database and Actions logs, and remove the value from any retained logs or artifacts.

Keep separate credentials for development and production, review access periodically, and never commit `.env` files or connection strings.
