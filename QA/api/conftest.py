"""Independent black-box API fixture; never connect to an existing production DB."""

from __future__ import annotations

import os
import re
import secrets
import socket
import subprocess
import time
from pathlib import Path

import httpx
import pymysql
import pytest
from pymysql.constants import CLIENT

ROOT = Path(__file__).resolve().parents[2]
BACKEND = ROOT / "Node-Back"
SCHEMA_FILES = ("01_schema.sql", "08_prompt_schema.sql", "09_ai_schema.sql", "03_seed.sql")


def _ephemeral_port() -> int:
    with socket.socket() as sock:
        sock.bind(("127.0.0.1", 0))
        return sock.getsockname()[1]


def _apply_schema(cursor, canonical_dir: Path) -> None:
    for filename in SCHEMA_FILES:
        sql = (canonical_dir / filename).read_text(encoding="utf-8")
        sql = re.sub(
            r"CREATE DATABASE IF NOT EXISTS vacancy_aggregator\s+"
            r"CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci\s*;",
            "",
            sql,
            flags=re.IGNORECASE,
        )
        sql = re.sub(r"\bUSE\s+vacancy_aggregator\s*;", "", sql, flags=re.IGNORECASE)
        assert "USE vacancy_aggregator" not in sql
        cursor.execute(sql)
        while cursor.nextset():
            pass


@pytest.fixture(scope="session")
def api_environment(tmp_path_factory):
    if os.getenv("RUN_ISOLATED_MYSQL_TESTS") != "yes":
        pytest.fail("Only run with RUN_ISOLATED_MYSQL_TESTS=yes on a disposable MySQL instance")
    canonical = Path(os.environ["CANONICAL_DB_DIR"]).resolve()
    assert canonical.is_dir(), "Canonical SQL directory missing"

    host = os.getenv("TEST_MYSQL_HOST", "127.0.0.1")
    port = int(os.getenv("TEST_MYSQL_PORT", "33316"))
    root_password = os.environ["TEST_MYSQL_PASSWORD"]
    suffix = secrets.token_hex(6)
    database, app_user, password = f"starter_pyqa_{suffix}", f"pyqa_{suffix}", secrets.token_hex(24)
    connection = pymysql.connect(
        host=host, port=port, user=os.getenv("TEST_MYSQL_USER", "root"),
        password=root_password, autocommit=True, client_flag=CLIENT.MULTI_STATEMENTS,
        charset="utf8mb4", connect_timeout=10,
    )
    process = None
    log = None
    created_database = False
    created_user = False
    try:
        with connection.cursor() as cursor:
            cursor.execute("SELECT VERSION()")
            version = str(cursor.fetchone()[0])
            assert version.startswith("8.4."), f"Expected MySQL 8.4, got {version}"
            cursor.execute(f"CREATE DATABASE `{database}` CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci")
            created_database = True
            cursor.execute(f"USE `{database}`")
            _apply_schema(cursor, canonical)
            cursor.execute("SHOW TABLES")
            assert len(cursor.fetchall()) == 17
            cursor.execute(f"CREATE USER '{app_user}'@%s IDENTIFIED BY %s", ("%", password))
            created_user = True
            cursor.execute(f"GRANT SELECT, INSERT, UPDATE, DELETE ON `{database}`.* TO '{app_user}'@'%'")

        api_port = _ephemeral_port()
        base_url = f"http://127.0.0.1:{api_port}"
        env = {
            **os.environ,
            "NODE_ENV": "test", "PORT": str(api_port), "HOST": "127.0.0.1",
            "CORS_ORIGIN": "http://localhost:8765",
            "MYSQL_HOST": host, "MYSQL_PORT": str(port),
            "MYSQL_USER": app_user, "MYSQL_PASSWORD": password, "MYSQL_DATABASE": database,
            "JWT_SECRET": secrets.token_hex(48),
            "JWT_ISSUER": "starter-api", "JWT_AUDIENCE": "starter-client",
        }
        log = (tmp_path_factory.mktemp("qa-server") / "server.log").open("wb")
        process = subprocess.Popen(["node", "dist/server.js"], cwd=BACKEND, env=env,
                                   stdout=log, stderr=subprocess.STDOUT)
        with httpx.Client(timeout=2.0) as client:
            deadline = time.monotonic() + 30
            while time.monotonic() < deadline:
                if process.poll() is not None:
                    pytest.fail(f"API exited early with code {process.returncode}; log: {log.name}")
                try:
                    if client.get(f"{base_url}/api/ready").status_code == 200:
                        break
                except httpx.RequestError:
                    pass
                time.sleep(0.25)
            else:
                pytest.fail(f"API failed to become ready; log: {log.name}")
        yield {"base_url": base_url, "db": database, "admin": connection}
    finally:
        if process is not None:
            process.terminate()
            try:
                process.wait(timeout=12)
            except subprocess.TimeoutExpired:
                process.kill()
                process.wait(timeout=5)
        if log is not None:
            log.close()
        with connection.cursor() as cursor:
            if created_database:
                cursor.execute(f"DROP DATABASE IF EXISTS `{database}`")
            if created_user:
                cursor.execute(f"DROP USER IF EXISTS '{app_user}'@'%'")
        connection.close()


@pytest.fixture
def client(api_environment):
    with httpx.Client(base_url=f"{api_environment['base_url']}/api", timeout=10) as client:
        yield client
