#!/bin/bash
# SKILL_TRACKER_BASE_VERSION=v2026.06
# =============================================================================
# report.sh - Unified reporting tool for page-editor skill tracking.
#
# Usage:
#   bash ./tools/report.sh init [event_name] [json_data]
#   bash ./tools/report.sh complete <status> [json_data]
#   bash ./tools/report.sh event <event_name> [json_data]
#   bash ./tools/report.sh debug
#   bash ./tools/report.sh batch 'evt|json' 'evt|json' ...
# =============================================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SKILL_DIR="$(dirname "$SCRIPT_DIR")"
SCRIPTS_DIR="$SKILL_DIR/scripts"

# =============================================================================
# !! CONFIGURE THESE FOR YOUR SKILL !!
# =============================================================================
APP_KEY="0WEB070FKPM08M1L"
SKILL_NAME="page-editor"
# =============================================================================

DATONG_APP_ID="dt_page_editor"
DATONG_BASE_URL="https://trackmate.woa.com/#/d/repRegistry-quality/debug/panel"

SUBCOMMAND="${1:-}"
shift 2>/dev/null || true

# --- Shared helpers ---
_is_codebuddy() {
    [ -n "${CODEBUDDY_PROJECT_DIR:-}" ] \
        || [ -n "${CODEBUDDY_ENV:-}" ] \
        || [ -n "${CODEBUDDY_VERSION:-}" ]
}

_is_claude_code() {
    [ -n "${CLAUDE_CODE_ENTRYPOINT:-}" ] \
        || [ -n "${CLAUDE_SKILL_DIR:-}" ]
}

_should_shell_report() {
    return 0
}

_track_bg() {
    local event="$1"
    local data="$2"
    if [ ! -f "$SCRIPTS_DIR/track.sh" ]; then
        export _LAST_TRACK_BG_STATUS="dropped_no_script"
        return 1
    fi
    nohup bash "$SCRIPTS_DIR/track.sh" "$APP_KEY" "$SKILL_NAME" "$event" "$data" \
        </dev/null >/dev/null 2>&1 &
    disown 2>/dev/null || true
    export _LAST_TRACK_BG_STATUS="forked"
    return 0
}

# --- Generate stable device fingerprint (A2) ---
generate_a2() {
    local raw_hostname=""
    local raw_username=""
    local device_id=""

    raw_hostname=$(hostname 2>/dev/null || echo "unknown-host")
    raw_username=$(whoami 2>/dev/null || echo "unknown-user")

    if [ -z "$device_id" ] && [ -f /etc/machine-id ]; then
        device_id=$(cat /etc/machine-id 2>/dev/null | tr -d '[:space:]')
    fi
    if [ -z "$device_id" ] && [ -f /var/lib/dbus/machine-id ]; then
        device_id=$(cat /var/lib/dbus/machine-id 2>/dev/null | tr -d '[:space:]')
    fi
    if [ -z "$device_id" ] && command -v reg.exe &>/dev/null; then
        device_id=$(reg.exe query "HKLM\\SOFTWARE\\Microsoft\\Cryptography" /v MachineGuid 2>/dev/null \
            | grep -i "MachineGuid" | awk '{print $NF}' | tr -d '[:space:]')
    fi
    if [ -z "$device_id" ] && command -v ioreg &>/dev/null; then
        device_id=$(ioreg -rd1 -c IOPlatformExpertDevice 2>/dev/null \
            | grep IOPlatformUUID | sed 's/.*= "//;s/"//' | tr -d '[:space:]')
    fi
    if [ -z "$device_id" ]; then
        local raw_mac=""
        if command -v ifconfig &>/dev/null; then
            raw_mac=$(ifconfig 2>/dev/null | grep -oE '([0-9a-fA-F]{2}:){5}[0-9a-fA-F]{2}' | head -1)
        elif command -v ip &>/dev/null; then
            raw_mac=$(ip link 2>/dev/null | grep -oE '([0-9a-fA-F]{2}:){5}[0-9a-fA-F]{2}' | head -1)
        fi
        [ -n "$raw_mac" ] && device_id=$(echo "$raw_mac" | tr '[:upper:]' '[:lower:]')
    fi
    if [ -z "$device_id" ]; then
        local did_dir="$HOME/.skill-tracker"
        local did_file="$did_dir/device-id"
        if [ -f "$did_file" ]; then
            device_id=$(cat "$did_file" 2>/dev/null | tr -d '[:space:]')
        fi
        if [ -z "$device_id" ]; then
            local new_did=""
            if command -v uuidgen &>/dev/null; then
                new_did=$(uuidgen 2>/dev/null | tr '[:upper:]' '[:lower:]')
            fi
            if [ -n "$new_did" ]; then
                mkdir -p "$did_dir" 2>/dev/null && echo "$new_did" > "$did_file" 2>/dev/null
                device_id="$new_did"
            fi
        fi
    fi
    [ -z "$device_id" ] && device_id="no-device-id"

    local fingerprint="${raw_hostname}:${raw_username}:${device_id}"
    if command -v md5sum &>/dev/null; then
        echo -n "$fingerprint" | md5sum | cut -c1-32
    elif command -v md5 &>/dev/null; then
        echo -n "$fingerprint" | md5 -q
    elif command -v openssl &>/dev/null; then
        echo -n "$fingerprint" | openssl md5 | sed 's/.*= //'
    else
        local ck
        ck=$(echo -n "$fingerprint" | cksum | awk '{print $1}')
        printf '%032s' "$ck" | tr ' ' '0'
    fi
}

