"""dropportal backend — a single-file Flask app.

Run locally with:

    flask --app api/index run --debug

On Vercel, the module-level `app` object below is served as a serverless
function; vercel.json rewrites /api/* to it.
"""

import os
import re
import secrets
from datetime import datetime, timedelta, timezone
from pathlib import Path

import boto3
from botocore.config import Config
from dotenv import load_dotenv
from flask import Flask, jsonify, request
from supabase import create_client
from werkzeug.exceptions import HTTPException
from werkzeug.security import check_password_hash, generate_password_hash

# Load .env from the project root (one level above api/) with an explicit path,
# so the backend works no matter which folder it is started from. On Vercel
# there is no .env file and the real environment variables are used instead.
load_dotenv(Path(__file__).resolve().parent.parent / ".env")

app = Flask(__name__)

MAX_TOTAL_BYTES = int(os.environ.get("MAX_TOTAL_BYTES", "2147483648"))
MAX_FILES = 20
MAX_EXPIRY_HOURS = 168  # one week
DEFAULT_EXPIRY_HOURS = 24
MAX_DOWNLOAD_LIMIT = 10_000
PRESIGN_PUT_SECONDS = 60 * 60   # 1 hour to start uploading each file
PRESIGN_GET_SECONDS = 60 * 15   # 15 minutes to finish each download
FINISHED_GRACE_MINUTES = 20     # how long a finished drop survives before cleanup

MIME_RE = re.compile(r"^[\w.+-]+/[\w.+-]+$")

_s3 = None
_sb = None


def _env(name: str) -> str:
    value = os.environ.get(name)
    if not value:
        raise KeyError(f"missing required environment variable: {name}")
    return value


def get_s3():
    """S3-compatible client (Filebase, Backblaze B2, Cloudflare R2, MinIO, ...)."""
    global _s3
    if _s3 is None:
        _s3 = boto3.client(
            "s3",
            endpoint_url=_env("S3_ENDPOINT"),
            region_name=_env("S3_REGION"),
            aws_access_key_id=_env("R2_ACCESS_KEY_ID"),
            aws_secret_access_key=_env("R2_SECRET_ACCESS_KEY"),
            config=Config(signature_version="s3v4", s3={"addressing_style": "path"}),
        )
    return _s3


def get_bucket() -> str:
    return _env("R2_BUCKET")


def get_sb():
    """Supabase client with the service-role key (server-side only)."""
    global _sb
    if _sb is None:
        _sb = create_client(_env("SUPABASE_URL"), _env("SUPABASE_SERVICE_KEY"))
    return _sb


# ---------------------------------------------------------------------------
# helpers
# ---------------------------------------------------------------------------

def json_error(status: int, message: str):
    return jsonify({"error": message}), status


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


def parse_dt(value):
    """Parse a timestamptz value as returned by Supabase into an aware datetime."""
    if value is None:
        return None
    if isinstance(value, datetime):
        dt = value
    else:
        text = str(value).strip()
        if text.endswith("Z"):
            text = text[:-1] + "+00:00"
        try:
            dt = datetime.fromisoformat(text)
        except ValueError:
            return None
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)


def safe_name(name: str) -> str:
    """Sanitize a file name for use inside a storage key / download header."""
    base = os.path.basename(str(name).replace("\\", "/"))
    cleaned = re.sub(r"[^A-Za-z0-9._-]+", "_", base).strip("_")
    return (cleaned or "file")[:120]


def clean_type(value) -> str:
    """Keep sensible MIME types, fall back to a safe default."""
    if isinstance(value, str):
        candidate = value.strip().lower()
        if candidate and len(candidate) <= 100 and MIME_RE.match(candidate):
            return candidate
    return "application/octet-stream"


def new_slug() -> str:
    while True:
        slug = secrets.token_urlsafe(6)  # 8 url-safe characters
        taken = get_sb().table("drops").select("slug").eq("slug", slug).execute()
        if not taken.data:
            return slug


def is_finished(row: dict) -> bool:
    """True when the drop has been used up (first download / limit reached)."""
    count = row.get("download_count") or 0
    if row.get("delete_after_download") and count >= 1:
        return True
    limit = row.get("download_limit")
    return limit is not None and count >= limit


