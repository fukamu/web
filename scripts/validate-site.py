#!/usr/bin/env python3
"""Validate FUKAMU's static site using only the Python standard library."""

import re
import sys
from html.parser import HTMLParser
from pathlib import Path
from typing import Dict, List, Optional, Set, Tuple
from urllib.parse import unquote, urlsplit


ROOT = Path(__file__).resolve().parents[1]
SITE = ROOT / "site"
REQUIRED_FILES = {
    "index.html",
    "404.html",
    "styles.css",
    "robots.txt",
    "_headers",
    "assets/favicon.svg",
}
REQUIRED_INDEX_TEXT = {
    "FUKAMU",
    "FUKAMU Cycle",
    "FUKAMU™",
    "https://github.com/fukamu/cycle",
}
FORBIDDEN_SITE_TEXT = {
    "株式会社FUKAMU",
    "FUKAMU株式会社",
    "FUKAMU Inc.",
    "FUKAMU Ltd.",
    "当社",
    "弊社",
    "会社概要",
}
REQUIRED_HEADERS = {
    "Content-Security-Policy",
    "X-Content-Type-Options",
    "Referrer-Policy",
    "Permissions-Policy",
    "X-Frame-Options",
}
REQUIRED_CSP_DIRECTIVES = {
    "default-src 'self'",
    "script-src 'none'",
    "style-src 'self'",
    "img-src 'self' data:",
    "font-src 'self'",
    "connect-src 'none'",
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'none'",
    "frame-ancestors 'none'",
}
JS_SUFFIXES = {".js", ".mjs", ".cjs"}


class SiteHTMLParser(HTMLParser):
    """Collect the small set of HTML invariants needed by this site."""

    def __init__(self, path: Path) -> None:
        super().__init__(convert_charrefs=True)
        self.path = path
        self.errors: List[str] = []
        self.ids: Set[str] = set()
        self.references: List[Tuple[str, str, str]] = []
        self.tags: List[str] = []
        self.heading_levels: List[int] = []
        self.h1_count = 0
        self.has_charset = False
        self.has_viewport = False
        self.has_description = False
        self.has_skip_link = False
        self.html_lang: Optional[str] = None

    def handle_starttag(
        self, tag: str, attrs: List[Tuple[str, Optional[str]]]
    ) -> None:
        attributes: Dict[str, str] = {
            name: value or "" for name, value in attrs
        }
        self.tags.append(tag)

        if tag == "html":
            self.html_lang = attributes.get("lang")
        if tag == "meta":
            self.has_charset = self.has_charset or (
                attributes.get("charset", "").lower() == "utf-8"
            )
            meta_name = attributes.get("name", "").lower()
            self.has_viewport = self.has_viewport or meta_name == "viewport"
            self.has_description = self.has_description or meta_name == "description"
        if tag == "script":
            self.errors.append("<script> is forbidden")
        if tag == "h1":
            self.h1_count += 1
        if re.fullmatch(r"h[1-6]", tag):
            self.heading_levels.append(int(tag[1]))
        if "id" in attributes:
            element_id = attributes["id"]
            if not element_id:
                self.errors.append("an empty id attribute is not allowed")
            elif element_id in self.ids:
                self.errors.append("duplicate id: {0}".format(element_id))
            self.ids.add(element_id)
        if "style" in attributes:
            self.errors.append("inline style attributes are forbidden")
        if attributes.get("target", "").lower() == "_blank":
            self.errors.append('target="_blank" is not used by this site')
        if tag == "img" and "alt" not in attributes:
            self.errors.append("every image must have an alt attribute")
        if tag == "a":
            href = attributes.get("href", "")
            if not href or href == "#":
                self.errors.append("links must have a non-placeholder href")
            classes = set(attributes.get("class", "").split())
            if "skip-link" in classes and href.startswith("#"):
                self.has_skip_link = True

        for attribute_name in ("href", "src"):
            if attribute_name not in attributes:
                continue
            value = attributes[attribute_name].strip()
            self.references.append((tag, attribute_name, value))
            parsed = urlsplit(value)
            is_external = parsed.scheme in {"http", "https"} or bool(parsed.netloc)
            rel_values = set(attributes.get("rel", "").lower().split())
            if is_external and (
                attribute_name == "src"
                or tag == "script"
                or (tag == "link" and "stylesheet" in rel_values)
            ):
                self.errors.append(
                    "external scripts, stylesheets, fonts, and media are forbidden: {0}".format(
                        value
                    )
                )

    def validate_document(self) -> None:
        if self.html_lang != "ja":
            self.errors.append('the html element must declare lang="ja"')
        if not self.has_charset:
            self.errors.append("a UTF-8 charset declaration is required")
        if not self.has_viewport:
            self.errors.append("a viewport meta element is required")
        if not self.has_description:
            self.errors.append("a meta description is required")
        if self.h1_count != 1:
            self.errors.append("each page must contain exactly one h1")
        if not self.has_skip_link:
            self.errors.append("a skip link targeting page content is required")
        for landmark in ("header", "main", "section", "footer"):
            if landmark not in self.tags:
                self.errors.append("missing semantic landmark: <{0}>".format(landmark))
        if self.path.name == "index.html" and "article" not in self.tags:
            self.errors.append("the product list must contain an <article>")
        for previous, current in zip(self.heading_levels, self.heading_levels[1:]):
            if current > previous + 1:
                self.errors.append(
                    "heading levels must not be skipped: h{0} to h{1}".format(
                        previous, current
                    )
                )


