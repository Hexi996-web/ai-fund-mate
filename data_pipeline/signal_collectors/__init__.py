from dataclasses import dataclass

from .html_list import collect_html_list
from .ics import collect_ics
from .rss import collect_rss


@dataclass(frozen=True)
class CollectionResult:
    items: list
    status: str
    message: str = ""


_COLLECTORS = {
    "rss": collect_rss,
    "ics": collect_ics,
    "html_list": collect_html_list,
}


def collect_source(source, fetch) -> CollectionResult:
    """Collect one public source, turning fetch/parser errors into a result."""
    try:
        collector = _COLLECTORS[source.collector]
        return CollectionResult(items=collector(source, fetch), status="normal")
    except Exception as error:
        return CollectionResult(items=[], status="failed", message=str(error))


def collect_sources(sources, fetch) -> list[CollectionResult]:
    """Collect every supplied source, isolating any individual source failure."""
    return [collect_source(source, fetch) for source in sources]