def _load(slug: str):
    """Load a drop row; lazily purge and hide it once it is expired."""
    res = get_sb().table("drops").select("*").eq("slug", slug).execute()
    rows = res.data or []
    if not rows:
        return None
    row = rows[0]
    expires = parse_dt(row.get("expires_at"))
    if expires is not None and expires < utcnow():
        _purge(row)
        return None
    return row


def _purge(row: dict) -> None:
    """Delete every object of a drop, then the row.

    Some S3-compatible providers do not support bulk delete, so objects are
    removed one by one; per-file errors are logged instead of aborting, so a
    stuck object can not prevent the row from being cleaned up on a later pass.
    """
    s3 = get_s3()
    bucket = get_bucket()
    for f in row.get("files") or []:
        key = f.get("key")
        if not key:
            continue
        try:
            s3.delete_object(Bucket=bucket, Key=key)
        except Exception as exc:  # noqa: BLE001
            app.logger.error("could not delete object %s: %s", key, exc)
    try:
        get_sb().table("drops").delete().eq("slug", row["slug"]).execute()
    except Exception as exc:  # noqa: BLE001
        app.logger.error("could not delete drop row %s: %s", row.get("slug"), exc)


# ---------------------------------------------------------------------------
# routes
# ---------------------------------------------------------------------------

@app.get("/api/health")
def health():
    return jsonify({"ok": True, "time": utcnow().isoformat()})


@app.post("/api/drops")
def create_drop():
    body = request.get_json(silent=True) or {}

    files_in = body.get("files")
    if not isinstance(files_in, list) or not files_in:
        return json_error(400, "files must be a non-empty list")
    if len(files_in) > MAX_FILES:
        return json_error(400, f"too many files (max {MAX_FILES} per drop)")

    cleaned = []
    total = 0
    for f in files_in:
        if not isinstance(f, dict):
            return json_error(400, "each file must be an object with name and size")
        name = f.get("name")
        size = f.get("size")
        if not isinstance(name, str) or not name.strip():
            return json_error(400, "each file needs a name")
        if isinstance(size, bool) or not isinstance(size, int) or size < 0:
            return json_error(400, f"invalid size for file {name!r}")
        cleaned.append({"name": name, "size": size, "type": clean_type(f.get("type"))})
        total += size

    if total > MAX_TOTAL_BYTES:
        return json_error(413, f"total size exceeds the limit of {MAX_TOTAL_BYTES} bytes")

    expiry_hours = body.get("expiry_hours", DEFAULT_EXPIRY_HOURS)
    if (
        isinstance(expiry_hours, bool)
        or not isinstance(expiry_hours, int)
        or not 1 <= expiry_hours <= MAX_EXPIRY_HOURS
    ):
        return json_error(400, f"expiry_hours must be between 1 and {MAX_EXPIRY_HOURS}")

    download_limit = body.get("download_limit")
    if download_limit is not None:
        if (
            isinstance(download_limit, bool)
            or not isinstance(download_limit, int)
            or download_limit < 1
        ):
            return json_error(400, "download_limit must be a positive integer")
        download_limit = min(download_limit, MAX_DOWNLOAD_LIMIT)

    password = body.get("password")
    if password is not None:
        if not isinstance(password, str) or len(password) > 1024:
            return json_error(400, "invalid password")
    password_hash = generate_password_hash(password) if password else None

    slug = new_slug()
    delete_token = secrets.token_urlsafe(24)
    expires_at = (utcnow() + timedelta(hours=expiry_hours)).isoformat()

    stored_files = []
    uploads = []
    for f in cleaned:
        key = f"{slug}/{secrets.token_hex(8)}-{safe_name(f['name'])}"
        stored_files.append({"name": f["name"], "size": f["size"], "key": key})
        url = get_s3().generate_presigned_url(
            "put_object",
            Params={"Bucket": get_bucket(), "Key": key, "ContentType": f["type"]},
            ExpiresIn=PRESIGN_PUT_SECONDS,
        )
        uploads.append({"name": f["name"], "url": url})

    get_sb().table("drops").insert(
        {
            "slug": slug,
            "files": stored_files,
            "total_size": total,
            "password_hash": password_hash,
            "expires_at": expires_at,
            "download_limit": download_limit,
            "download_count": 0,
            "delete_after_download": bool(body.get("delete_after_download", False)),
            "delete_token": delete_token,
        }
    ).execute()

    return (
        jsonify(
            {
                "slug": slug,
                "delete_token": delete_token,
                "expires_at": expires_at,
                "uploads": uploads,
            }
        ),
        201,
    )


