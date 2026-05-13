#!/usr/bin/env bash
set -Eeuo pipefail

usage() {
  cat <<'USAGE'
Usage: scripts/create-test-virtual-cams.sh <youtube-url>

Creates four Linux v4l2loopback virtual cameras and four PulseAudio/PipeWire
virtual microphones from a YouTube video. The script samples 5 seconds, skips
5 seconds, and repeats four times:

  cam/mic 1: audio/video 00-05s, then black/silence 15s
  cam/mic 2: black/silence 5s, audio/video 10-15s, then black/silence 10s
  cam/mic 3: black/silence 10s, audio/video 20-25s, then black/silence 5s
  cam/mic 4: black/silence 15s, audio/video 30-35s

Each camera/microphone pair loops its 20-second cycle until this script is stopped.

Requirements: ffmpeg, ffprobe, yt-dlp, v4l2loopback, pactl, and a running
PulseAudio or PipeWire Pulse server.
On Debian/Ubuntu: sudo apt install ffmpeg yt-dlp v4l2loopback-dkms v4l2loopback-utils pulseaudio-utils

Environment overrides:
  VIDEO_NRS=42,43,44,45                      Video numbers to create/use
  VIDEO_DEVICES=/dev/video42,...             Explicit devices to use instead of VIDEO_NRS
  WIDTH=1280 HEIGHT=720 FPS=30               Output video format
  WORK_DIR=/tmp/videocast-cams               Keep generated files in this directory
  KEEP_WORKDIR=1                             Do not delete generated files on exit
  YTDLP_BIN=yt-dlp                           yt-dlp executable
  YTDLP_FORMAT='bv*[height<=1080]+ba/b[height<=1080]/best'
                                               yt-dlp format selector
USAGE
}

log() {
  printf '\033[1;34m==>\033[0m %s\n' "$*"
}

fail() {
  printf 'Error: %s\n' "$*" >&2
  exit 1
}

require_cmd() {
  command -v "$1" >/dev/null 2>&1 || fail "Required command '$1' was not found."
}

run_root() {
  if [[ ${EUID} -eq 0 ]]; then
    "$@"
  else
    require_cmd sudo
    sudo "$@"
  fi
}

pactl_has_sink() {
  pactl list short sinks | awk '{print $2}' | grep -Fxq "$1"
}

pactl_has_source() {
  pactl list short sources | awk '{print $2}' | grep -Fxq "$1"
}

url=${1:-}
if [[ -z "${url}" || "${url}" == "-h" || "${url}" == "--help" ]]; then
  usage
  [[ -n "${url}" ]] && exit 0 || exit 1
fi

if [[ $(uname -s) != "Linux" ]]; then
  fail "v4l2loopback virtual cameras are only supported by this script on Linux."
fi

YTDLP_BIN=${YTDLP_BIN:-yt-dlp}
YTDLP_FORMAT=${YTDLP_FORMAT:-bv*[height<=1080]+ba/b[height<=1080]/best}
WIDTH=${WIDTH:-1280}
HEIGHT=${HEIGHT:-720}
FPS=${FPS:-30}
VIDEO_NRS=${VIDEO_NRS:-42,43,44,45}
KEEP_WORKDIR=${KEEP_WORKDIR:-0}

require_cmd ffmpeg
require_cmd ffprobe
require_cmd pactl
require_cmd "${YTDLP_BIN}"

if ! pactl info >/dev/null 2>&1; then
  fail "PulseAudio/PipeWire Pulse is not available. Start your audio server before running this script."
fi

if ! ffmpeg -hide_banner -h muxer=pulse >/dev/null 2>&1; then
  fail "This ffmpeg build does not include PulseAudio output support."
fi

if [[ -n ${VIDEO_DEVICES:-} ]]; then
  IFS=',' read -r -a devices <<<"${VIDEO_DEVICES}"
