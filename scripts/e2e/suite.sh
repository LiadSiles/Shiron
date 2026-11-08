#!/usr/bin/env bash
# Runs several flows in ONE Maestro session, in order, and records each flow's result. Starting
# Maestro's driver costs 1–2 minutes on CI, so one session per flow made a run take an hour.
#
# usage: suite.sh <results file> <variant> <cleanup flow or -> <entry>… [-- <maestro args>…]
#   entry: must:<flow>[@KEY=value,KEY=value]  or  soft:<flow>[@…]
#   must = its failure fails the run; soft = reported only (the share sheet, which the simulator
#   taps unreliably). The cleanup flow runs after every flow, passed or failed (e.g. closing
#   Android's file picker, which would otherwise cover the next flows).
# Writes shots/ (screenshots, Maestro's debug output) and appends "PASS|FAIL(kind) tag flow"
# lines to the results file. Exit 1 when a must flow failed.
set -uo pipefail
RESULTS=$1 VARIANT=$2 CLEANUP=$3; shift 3
HERE=$(cd "$(dirname "$0")" && pwd)
ENTRIES=()
while [ $# -gt 0 ] && [ "$1" != "--" ]; do ENTRIES+=("$1"); shift; done
[ "${1:-}" = "--" ] && shift
mkdir -p shots
cp "$HERE"/*.yaml shots/
rm -f shots/suite-*.yaml shots/config.yaml

# One small wrapper per entry, so a flow can run twice with other values (FILE=…) and the
# report names each run. The workspace config keeps them in this order and goes on past a failure.
ORDER=() KINDS=() TAGS=() FLOWS=()
n=0
for e in "${ENTRIES[@]}"; do
  n=$((n + 1))
  kind=${e%%:*} rest=${e#*:}
  flow=${rest%%@*} env=""
  [ "$rest" != "$flow" ] && env=${rest#*@}
  tag="$VARIANT"
  name=$(printf 'suite-%02d-%s' "$n" "${flow%.yaml}")
  {
    echo "appId: app.shiron.gan"
    [ "$CLEANUP" != "-" ] && printf 'onFlowComplete:\n  - runFlow: %s\n' "$CLEANUP"
    echo "---"
    echo "- runFlow:"
    echo "    file: $flow"
    echo "    env:"
    echo "      VARIANT: \"$VARIANT\""
    IFS=',' read -ra kv <<< "$env"
    for p in "${kv[@]}"; do
      [ -n "$p" ] || continue
      echo "      ${p%%=*}: \"${p#*=}\""
      [ "${p%%=*}" = VARIANT ] && tag=${p#*=}
    done
  } > "shots/$name.yaml"
  ORDER+=("$name") KINDS+=("$kind") TAGS+=("$tag") FLOWS+=("$flow")
done
{
  echo 'flows:'
  echo '  - "suite-*"'
  echo 'executionOrder:'
  echo '  continueOnFailure: true'
  echo '  flowsOrder:'
  for o in "${ORDER[@]}"; do echo "    - $o"; done
} > shots/config.yaml

echo "== $VARIANT: ${#ORDER[@]} flows in one session"
(cd shots && maestro test --format junit --output "report-$VARIANT.xml" \
  --test-output-dir "maestro-$VARIANT" -e VARIANT="$VARIANT" "$@" . > "last-$VARIANT.log" 2>&1)
grep -E '^\[(Passed|Failed|Skipped)\]|^ *(Passed|Failed)|Element not found|Assertion' "shots/last-$VARIANT.log" | head -60

# Each flow's result from the JUnit report (a flow missing from it never ran: failed).
FAILED=0
for i in "${!ORDER[@]}"; do
  st=$(python3 - "shots/report-$VARIANT.xml" "${ORDER[$i]}" <<'PY'
import sys, xml.etree.ElementTree as ET
try:
    root = ET.parse(sys.argv[1]).getroot()
except Exception:
    print("missing"); sys.exit()
for tc in root.iter("testcase"):
    if tc.get("name") == sys.argv[2] or tc.get("id") == sys.argv[2]:
        bad = tc.find("failure") is not None or tc.find("error") is not None
        print("fail" if bad else "pass"); sys.exit()
print("missing")
PY
)
  if [ "$st" = pass ]; then
    echo "PASS ${TAGS[$i]} ${FLOWS[$i]}" >> "$RESULTS"
  else
    note=""; [ "$st" = missing ] && note=" (did not run)"
    echo "FAIL(${KINDS[$i]}) ${TAGS[$i]} ${FLOWS[$i]}$note" >> "$RESULTS"
    echo "== ${TAGS[$i]}: ${FLOWS[$i]} FAILED"
    [ "${KINDS[$i]}" = must ] && FAILED=1
  fi
done
find shots -path '*maestro-*' -name '*.png' -exec cp {} shots/ \; 2>/dev/null
rm -f shots/*.yaml
exit $FAILED
