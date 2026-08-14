from urllib.parse import urljoin

from bs4 import BeautifulSoup

from .rss import _raw_item, _text


def collect_html_list(source, fetch):
    document = BeautifulSoup(_text(fetch(source.url)), "html.parser")
    items = []
    for anchor in document.select("article a[href], li a[href]"):
        title = anchor.get_text(" ", strip=True)
        if not title:
            continue
        body_node = anchor.find_next("p")
        body = body_node.get_text(" ", strip=True) if body_node else None
        items.append(_raw_item(source, urljoin(source.url, anchor["href"]), title, body, None, "html_list"))
    return items