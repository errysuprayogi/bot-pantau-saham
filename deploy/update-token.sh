#!/usr/bin/env bash
# update-token.sh — perbarui token Stockbit di VM GCP dari file HAR ekspor DevTools.
#
# Alur: export HAR dari browser (DevTools > Network > Export HAR) saat sudah login
# Stockbit, lalu jalankan script ini. Token dibaca dari HAR, diimpor ke store VM
# (user stockbitbot), HAR dihapus, service di-restart, sesi diverifikasi.
#
# Wajib: gcloud (WSL), SSH ke VM via IAP, sudo non-interaktif di VM.
#
# PENTING: HAR harus SELALU fresh. HAR berisi refresh token yang RAHASIA dan
# sekali pakai-family — begitu bot atau stockbit-auth MEMAKAI token itu (refresh),
# HAR yang sama TIDAK BOLEH di-import lagi (akan tertolak 401). Sebelum update
# token: export ULANG HAR dari browser (DevTools > Network > Export HAR).
#
# Pemakaian:
#   bash deploy/update-token.sh                          # pakai default HAR di Downloads
#   bash deploy/update-token.sh /path/ke/file.har        # HAR lain
#   LOCAL_HAR=foo.har GCP_VM=vm GCP_ZONE=z bash deploy/update-token.sh
#
# Opsi env (default):
#   LOCAL_HAR  = /mnt/c/Users/eriks/Downloads/stockbit.com.har
#   GCP_VM     = instance-stockbitbot
#   GCP_ZONE   = us-central1-a
#   SSH_USER   = eriks            (akun SSH di VM; butuh sudo)
#   SVC_USER   = stockbitbot      (user service systemd & pemilik store)
#   STORE_DIR  = /var/lib/stockbitbot/.stockbit
#   SERVICE    = stockbitbot      (nama unit systemd)
#   VERIFY     = (kosong)         isi 1 untuk cek token dengan live refresh (ROTASI token)

set -euo pipefail

LOCAL_HAR="${LOCAL_HAR:-/mnt/c/Users/eriks/Downloads/stockbit.com.har}"
GCP_VM="${GCP_VM:-instance-stockbitbot}"
GCP_ZONE="${GCP_ZONE:-us-central1-a}"
SSH_USER="${SSH_USER:-eriks}"
SVC_USER="${SVC_USER:-stockbitbot}"
STORE_DIR="${STORE_DIR:-/var/lib/stockbitbot/.stockbit}"
SERVICE="${SERVICE:-stockbitbot}"

GCP="gcloud"   # cek PATH; kalau tidak ada, coba path gcloud SDK manual di bawah

if ! command -v gcloud >/dev/null 2>&1; then
  for cand in "$HOME/tools/google-cloud-sdk/bin/gcloud" /usr/local/bin/gcloud; do
    [ -x "$cand" ] && { GCP="$cand"; break; }
  done
fi
if ! command -v "$GCP" >/dev/null 2>&1; then
  echo "[FAIL] gcloud tidak ditemukan. Pasang Google Cloud SDK atau set GCP_PATH." >&2
  exit 1
fi

VERIFY="${VERIFY:-}"
REMOTE_HAR_TMP="/tmp/stockbit.com.har"            # lokasi sementara di VM (user $SSH_USER)
REMOTE_HAR_FINAL="/var/lib/stockbitbot/stockbit.com.har"  # lokasi yang dibaca user $SVC_USER

SSH=("$GCP" compute ssh "$GCP_VM" --zone "$GCP_ZONE" --tunnel-through-iap --command)
[ "$VERIFY" = "1" ] && VERIFY_FLAG="--verify" || VERIFY_FLAG="--offline"

echo "==> [1/6] Cek HAR lokal: $LOCAL_HAR"
[ -f "$LOCAL_HAR" ] || { echo "[FAIL] HAR tidak ditemukan: $LOCAL_HAR" >&2; exit 1; }

echo "==> [2/6] Cek koneksi VM $GCP_VM ($GCP_ZONE) via IAP"
"${SSH[@]}" "true"

echo "==> [3/6] Upload HAR ke VM (scp via IAP)"
"$GCP" compute scp --zone "$GCP_ZONE" --tunnel-through-iap "$LOCAL_HAR" "$SSH_USER@$GCP_VM:$REMOTE_HAR_TMP" >/dev/null 2>&1

echo "==> [4/6] Impor token dari HAR sebagai user $SVC_USER"
"${SSH[@]}" "set -euo pipefail
  if ! sudo -n true 2>/dev/null; then echo '[FAIL] sudo butuh password — periksa hak sudo user $SSH_USER' >&2; exit 1; fi
  sudo mkdir -p $STORE_DIR $(dirname $REMOTE_HAR_FINAL)
  sudo cp -f $REMOTE_HAR_TMP $REMOTE_HAR_FINAL
  sudo chown $SVC_USER:$SVC_USER $REMOTE_HAR_FINAL
  sudo -u $SVC_USER env HOME=/home/$SVC_USER STOCKBIT_STORE_DIR=$STORE_DIR \
    stockbit-auth import-har $REMOTE_HAR_FINAL \
  || { echo '[FAIL] import-har gagal' >&2; exit 1; }
  sudo rm -f $REMOTE_HAR_FINAL $REMOTE_HAR_TMP
  echo 'HAR dihapus dari VM.'"

echo "==> [5/6] Restart service systemd: $SERVICE"
"${SSH[@]}" "sudo systemctl restart $SERVICE && sleep 5 && systemctl is-active $SERVICE"

echo "==> [6/6] Verifikasi sesi di store $STORE_DIR"
"${SSH[@]}" "sudo -u $SVC_USER env HOME=/home/$SVC_USER STOCKBIT_STORE_DIR=$STORE_DIR stockbit-auth status $VERIFY_FLAG" 2>&1 | grep -iE "market data|refresh|rejected|fail" | head -6 || true

echo "==> Selesai. Cek log: sudo journalctl -u $SERVICE --since '1 min ago'"