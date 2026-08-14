import hashlib
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime
from xml.etree import ElementTree

from data_pipeline.signal_domain import RawItem


def collect_rss(source, fetch) -> list[RawItem]:
    root = ElementTree.fromstring(_text(fetch(source.url)))
    items = []
    for node in root.findall(".//item"):
        title = _value(node, "title") or "Untitled"
        url = _value(node, "link") or source.url
        body = _value(node, "description")
        published_at = _published_at(_value(node, "pubDate"))
        items.append(_raw_item(source, url, title, body, published_at, "rss"))
    return items


def _value(node, name):
    child = node.find(name)
    return child.text.strip() if child is not None and child.text else None


def _published_at(value):
    if not value:
        return None
    parsed = parsedate_to_datetime(value)
    return parsed if parsed.tzinfo else parsed.replace(tzinfo=timezone.utc)


def _raw_item(source, url, title, body, published_at, collector):
    content_status = "available" if body else "title_only"
    content = body or title
    digest = hashlib.sha256(f"{source.id}|{url}|{title}|{content}".encode("utf-8")).hexdigest()
    return RawItem(
        source_id=source.id, url=url, title=title, body=body, content=content,
        content_status=content_status, content_hash=digest,
        collected_at=datetime.now(timezone.utc), published_at=published_at,
        metadata={"collector": collector, "categories": list(source.categories), "region": source.region},
    )


def _text(value):
    return value.decode("utf-8") if isinstance(value, bytes) else value