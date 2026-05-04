import re, os, sys, io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
pages = ["home","about","projects","blog","contact","mortgages","sales-arena"]
for p in pages:
    fn = f"{p}.html"
    if not os.path.exists(fn):
        continue
    with open(fn, encoding="utf-8", errors="replace") as f:
        html = f.read()
    m = re.search(r"<title[^>]*>(.*?)</title>", html, re.IGNORECASE|re.DOTALL)
    title = m.group(1).strip() if m else "(none)"
    m = re.search(r'<meta[^>]+name=["\']description["\'][^>]*content=["\'](.*?)["\']', html, re.IGNORECASE|re.DOTALL)
    if not m:
        m = re.search(r'<meta[^>]+content=["\'](.*?)["\'][^>]*name=["\']description["\']', html, re.IGNORECASE|re.DOTALL)
    desc = m.group(1).strip() if m else "(none)"
    m = re.search(r'<meta[^>]+property=["\']og:title["\'][^>]*content=["\'](.*?)["\']', html, re.IGNORECASE|re.DOTALL)
    og_title = m.group(1).strip() if m else "(none)"
    h1s = re.findall(r"<h1[^>]*>(.*?)</h1>", html, re.IGNORECASE|re.DOTALL)
    h1s_clean = [re.sub(r"<[^>]+>", "", h).strip() for h in h1s]
    h1s_clean = [h for h in h1s_clean if h]
    plugin = "unknown"
    low = html.lower()
    if "yoast" in low:
        plugin = "Yoast SEO"
    elif "rank-math" in low or "rankmath" in low:
        plugin = "Rank Math"
    elif "aioseo" in low or "all-in-one-seo" in low:
        plugin = "AIOSEO"
    elif "seopress" in low:
        plugin = "SEOPress"
    elif "the-seo-framework" in low:
        plugin = "SEO Framework"
    print(f"\n===== {p} =====")
    print(f"  Plugin: {plugin}")
    print(f"  <title> [{len(title)}]: {title}")
    print(f"  <meta desc> [{len(desc)}]: {desc[:200]}")
    print(f"  og:title: {og_title}")
    print(f"  H1 count: {len(h1s_clean)}")
    for i, h in enumerate(h1s_clean, 1):
        print(f"    H1[{i}]: {h[:120]}")
