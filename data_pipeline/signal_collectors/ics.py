from datetime import datetime, timezone

from .rss import _raw_item, _text


def collect_ics(source, fetch):
    events = []
    for block in _text(fetch(source.url)).replace("\r\n", "\n").split("BEGIN:VEVENT\n")[1:]:
        fields = _fields(block.split("END:VEVENT", 1)[0])
        title = fields.get("SUMMARY", "Untitled")
        url = fields.get("URL", source.url)
        events.append(_raw_item(source, url, title, fields.get("DESCRIPTION"), _ics_datetime(fields.get("DTSTART")), "ics"))
    return events


def _fields(block):
    fields = {}
    for line in block.splitlines():
        key, separator, value = line.partition(":")
        if separator:
            fields[key.split(";", 1)[0]] = value.strip()
    return fields


def _ics_datetime(value):
    if not value:
        return None
    if value.endswith("Z"):
        return datetime.strptime(value, "%Y%m%dT%H%M%SZ").replace(tzinfo=timezone.utc)
    if "T" in value:
        return datetime.strptime(value, "%Y%m%dT%H%M%S").replace(tzinfo=timezone.utc)
    return datetime.strptime(value, "%Y%m%d").replace(tzinfo=timezone.utc)