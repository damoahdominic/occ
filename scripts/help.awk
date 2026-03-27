#!/usr/bin/awk -f
BEGIN {
    print "Usage:"
    print "  make <target>"
    print ""
    print "Targets:"
}

/^##/ {
    # Extract the target name and description
    gsub(/^## /, "")
    gsub(/: /, " ")
    printf "  %-20s %s\n", $1, substr($0, length($1) + 2)
}

END {
    print ""
}
