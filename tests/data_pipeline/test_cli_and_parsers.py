import json
from data_pipeline.collectors.domestic_market import parse_rows
from data_pipeline.cli import main

def test_parser_preserves_provenance_and_missing_values():
    rows=parse_rows([{"date":"2026-08-11","value":"--"}],indicator_id="x",source_id="s",source_name="S",source_url="https://s.test",unit="点",snapshot_sha="abc")
    assert rows[0].numeric_value is None
    assert rows[0].source_url == "https://s.test"

def test_catalog_check_cli(tmp_path):
    assert main(["catalog-check","--root","."]) == 0