generate_a2_v2() {
    local h u sid fp
    h=$(hostname 2>/dev/null || echo "unknown-host")
    u=$(whoami 2>/dev/null || echo "unknown-user")
    sid=""
    if [ -z "$sid" ] && [ -f /etc/machine-id ]; then
        sid=$(cat /etc/machine-id 2>/dev/null | tr -d '[:space:]')
    fi
    if [ -z "$sid" ] && [ -f /var/lib/dbus/machine-id ]; then
        sid=$(cat /var/lib/dbus/machine-id 2>/dev/null | tr -d '[:space:]')
    fi
    if [ -z "$sid" ] && command -v reg.exe &>/dev/null; then
        sid=$(reg.exe query "HKLM\\SOFTWARE\\Microsoft\\Cryptography" /v MachineGuid 2>/dev/null \
            | grep -i "MachineGuid" | awk '{print $NF}' | tr -d '[:space:]')
    fi
    if [ -z "$sid" ] && command -v ioreg &>/dev/null; then
        sid=$(ioreg -rd1 -c IOPlatformExpertDevice 2>/dev/null \
            | grep IOPlatformUUID | sed 's/.*= "//;s/"//' | tr -d '[:space:]')
    fi
    if [ -z "$sid" ]; then
        local did_dir="$HOME/.skill-tracker"
        local did_file="$did_dir/device-id"
        if [ -f "$did_file" ]; then
            sid=$(cat "$did_file" 2>/dev/null | tr -d '[:space:]')
        fi
        if [ -z "$sid" ]; then
            local new_did=""
            if command -v uuidgen &>/dev/null; then
                new_did=$(uuidgen 2>/dev/null | tr '[:upper:]' '[:lower:]')
            fi
            if [ -n "$new_did" ]; then
                mkdir -p "$did_dir" 2>/dev/null && echo "$new_did" > "$did_file" 2>/dev/null
                sid="$new_did"
            fi
        fi
    fi
    [ -z "$sid" ] && sid="no-device-id"

    fp="${h}:${u}:${sid}"
    if command -v md5sum &>/dev/null; then
        echo -n "$fp" | md5sum | cut -c1-32
    elif command -v md5 &>/dev/null; then
        echo -n "$fp" | md5 -q
    elif command -v openssl &>/dev/null; then
        echo -n "$fp" | openssl md5 | sed 's/.*= //'
    else
        local ck
        ck=$(echo -n "$fp" | cksum | awk '{print $1}')
        printf '%032s' "$ck" | tr ' ' '0'
    fi
}

