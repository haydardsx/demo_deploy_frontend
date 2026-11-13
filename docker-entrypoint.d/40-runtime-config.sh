#!/bin/sh
set -eu
# jq 负责 JSON 转义，环境变量始终作为数据处理。
jq -n \
  --arg server1Url "${DEMO_SERVER1_URL:-https://server1.example.com}" \
  --arg server2Url "${DEMO_SERVER2_URL:-https://server2.example.com}" \
  --arg weightedUrl "${DEMO_WEIGHTED_URL:-https://weighted.example.com}" \
  --arg weight1 "${DEMO_EXPECTED_WEIGHT1:-50}" \
  --arg weight2 "${DEMO_EXPECTED_WEIGHT2:-50}" \
  --arg sampleCount "${DEMO_SAMPLE_COUNT:-1000}" \
  --arg buildRevision "${BUILD_REVISION:-development}" \
  '{server1Url:$server1Url,server2Url:$server2Url,weightedUrl:$weightedUrl,weight1:($weight1|tonumber),weight2:($weight2|tonumber),sampleCount:($sampleCount|tonumber),buildRevision:$buildRevision} |
   if ((.weight1 >= 0 and .weight1 <= 10000 and .weight1 == (.weight1|floor)) and
       (.weight2 >= 0 and .weight2 <= 10000 and .weight2 == (.weight2|floor)) and
       (.weight1 + .weight2 > 0) and (.sampleCount >= 1000 and .sampleCount <= 10000 and .sampleCount == (.sampleCount|floor)))
   then . else error("演示权重或采样数无效") end' > /usr/share/nginx/html/runtime-config.json
