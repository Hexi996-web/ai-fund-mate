from bs4 import BeautifulSoup
def parse_policy_html(content):
    soup=BeautifulSoup(content,"html.parser")
    for node in soup(["script","style","nav"]): node.decompose()
    return "\n".join(x.strip() for x in soup.get_text("\n").splitlines() if x.strip())
