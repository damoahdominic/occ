#!/bin/bash
# List tickets with completed task counts (tickets that have [x] tasks)
grep -rEc '\[(-| )\]' .tickets/*/prd.md | grep ':0' | sort