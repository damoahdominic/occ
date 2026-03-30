#!/bin/bash
# Find the next ticket with pending tasks, skipping any with ignore header
# Output: .tickets/ticket-XXX-name/prd.md:LINE_NUMBER

tickets=$(ls -1d .tickets/ticket-[0-9]* 2>/dev/null | sort -V)

for ticket in $tickets; do
  prd="$ticket/prd.md"
  [ -f "$prd" ] || continue

  # Skip ignored tickets
  if grep -qE '^(<!--\s*ignore\s*-->|IGNORE:\s*true)' "$prd"; then
    continue
  fi

  # Find first pending [ ]
  pending_line=$(grep -n '\[ \]' "$prd" | head -n1)
  if [ -n "$pending_line" ]; then
    line_num=$(echo "$pending_line" | cut -d: -f1)
    echo "$prd:$line_num"
    exit 0
  fi

  # If no pending, but has in-progress [-], that's next (shouldn't happen if workflow correct)
  inprog_line=$(grep -n '\[-\]' "$prd" | head -n1)
  if [ -n "$inprog_line" ]; then
    line_num=$(echo "$inprog_line" | cut -d: -f1)
    echo "$prd:$line_num"
    exit 0
  fi
done

echo "No pending tickets found"
exit 0