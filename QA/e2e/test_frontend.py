"""Browser smoke checks for the current standalone demo frontend (not API E2E)."""

from __future__ import annotations

import re
import socket
import subprocess
import sys
import time
from pathlib import Path

import pytest
from playwright.sync_api import sync_playwright

FRONTEND = Path(__file__).resolve().parents[2] / "VanillaFrontend"


@pytest.fixture(scope="session")
def site_url():
    with socket.socket() as sock:
        sock.bind(("127.0.0.1", 0))
        port = sock.getsockname()[1]
    proc = subprocess.Popen(
        [sys.executable, "-m", "http.server", str(port), "--bind", "127.0.0.1", "--directory", str(FRONTEND)],
        stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
    )
    try:
        import urllib.request
        deadline = time.monotonic() + 15
        while time.monotonic() < deadline:
            try:
                with urllib.request.urlopen(f"http://127.0.0.1:{port}/", timeout=1) as response:
                    if response.status == 200:
                        break
            except OSError:
                time.sleep(0.1)
        else:
            pytest.fail("Frontend static server did not start")
        yield f"http://127.0.0.1:{port}/"
    finally:
        proc.terminate()
        try:
            proc.wait(timeout=5)
        except subprocess.TimeoutExpired:
            proc.kill()
            proc.wait(timeout=5)


@pytest.fixture(scope="session")
def browser():
    with sync_playwright() as pw:
        browser = pw.chromium.launch(headless=True, args=["--no-sandbox"])
        yield browser
        browser.close()


@pytest.fixture
def page(browser):
    page = browser.new_page(viewport={"width": 1366, "height": 768}, reduced_motion="reduce")
    # External fonts and imagery are optional: tests must be offline-friendly.
    page.route("https://**", lambda route: route.abort())
    yield page
    page.close()


def test_home_renders_without_script_errors(page, site_url):
    errors = []
    page.on("pageerror", lambda error: errors.append(str(error)))
    page.goto(site_url, wait_until="domcontentloaded")
    assert page.locator("#hero-title").is_visible()
    assert "Стартер" in page.title() or "стартер" in page.title().lower()
    page.locator(".nav").wait_for()
    page.wait_for_timeout(800)  # Demo catalog resolves after a 450ms timer
    assert not errors, f"Frontend JS errors: {errors}"


def test_theme_switch_and_navigation(page, site_url):
    page.goto(site_url, wait_until="domcontentloaded")
    theme = page.locator("#theme-toggle")
    assert theme.is_visible()
    before = theme.get_attribute("aria-pressed")
    theme.click()
    assert theme.get_attribute("aria-pressed") != before
    page.locator('a[href="#/match"]').first.click()
    assert page.url.endswith("#/match")
    page.locator('a[href="#/saved"]').first.click()
    assert page.url.endswith("#/saved")


def test_mobile_layout_loads(browser, site_url):
    page = browser.new_page(viewport={"width": 390, "height": 844}, reduced_motion="reduce")
    page.route("https://**", lambda route: route.abort())
    try:
        page.goto(site_url, wait_until="domcontentloaded")
        assert page.locator("#hero-title").is_visible()
        assert page.locator("#theme-toggle").is_visible()
    finally:
        page.close()
