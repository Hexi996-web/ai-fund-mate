from datetime import datetime, timezone
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from .rss import _raw_item, _text


def collect_ics(source, fetch):
    events = []
    for block in _text(fetch(source.url)).replace("\r\n", "\n").split("BEGIN:VEVENT\n")[1:]:
        fields = _fields(block.split("END:VEVENT", 1)[0])
        title = _field_value(fields, "SUMMARY", "Untitled")
        url = _field_value(fields, "URL", source.url)
        events.append(_raw_item(
            source, url, title, _field_value(fields, "DESCRIPTION"),
            _ics_datetime(fields.get("DTSTART")), "ics",
        ))
    return events


def _fields(block):
    fields = {}
    for line in _unfold(block).splitlines():
        key, separator, value = line.partition(":")
        if not separator:
            continue
        name, *parameters = key.split(";")
        params = {}
        for parameter in parameters:
            param_name, equals, param_value = parameter.partition("=")
            if equals:
                params[param_name.upper()] = param_value.strip('"')
        fields[name.upper()] = (value.strip(), params)
    return fields


def _unfold(block):
    lines = []
    for line in block.splitlines():
        if line.startswith((" ", "\t")) and lines:
            lines[-1] += line[1:]
        else:
            lines.append(line)
    return "\n".join(lines)


def _field_value(fields, name, default=None):
    field = fields.get(name)
    return field[0] if field else default


def _ics_datetime(field):
    if not field:
        return None
    value, parameters = field
    if value.endswith("Z"):
        return datetime.strptime(value, "%Y%m%dT%H%M%SZ").replace(tzinfo=timezone.utc)
    timezone_id = parameters.get("TZID")
    if timezone_id:
        try:
            zone = ZoneInfo(timezone_id)
        except ZoneInfoNotFoundError as error:
            raise ValueError(f"Unknown TZID: {timezone_id}") from error
        return datetime.strptime(value, "%Y%m%dT%H%M%S").replace(tzinfo=zone).astimezone(timezone.utc)
    # Floating and all-day values do not identify an instant, so do not label them UTC.
    return None
