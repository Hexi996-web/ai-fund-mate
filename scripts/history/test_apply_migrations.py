import tempfile
import unittest
from pathlib import Path
from scripts.history.apply_migrations import discover_migrations, migration_checksum


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


if __name__ == "__main__":
    unittest.main()