def resolve_local_reference(source: Path, reference: str) -> Tuple[Path, str]:
    parsed = urlsplit(reference)
    fragment = unquote(parsed.fragment)
    if parsed.path.startswith("/"):
        target = SITE / unquote(parsed.path.lstrip("/"))
    elif parsed.path:
        target = source.parent / unquote(parsed.path)
    else:
        target = source
    if parsed.path.endswith("/") or target == SITE:
        target = target / "index.html"
    return target.resolve(), fragment


def validate_html(errors: List[str]) -> None:
    documents: Dict[Path, SiteHTMLParser] = {}
    for path in sorted(SITE.glob("*.html")):
        parser = SiteHTMLParser(path)
        source_text = path.read_text(encoding="utf-8")
        if re.search(r"<\s*script\b", source_text, flags=re.IGNORECASE):
            parser.errors.append("script markup is forbidden")
        try:
            parser.feed(source_text)
            parser.close()
        except Exception as exc:
            parser.errors.append("HTML parsing failed: {0}".format(exc))
        parser.validate_document()
        documents[path.resolve()] = parser
        errors.extend(
            "{0}: {1}".format(path.relative_to(ROOT), message)
            for message in parser.errors
        )

    for source_path, parser in documents.items():
        for _tag, _attribute, reference in parser.references:
            parsed = urlsplit(reference)
            if parsed.scheme or parsed.netloc or reference.startswith("data:"):
                continue
            target, fragment = resolve_local_reference(source_path, reference)
            try:
                target.relative_to(SITE.resolve())
            except ValueError:
                errors.append(
                    "{0}: local reference escapes site/: {1}".format(
                        source_path.relative_to(ROOT), reference
                    )
                )
                continue
            if not target.is_file():
                errors.append(
                    "{0}: missing local reference: {1}".format(
                        source_path.relative_to(ROOT), reference
                    )
                )
                continue
            if fragment and target.suffix == ".html":
                target_document = documents.get(target)
                if target_document is None or fragment not in target_document.ids:
                    errors.append(
                        "{0}: missing fragment target: {1}".format(
                            source_path.relative_to(ROOT), reference
                        )
                    )


def validate_css(errors: List[str]) -> None:
    css = (SITE / "styles.css").read_text(encoding="utf-8")
    if "@import" in css.lower():
        errors.append("site/styles.css: @import is forbidden")
    if re.search(r"url\(\s*['\"]?(?:https?:)?//", css, flags=re.IGNORECASE):
        errors.append("site/styles.css: external URL references are forbidden")
    for required in (":focus-visible", "prefers-reduced-motion"):
        if required not in css:
            errors.append("site/styles.css: missing {0}".format(required))
    if "!important" in css:
        errors.append("site/styles.css: !important is forbidden")


def validate_headers(errors: List[str]) -> None:
    headers = (SITE / "_headers").read_text(encoding="utf-8")
    for header in REQUIRED_HEADERS:
        if not re.search(r"^\s+{0}:".format(re.escape(header)), headers, re.MULTILINE):
            errors.append("site/_headers: missing {0}".format(header))
    csp_match = re.search(
        r"^\s+Content-Security-Policy:\s*(.+)$", headers, re.MULTILINE
    )
    if csp_match:
        for directive in REQUIRED_CSP_DIRECTIVES:
            if directive not in csp_match.group(1):
                errors.append("site/_headers: CSP is missing {0}".format(directive))
    if re.search(r"includeSubDomains|preload", headers, re.IGNORECASE):
        errors.append("site/_headers: HSTS includeSubDomains/preload is forbidden")


def validate_required_content(errors: List[str]) -> bool:
    missing_files = [name for name in REQUIRED_FILES if not (SITE / name).is_file()]
    for name in sorted(missing_files):
        errors.append("missing required file: site/{0}".format(name))
    if missing_files:
        return False

    index = (SITE / "index.html").read_text(encoding="utf-8")
    for required in REQUIRED_INDEX_TEXT:
        if required not in index:
            errors.append("site/index.html: missing required text: {0}".format(required))

    all_site_text = "\n".join(
        path.read_text(encoding="utf-8", errors="replace")
        for path in SITE.rglob("*")
        if path.is_file()
    )
    for forbidden in FORBIDDEN_SITE_TEXT:
        if forbidden in all_site_text:
            errors.append("site/: forbidden wording found: {0}".format(forbidden))

    for path in SITE.rglob("*"):
        if path.is_file() and path.suffix.lower() in JS_SUFFIXES:
            errors.append(
                "JavaScript files are forbidden: {0}".format(path.relative_to(ROOT))
            )
    return True


def main() -> int:
    errors: List[str] = []
    if not SITE.is_dir():
        print("ERROR: site/ does not exist", file=sys.stderr)
        return 1

    if validate_required_content(errors):
        validate_html(errors)
        validate_css(errors)
        validate_headers(errors)

    if errors:
        for error in errors:
            print("ERROR: {0}".format(error), file=sys.stderr)
        print("Site validation failed with {0} error(s).".format(len(errors)))
        return 1

    print("Site validation passed.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
