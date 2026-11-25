"""核对用途分支、提交标题和拉取请求标题。"""

import argparse
import json
import os
from pathlib import Path
import re
import subprocess


TYPES = "feat|fix|docs|style|refactor|perf|test|build|ci|chore|revert"
SCOPES = set("app frontend demo config deps docs test ci docker".split())
PLACEHOLDERS = {
    "update", "fix", "wip", "tmp", "test", "change", "updates", "changes",
    "todo", "修改", "更新", "测试", "修复",
}
SUBJECT = re.compile(rf"(?:{TYPES})\((?P<scope>[a-z0-9-]+)\)!?: (?P<summary>\S[^\r\n]*)")
BRANCH = re.compile(rf"(?:{TYPES})/[a-z0-9]+(?:-[a-z0-9]+)*")
REVIEWED = re.compile(r"reviewed/[0-9a-f]{40}")
PROJECT_EMAIL = "community@iqu.lol"


def check_branch(branch):
    if len(branch) > 64 or not BRANCH.fullmatch(branch):
        raise ValueError("从 main 创建用途分支，例如 feat/deployment-check。")


def check_subject(title):
    match = SUBJECT.fullmatch(title)
    if not match or not title.isprintable() or len(title) > 100 or match["scope"] not in SCOPES:
        raise ValueError("使用含本仓支持范围的 Conventional Commit 标题。")
    summary = match["summary"]
    words = "".join(ch for ch in summary.casefold() if ch.isalnum())
    if summary != summary.strip() or sum(ch.isalnum() for ch in summary) < 2 or words in PLACEHOLDERS:
        raise ValueError("标题需要描述具体改动。")


def check_commit_message(file):
    lines = file.read_text(encoding="utf-8").splitlines()
    check_subject(lines[0] if lines else "")
    for role in ("GIT_AUTHOR_IDENT", "GIT_COMMITTER_IDENT"):
        identity = subprocess.check_output(["git", "var", role], text=True).strip()
        if not re.fullmatch(rf".+ <{re.escape(PROJECT_EMAIL)}> \d+ [+-]\d{{4}}", identity):
            raise ValueError("提交作者和提交者须使用项目维护邮箱。")


def check_pull_request():
    pull = json.loads(Path(os.environ["GITHUB_EVENT_PATH"]).read_bytes())["pull_request"]
    check_subject(pull["title"])
    branch = pull["head"]["ref"]
    if not REVIEWED.fullmatch(branch):
        check_branch(branch)
    base, head = pull["base"]["sha"], pull["head"]["sha"]
    if not all(re.fullmatch(r"[a-f0-9]{40}", revision) for revision in (base, head)):
        raise ValueError("拉取请求缺少完整 Git 修订。")
    subjects = subprocess.check_output(
        ["git", "--no-replace-objects", "log", "-z", "--format=%s", f"{base}..{head}", "--"], text=True,
    ).split("\0")
    for message in subjects[:-1]:
        check_subject(message)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument("--commit-message", type=Path)
    mode.add_argument("--pull-request", action="store_true")
    args = parser.parse_args()
    try:
        if args.commit_message is not None:
            check_commit_message(args.commit_message)
        else:
            check_pull_request()
    except (KeyError, OSError, ValueError, subprocess.CalledProcessError) as error:
        raise SystemExit(str(error)) from None
