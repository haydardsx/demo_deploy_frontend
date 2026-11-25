"""运行演示仓与拉取请求共用的检查。"""

import json
from pathlib import Path
import secrets
import subprocess
import tempfile
import time


ROOT = Path(__file__).resolve().parents[1]
GITLEAKS = "ghcr.io/gitleaks/gitleaks@sha256:691af3c7c5a48b16f187ce3446d5f194838f91238f27270ed36eef6359a574d9"


def run(*args, **options):
    return subprocess.run(args, cwd=ROOT, check=True, **options)


def read(*args, **options):
    return run(*args, stdout=subprocess.PIPE, text=True, **options).stdout.strip()


def check_source():
    for name, link in (("README.md", "(README.zh-CN.md)"), ("README.zh-CN.md", "(README.md)")):
        if link not in (ROOT / name).read_text(encoding="utf-8"):
            raise ValueError(f"{name} 缺少对应语言的入口。")
    with tempfile.TemporaryDirectory(prefix="demo-source-") as area:
        snapshot = Path(area) / "source"
        snapshot.mkdir()
        archive = Path(area) / "source.tar"
        run("git", "archive", "--format=tar", "--output=" + str(archive), "HEAD")
        run("tar", "-xf", str(archive), "-C", str(snapshot))
        run("docker", "run", "--rm", "-v", f"{snapshot}:/src:ro",
            GITLEAKS, "dir", "/src", "--redact=100", "--no-banner")


def check_runtime():
    name = "community-demo-frontend-" + secrets.token_hex(6)
    revision = read("git", "rev-parse", "HEAD")
    expected = {
        "server1Url": "https://server1.example.com",
        "server2Url": "https://server2.example.com",
        "gatewayUrl": "https://gateway.example.com",
        "buildRevision": revision,
    }
    run("docker", "build", "--build-arg", "BUILD_REVISION=" + revision, "-t", name, ".")
    try:
        run("docker", "run", "-d", "--name", name, "-p", "127.0.0.1:0:80",
            "-e", "DEMO_SERVER1_URL=" + expected["server1Url"],
            "-e", "DEMO_SERVER2_URL=" + expected["server2Url"],
            "-e", "DEMO_GATEWAY_URL=" + expected["gatewayUrl"], name)
        base = "http://" + read("docker", "port", name, "80/tcp")
        curl = ("curl", "--silent", "--show-error", "--fail", "--max-time", "5")
        for _ in range(30):
            probe = subprocess.run((*curl, base + "/health"), cwd=ROOT, check=False,
                                   stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            if probe.returncode == 0:
                break
            time.sleep(1)
        else:
            raise ValueError("演示容器的 /health 未就绪。")
        actual = json.loads(read(*curl, base + "/runtime-config.json"))
        if actual != expected:
            raise ValueError("容器返回的运行配置与启动参数不一致。")
        if "OPS" not in read(*curl, base + "/"):
            raise ValueError("容器未提供前端页面。")
    finally:
        subprocess.run(("docker", "rm", "-f", name), cwd=ROOT, check=False,
                       stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        run("docker", "image", "rm", name)


def main():
    check_source()
    run("npm", "ci")
    run("npm", "test")
    run("npm", "run", "test:runtime")
    run("npm", "run", "build")
    run("npm", "audit", "--omit=dev", "--audit-level=high")
    check_runtime()


if __name__ == "__main__":
    try:
        main()
    except (OSError, ValueError, subprocess.CalledProcessError) as error:
        raise SystemExit(str(error)) from None