# =============================================================================
# Subcommand: init
# =============================================================================
cmd_init() {
    local event_name="${1:-skill_invoked}"
    local custom_data="${2:-}"
    if _should_shell_report; then
        _track_bg "$event_name" "$custom_data"
    fi
    echo "=== Task Context ==="
    echo "Skill: $SKILL_NAME"
    echo "Time: $(date '+%Y-%m-%d %H:%M:%S')"
    echo "OS: $(uname -s) $(uname -m)"
    echo "User: $(whoami 2>/dev/null || echo 'unknown')"
    echo "Working Directory: $(pwd)"
    echo ""
    echo "=== Workspace Files ==="
    if command -v find &>/dev/null; then
        find . -maxdepth 2 -type f \
            ! -path './.git/*' \
            ! -path './node_modules/*' \
            ! -path './__pycache__/*' \
            ! -path './.venv/*' \
            2>/dev/null | head -20
    fi
    echo ""
    echo "=== Project Info ==="
    if [ -f "package.json" ]; then
        echo "Type: Node.js"
        echo "Name: $(grep -o '"name"[[:space:]]*:[[:space:]]*"[^"]*"' package.json 2>/dev/null | head -1)"
    elif [ -f "requirements.txt" ] || [ -f "setup.py" ] || [ -f "pyproject.toml" ]; then
        echo "Type: Python"
    elif [ -f "go.mod" ]; then
        echo "Type: Go"
    else
        echo "Type: Unknown"
    fi
    echo ""
    local a2 a2v2
    a2=$(generate_a2)
    a2v2=$(generate_a2_v2)
    echo "=== Debug Info ==="
    echo "A2:    $a2"
    echo "A2_v2: $a2v2"
    echo "Debug Link: ${DATONG_BASE_URL}?debugId=${a2}&appId=${DATONG_APP_ID}&showHistory=0&autoRegistDeviceId=1"
    echo ""
    echo "=== Ready ==="
    echo "TASK_READY"
}

# =============================================================================
# Subcommand: complete
# =============================================================================
cmd_complete() {
    local status="${1:-success}"
    local custom_data="${2:-}"
    local event_data="{\"status\":\"$status\""
    if [ -n "$custom_data" ]; then
        local stripped
        stripped=$(echo "$custom_data" | sed 's/^[[:space:]]*{//;s/}[[:space:]]*$//')
        if [ -n "$stripped" ]; then
            event_data="$event_data,$stripped"
        fi
    fi
    event_data="$event_data}"
    if _should_shell_report; then
        _track_bg "task_completed" "$event_data"
    fi
    echo "=== Task Complete ==="
    echo "Status: $status"
    echo "Time: $(date '+%Y-%m-%d %H:%M:%S')"
    echo "TASK_DONE"
}

# =============================================================================
# Subcommand: event
# =============================================================================
cmd_event() {
    local event_name="${1:-custom_event}"
    local custom_data="${2:-}"
    local status="ok"
    if _should_shell_report; then
        if _track_bg "$event_name" "$custom_data"; then
            status="shell_sent"
        else
            status="dropped"
            echo "[skill-tracker] WARNING: event '$event_name' DROPPED (${_LAST_TRACK_BG_STATUS:-unknown})." >&2
        fi
    fi
    echo "Event '$event_name' recorded ($status)."
    echo "EVENT_OK"
}

# =============================================================================
# Subcommand: batch
# =============================================================================
cmd_batch() {
    local count=0
    for item in "$@"; do
        local event_name=""
        local custom_data=""
        if [[ "$item" == *"|"* ]]; then
            event_name="${item%%|*}"
            custom_data="${item#*|}"
        else
            event_name="$item"
        fi
        if [ -z "$event_name" ]; then
            continue
        fi
        if _should_shell_report; then
            _track_bg "$event_name" "$custom_data" || true
        fi
        count=$((count + 1))
        echo "  [$count] '$event_name' recorded."
    done
    echo "BATCH_OK ($count events)"
}

# =============================================================================
# Subcommand: debug
# =============================================================================
cmd_debug() {
    local a2 a2v2
    a2=$(generate_a2)
    a2v2=$(generate_a2_v2)
    local debug_url="${DATONG_BASE_URL}?debugId=${a2}&appId=${DATONG_APP_ID}&showHistory=0&autoRegistDeviceId=1"
    echo "=== Skill Tracker Debug ==="
    echo "Skill:    $SKILL_NAME"
    echo "A2:       $a2"
    echo "A2_v2:    $a2v2"
    echo ""
    echo "Click the link below to start debugging on Datong platform:"
    echo ""
    echo "  $debug_url"
    echo ""
    echo "DEBUG_READY"
}

# =============================================================================
# Dispatcher
# =============================================================================
case "$SUBCOMMAND" in
    init)     cmd_init "$@" ;;
    complete) cmd_complete "$@" ;;
    event)    cmd_event "$@" ;;
    batch)    cmd_batch "$@" ;;
    debug)    cmd_debug "$@" ;;
    *)
        echo "Usage: bash report.sh <init|complete|event|debug|batch> [args...]" >&2
        exit 1
        ;;
esac
