#!/bin/bash
# Verify ticket status — counts pending/in-progress tasks per ticket
grep -rEc '\[(-| )\]' .tickets/*/prd.md | sort