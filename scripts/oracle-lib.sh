# oracle-lib.sh — Shared by run-oracle.sh and check-wasm-oracle.sh (sourced,
# with ROOT set to the repository root).

# design_ids: the design ids of oracle/designs/index.json, in order.
design_ids() {
  grep -oE '"id":"[^"]+"' "$ROOT/oracle/designs/index.json" | cut -d'"' -f4
}

# hash_tree <dir>: "<sha256>  ./<path>" for every file except MANIFEST.sha256,
# sorted in the C locale. The MANIFEST.sha256 format.
hash_tree() {
  ( cd "$1" && find . -type f ! -name MANIFEST.sha256 -print0 \
      | LC_ALL=C sort -z | xargs -0 -r sha256sum )
}

# known_diffs <file.tsv> <fields>: the data lines of a known-differences
# table (tab-separated; blank lines and "#" comments skipped). Fails, naming
# the line, if a line does not have exactly <fields> fields: tabs are
# invisible, an editor turning one into spaces must not go unnoticed.
known_diffs() {
  awk -F'\t' -v n="$2" -v file="$1" '
    /^#/ || /^$/ { next }
    NF != n {
      printf "ERROR: %s:%d: %d tab-separated fields, expected %d\n", file, NR, NF, n > "/dev/stderr"
      bad = 1; next
    }
    { print }
    END { exit bad }' "$1"
}
