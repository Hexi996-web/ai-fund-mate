from forecasting.history import HistoryStore


def test_history_is_content_addressed_and_idempotent(tmp_path):
    store=HistoryStore(tmp_path)
    first=store.save("2026-08-12",{"observations":[{"x":1}]})
    second=store.save("2026-08-12",{"observations":[{"x":1}]})
    assert first["sha256"]==second["sha256"]
    assert len(store.index())==1
