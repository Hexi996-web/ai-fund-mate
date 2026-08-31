import tempfile
import unittest
from pathlib import Path
from scripts.history.apply_migrations import discover_migrations, migration_checksum, transactional_sql


class MigrationDiscoveryTests(unittest.TestCase):
    def test_discovers_numbered_migrations_in_order(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / "002_second.sql").write_text("select 2;", encoding="utf-8")
            (root / "001_first.sql").write_text("select 1;", encoding="utf-8")
            (root / "notes.sql").write_text("ignored", encoding="utf-8")
            self.assertEqual([path.name for path in discover_migrations(root)], ["001_first.sql", "002_second.sql"])

    def test_checksum_changes_with_content(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "001_first.sql"
            path.write_text("select 1;", encoding="utf-8"); before = migration_checksum(path)
            path.write_text("select 2;", encoding="utf-8")
            self.assertNotEqual(before, migration_checksum(path))

    def test_checksum_is_independent_of_platform_line_endings(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            windows = root / "001_windows.sql"
            unix = root / "001_unix.sql"
            windows.write_bytes(b"begin;\r\nselect 1;\r\ncommit;\r\n")
            unix.write_bytes(b"begin;\nselect 1;\ncommit;\n")
            self.assertEqual(migration_checksum(windows), migration_checksum(unix))

    def test_strips_transaction_wrapper_for_atomic_ledger_update(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "001_first.sql"
            path.write_text("begin;\ncreate table example(id int);\ncommit;", encoding="utf-8")
            self.assertEqual(transactional_sql(path), "create table example(id int);")

    def test_rejects_unwrapped_migration(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "001_first.sql"
            path.write_text("create table example(id int);", encoding="utf-8")
            with self.assertRaises(ValueError):
                transactional_sql(path)


if __name__ == "__main__":
    unittest.main()
