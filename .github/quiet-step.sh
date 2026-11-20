#!/usr/bin/env bash
# 检查名称由工作流显示，命令输出可能包含测试数据。
if ! bash --noprofile --norc -eo pipefail "$1" >/dev/null 2>&1; then
  echo "::error::Check failed."
  exit 1
fi