else
  IFS=',' read -r -a video_numbers <<<"${VIDEO_NRS}"
  ((${#video_numbers[@]} == 4)) || fail "VIDEO_NRS must contain exactly four comma-separated numbers."
  devices=()
  for nr in "${video_numbers[@]}"; do
    [[ ${nr} =~ ^[0-9]+$ ]] || fail "Invalid video number '${nr}' in VIDEO_NRS."
    devices+=("/dev/video${nr}")
  done
fi

((${#devices[@]} == 4)) || fail "Exactly four virtual camera devices are required."

user_work_dir=0
if [[ -n ${WORK_DIR:-} ]]; then
  mkdir -p "${WORK_DIR}"
  user_work_dir=1
else
  WORK_DIR=$(mktemp -d -t videocast-cams.XXXXXX)
fi

pids=()
audio_module_ids=()
mic_sink_names=()
mic_source_names=()

cleanup() {
  if ((${#pids[@]})); then
    log "Stopping virtual camera/microphone feeds"
    for pid in "${pids[@]}"; do
      kill "${pid}" >/dev/null 2>&1 || true
    done
    wait "${pids[@]}" >/dev/null 2>&1 || true
  fi

  if ((${#audio_module_ids[@]})); then
    log "Removing virtual microphones"
    local idx
    for ((idx = ${#audio_module_ids[@]} - 1; idx >= 0; idx--)); do
      pactl unload-module "${audio_module_ids[${idx}]}" >/dev/null 2>&1 || true
    done
  fi

  if [[ ${user_work_dir} -eq 0 && ${KEEP_WORKDIR} != "1" ]]; then
    rm -rf "${WORK_DIR}"
  else
    log "Generated files left in ${WORK_DIR}"
  fi
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

rm -f "${WORK_DIR}"/source.* "${WORK_DIR}"/cam-*-cycle.mp4

ensure_loopback_devices() {
  local missing=0
  for dev in "${devices[@]}"; do
    [[ -e ${dev} ]] || missing=1
  done

  if [[ ${missing} -eq 0 ]]; then
    return
  fi

  if [[ -n ${VIDEO_DEVICES:-} ]]; then
    fail "One or more VIDEO_DEVICES do not exist: ${devices[*]}"
  fi

  local labels="Videocast Test Cam 1,Videocast Test Cam 2,Videocast Test Cam 3,Videocast Test Cam 4"

  if ! grep -q '^v4l2loopback ' /proc/modules 2>/dev/null; then
    log "Creating v4l2loopback devices: ${devices[*]}"
    run_root modprobe v4l2loopback \
      devices=4 \
      video_nr="${VIDEO_NRS}" \
      card_label="${labels}" \
      exclusive_caps=1,1,1,1
  elif command -v v4l2loopback-ctl >/dev/null 2>&1; then
    log "Adding missing v4l2loopback devices: ${devices[*]}"
    local idx dev label
    for idx in 0 1 2 3; do
      dev=${devices[${idx}]}
      [[ -e ${dev} ]] && continue
      label="Videocast Test Cam $((idx + 1))"
      if ! run_root v4l2loopback-ctl add -n "${label}" -x 1 "${dev}"; then
        printf 'Warning: v4l2loopback-ctl did not accept exclusive caps for %s; browser apps may not list it.\n' "${dev}" >&2
        run_root v4l2loopback-ctl add -n "${label}" "${dev}"
      fi
    done
  else
    fail "v4l2loopback is already loaded but ${devices[*]} are not all present. Unload it with 'sudo modprobe -r v4l2loopback', or set VIDEO_DEVICES to four existing loopback devices."
  fi

  sleep 1
  for dev in "${devices[@]}"; do
    [[ -e ${dev} ]] || fail "Expected ${dev} to exist after creating v4l2loopback devices."
  done
}

ensure_virtual_mics() {
  log "Creating virtual microphones"

  local idx mic sink source sink_label source_label module_id
  for idx in 0 1 2 3; do
    mic=$((idx + 1))
    sink="videocast_test_mic_${mic}_sink"
    source="videocast_test_mic_${mic}"
    sink_label="Videocast_Test_Mic_${mic}_Sink"
    source_label="Videocast_Test_Mic_${mic}"

    if ! pactl_has_sink "${sink}"; then
      module_id=$(pactl load-module module-null-sink \
        sink_name="${sink}" \
        sink_properties="device.description=${sink_label}" \
        rate=48000 \
        channels=2)
      audio_module_ids+=("${module_id}")
    fi

    if ! pactl_has_source "${source}"; then
      if module_id=$(pactl load-module module-remap-source \
        master="${sink}.monitor" \
        source_name="${source}" \
        source_properties="device.description=${source_label}" \
        remix=no); then
        audio_module_ids+=("${module_id}")
      else
        printf 'Warning: could not create remapped source %s; use %s.monitor as the microphone.\n' "${source}" "${sink}" >&2
        source="${sink}.monitor"
      fi
    fi

    pactl_has_sink "${sink}" || fail "Expected PulseAudio sink ${sink} to exist."
    pactl_has_source "${source}" || fail "Expected PulseAudio source ${source} to exist."

    mic_sink_names+=("${sink}")
    mic_source_names+=("${source}")
  done
}

ensure_loopback_devices
ensure_virtual_mics

log "Downloading the first 40 seconds from YouTube"
"${YTDLP_BIN}" \
  --no-playlist \
  --download-sections '*00:00:00-00:00:40' \
  --merge-output-format mkv \
  -f "${YTDLP_FORMAT}" \
  -o "${WORK_DIR}/source.%(ext)s" \
  "${url}"

source_file=$(find "${WORK_DIR}" -maxdepth 1 -type f -name 'source.*' | sort | head -n 1)
[[ -n ${source_file} ]] || fail "yt-dlp did not produce a source file in ${WORK_DIR}."

if ! ffprobe -v error -select_streams a:0 -show_entries stream=index -of csv=p=0 "${source_file}" | grep -q .; then
  fail "Downloaded source has no audio stream; choose a YouTube video with audio."
fi

log "Preparing 20-second loop files"
normalize_filter="scale=${WIDTH}:${HEIGHT}:force_original_aspect_ratio=decrease,pad=${WIDTH}:${HEIGHT}:(ow-iw)/2:(oh-ih)/2,fps=${FPS},setsar=1,format=yuv420p"
cycle_files=()
for idx in 0 1 2 3; do
  cam=$((idx + 1))
  source_start=$((idx * 10))
  black_before=$((idx * 5))
  black_after=$((15 - black_before))
  audio_delay_ms=$((black_before * 1000))
  output="${WORK_DIR}/cam-${cam}-cycle.mp4"
  cycle_files+=("${output}")

  log "cam/mic ${cam}: source ${source_start}-$((source_start + 5))s, starts at ${black_before}s in the 20s cycle"
  ffmpeg -y -hide_banner -loglevel warning \
    -ss "${source_start}" \
    -t 5 \
    -i "${source_file}" \
    -filter_complex "[0:v]${normalize_filter},tpad=start_duration=${black_before}:start_mode=add:color=black:stop_duration=${black_after}:stop_mode=add:color=black,trim=duration=20,setpts=PTS-STARTPTS[v];[0:a]aformat=sample_fmts=fltp:sample_rates=48000:channel_layouts=stereo,atrim=duration=5,asetpts=PTS-STARTPTS,adelay=${audio_delay_ms}:all=1,apad,atrim=duration=20[a]" \
    -map '[v]' \
    -map '[a]' \
    -c:v libx264 \
    -preset veryfast \
    -crf 23 \
    -pix_fmt yuv420p \
    -c:a aac \
    -b:a 128k \
    -movflags +faststart \
    "${output}"
done

log "Starting virtual camera/microphone feeds"
for idx in 0 1 2 3; do
  cam=$((idx + 1))
  ffmpeg -hide_banner -nostdin -loglevel warning \
    -re \
    -stream_loop -1 \
    -i "${cycle_files[${idx}]}" \
    -map 0:v:0 \
    -an \
    -vf 'format=yuv420p' \
    -f v4l2 \
    "${devices[${idx}]}" \
    -map 0:a:0 \
    -vn \
    -ac 2 \
    -ar 48000 \
    -c:a pcm_s16le \
    -f pulse \
    -device "${mic_sink_names[${idx}]}" \
    "Videocast Test Mic ${cam} feed" &
  pids+=("$!")
  printf '  cam %d -> %s | mic %d -> %s\n' "${cam}" "${devices[${idx}]}" "${cam}" "${mic_source_names[${idx}]}"
done

cat <<EOF

Virtual cameras and microphones are running. Open the app and choose matching pairs:
  1. camera ${devices[0]} + microphone ${mic_source_names[0]} - plays at 00-05s of each 20s cycle
  2. camera ${devices[1]} + microphone ${mic_source_names[1]} - plays at 05-10s of each 20s cycle
  3. camera ${devices[2]} + microphone ${mic_source_names[2]} - plays at 10-15s of each 20s cycle
  4. camera ${devices[3]} + microphone ${mic_source_names[3]} - plays at 15-20s of each 20s cycle

Press Ctrl-C to stop the feeds.
EOF

set +e
wait -n "${pids[@]}"
status=$?
set -e
fail "A camera/microphone feed stopped unexpectedly (exit ${status})."