@app.get("/api/drops/<slug>")
def get_drop(slug):
    row = _load(slug)
    if row is None:
        return json_error(404, "drop not found or expired")
    if is_finished(row):
        return json_error(410, "already used")
    return jsonify(
        {
            "slug": row["slug"],
            "files": [
                {"name": f.get("name"), "size": f.get("size")}
                for f in row.get("files") or []
            ],
            "total_size": row.get("total_size"),
            "expires_at": row.get("expires_at"),
            "has_password": bool(row.get("password_hash")),
            "delete_after_download": bool(row.get("delete_after_download")),
            "download_limit": row.get("download_limit"),
            "download_count": row.get("download_count") or 0,
        }
    )


@app.post("/api/drops/<slug>/download")
def download_drop(slug):
    # a. Load the drop (404 for unknown or expired, expired ones are purged).
    row = _load(slug)
    if row is None:
        return json_error(404, "drop not found or expired")

    # b. Check the password.
    if row.get("password_hash"):
        password = (request.get_json(silent=True) or {}).get("password", "")
        if not isinstance(password, str) or not check_password_hash(
            row["password_hash"], password
        ):
            return json_error(401, "wrong password")

    # c. Refuse drops that are used up.
    if is_finished(row):
        return json_error(410, "download limit reached")

    # d. Presigned GET URLs — the browser downloads straight from storage.
    urls = []
    for f in row.get("files") or []:
        urls.append(
            {
                "name": f.get("name"),
                "url": get_s3().generate_presigned_url(
                    "get_object",
                    Params={
                        "Bucket": get_bucket(),
                        "Key": f["key"],
                        "ResponseContentDisposition": (
                            f'attachment; filename="{safe_name(f.get("name") or "file")}"'
                        ),
                    },
                    ExpiresIn=PRESIGN_GET_SECONDS,
                ),
            }
        )

    # e. Count the download.
    new_count = (row.get("download_count") or 0) + 1
    get_sb().table("drops").update({"download_count": new_count}).eq("slug", slug).execute()

    # f. If the drop is now finished, do NOT delete anything in this request —
    #    the browser is about to download from the URLs generated above.
    #    Shorten the lifetime instead; the cleanup cron and the lazy purge in
    #    _load remove the files once the presigned URLs have expired.
    limit = row.get("download_limit")
    finished = bool(row.get("delete_after_download")) or (
        limit is not None and new_count >= limit
    )
    if finished:
        grace = utcnow() + timedelta(minutes=FINISHED_GRACE_MINUTES)
        current = parse_dt(row.get("expires_at"))
        if current is None or grace < current:
            get_sb().table("drops").update({"expires_at": grace.isoformat()}).eq("slug", slug).execute()

    # g. Return the URLs.
    return jsonify({"urls": urls})


@app.delete("/api/drops/<slug>")
def delete_drop(slug):
    token = request.args.get("token", "")
    row = _load(slug)
    if row is None:
        return json_error(404, "drop not found or expired")
    if not token or not secrets.compare_digest(
        token.encode(), str(row.get("delete_token") or "").encode()
    ):
        return json_error(403, "invalid delete token")
    # Owner delete: nothing is being downloaded, so purge immediately.
    _purge(row)
    return jsonify({"ok": True})


@app.get("/api/cron/cleanup")
def cron_cleanup():
    expected = f"Bearer {os.environ.get('CRON_SECRET', '')}"
    provided = request.headers.get("Authorization", "")
    if not os.environ.get("CRON_SECRET") or not secrets.compare_digest(
        provided.encode(), expected.encode()
    ):
        return json_error(403, "forbidden")
    res = (
        get_sb()
        .table("drops")
        .select("*")
        .lt("expires_at", utcnow().isoformat())
        .execute()
    )
    rows = res.data or []
    for row in rows:
        _purge(row)
    return jsonify({"purged": len(rows)})


# ---------------------------------------------------------------------------
# error handling
# ---------------------------------------------------------------------------

@app.errorhandler(Exception)
def handle_exception(e):
    if isinstance(e, HTTPException):
        return json_error(e.code or 500, e.description or "error")
    app.logger.exception("unhandled error")
    if isinstance(e, KeyError):
        return json_error(500, f"server misconfigured: {e}")
    return json_error(500, "internal server error")


if __name__ == "__main__":
    app.run(debug=True, port=5000)
