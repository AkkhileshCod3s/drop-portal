"""One-time helper: set the CORS rules on the storage bucket.

Run from the project root after filling in .env:

    python set_cors.py

The browser PUTs files to (and GETs them from) the bucket directly via
presigned URLs, so the bucket must allow requests from the app's origins.
Note: this script lives in the project root, NOT in api/, because Vercel
treats everything in api/ as a serverless function.
"""

import os
from pathlib import Path

import boto3
from botocore.config import Config
from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parent / ".env")

ORIGINS = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    # After deploying, add your production URL here and re-run this script:
    "https://dropportal.vercel.app",
]


def main() -> None:
    endpoint = os.environ["S3_ENDPOINT"]
    region = os.environ["S3_REGION"]
    key_id = os.environ["R2_ACCESS_KEY_ID"]
    secret = os.environ["R2_SECRET_ACCESS_KEY"]
    bucket = os.environ["R2_BUCKET"]

    s3 = boto3.client(
        "s3",
        endpoint_url=endpoint,
        region_name=region,
        aws_access_key_id=key_id,
        aws_secret_access_key=secret,
        config=Config(signature_version="s3v4", s3={"addressing_style": "path"}),
    )

    s3.put_bucket_cors(
        Bucket=bucket,
        CORSConfiguration={
            "CORSRules": [
                {
                    "AllowedMethods": ["GET", "PUT", "POST", "HEAD"],
                    "AllowedOrigins": ORIGINS,
                    "AllowedHeaders": ["*"],
                    "ExposeHeaders": ["ETag"],
                    "MaxAgeSeconds": 3000,
                }
            ]
        },
    )

    print(f"CORS rules set on bucket {bucket!r} for origins:")
    for origin in ORIGINS:
        print(f"  - {origin}")


if __name__ == "__main__":
    main()
