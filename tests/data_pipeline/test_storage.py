from datetime import date, datetime, timezone

from data_pipeline.domain import Observation, QualityStatus
from data_pipeline.storage import DataRepository


def test_repository_initializes_idempotently_and_upserts_observations(tmp_path):
    repo = DataRepository(tmp_path / "data.sqlite3")
    repo.initialize()
    repo.initialize()
    observation = Observation(
        indicator_id="gold_price_cny", source_id="sge", effective_date=date(2026, 8, 11),
        collected_at=datetime(2026, 8, 12, tzinfo=timezone.utc), numeric_value=780.2,
        text_value=None, unit="元/克", dimension_key="", quality_status=QualityStatus.NORMAL,
        source_name="上海黄金交易所", source_url="https://www.sge.com.cn/", published_at=None,
        raw_snapshot_sha256="abc", is_estimate=False,
    )
    assert repo.upsert_observations([observation]).inserted == 1
    assert repo.upsert_observations([observation]).inserted == 0
    assert len(repo.latest_observations()) == 1
