from forecasting.ledger import ForecastLedger

def test_forecast_is_immutable_and_cannot_be_reviewed_early(tmp_path):
    ledger=ForecastLedger(tmp_path/"ledger.json")
    item=ledger.record({"theme":"gold","createdAt":"2026-08-12","dueAt":"2026-08-19","snapshotSha256":"abc","scenarios":[]})
    again=ledger.record({"theme":"gold","createdAt":"2026-08-12","dueAt":"2026-08-19","snapshotSha256":"abc","scenarios":[]})
    assert item["id"]==again["id"]
    assert ledger.review(item["id"],"2026-08-18",{"score":60})["status"]=="not_due"

def test_due_forecast_review_preserves_original(tmp_path):
    ledger=ForecastLedger(tmp_path/"ledger.json")
    item=ledger.record({"theme":"bond","createdAt":"2026-08-01","dueAt":"2026-08-08","snapshotSha256":"xyz","scenarios":[{"name":"base","probability":.4}]})
    review=ledger.review(item["id"],"2026-08-09",{"score":48})
    assert review["status"]=="reviewed"
    assert ledger.items()[0]["snapshotSha256"]=="xyz"
