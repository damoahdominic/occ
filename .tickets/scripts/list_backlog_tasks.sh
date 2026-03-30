#!/bin/bash
# List tickets and number of backlog (pending+in-progress) tasks
grep -rEc '\[(-| )\]' .tickets/*/prd.md | sort