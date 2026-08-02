#!/usr/bin/env bash

#------------------------------------------------------------------------------
# Construiește site-ul pe un Cloudflare Worker.
#
# Rulează prin `build` din wrangler.jsonc. Instalează singur versiunea exactă de
# Hugo, pentru că imaginea de build a Cloudflare vine cu una veche.
#
# Merge și local, pentru a reproduce identic build-ul de producție:
#   ./build.sh
#------------------------------------------------------------------------------

set -euo pipefail

# Versiunile uneltelor. Ține HUGO_VERSION la fel cu cea de pe mașina ta:
#   hugo version
HUGO_VERSION=0.164.0
GO_VERSION=1.26.4
NODE_VERSION=24.18.0

# Fusul orar contează: paginile „Azi mănânci" și rotația sesiunilor de gătit se
# calculează la build din data curentă.
TZ=Europe/Dublin

HUGO_CACHEDIR="${PWD}/.cache/hugo"

cleanup() {
  if [[ -n "${build_temp_dir:-}" && -d "${build_temp_dir}" ]]; then
    rm -rf "${build_temp_dir}"
  fi
}
trap cleanup EXIT SIGINT SIGTERM

main() {
  export TZ
  export HUGO_CACHEDIR

  build_temp_dir=$(mktemp -d)
  mkdir -p "${HOME}/.local"

  # Dart Sass nu se instalează intenționat: proiectul folosește CSS simplu, fără
  # SCSS, tocmai ca build-ul să nu depindă de nimic. Dacă adaugi vreodată .scss,
  # instalează-l aici — altfel `css.Sass` va eșua cu „You need to install Dart Sass".

  if [[ -f "go.mod" ]]; then
    echo "Instalez Go ${GO_VERSION}..."
    curl -sfL --output-dir "${build_temp_dir}" -O "https://go.dev/dl/go${GO_VERSION}.linux-amd64.tar.gz"
    tar -C "${HOME}/.local" -xf "${build_temp_dir}/go${GO_VERSION}.linux-amd64.tar.gz"
    export PATH="${HOME}/.local/go/bin:${PATH}"
  fi

  echo "Instalez Hugo ${HUGO_VERSION}..."
  curl -sfL --output-dir "${build_temp_dir}" -O \
    "https://github.com/gohugoio/hugo/releases/download/v${HUGO_VERSION}/hugo_extended_${HUGO_VERSION}_linux-amd64.tar.gz"
  mkdir -p "${HOME}/.local/hugo"
  tar -C "${HOME}/.local/hugo" -xf "${build_temp_dir}/hugo_extended_${HUGO_VERSION}_linux-amd64.tar.gz"
  export PATH="${HOME}/.local/hugo:${PATH}"

  if [[ -f "package-lock.json" ]]; then
    echo "Instalez Node.js ${NODE_VERSION}..."
    curl -sfL --output-dir "${build_temp_dir}" -O "https://nodejs.org/dist/v${NODE_VERSION}/node-v${NODE_VERSION}-linux-x64.tar.gz"
    tar -C "${HOME}/.local" -xf "${build_temp_dir}/node-v${NODE_VERSION}-linux-x64.tar.gz"
    export PATH="${HOME}/.local/node-v${NODE_VERSION}-linux-x64/bin:${PATH}"
  fi

  echo "Versiuni:"
  hugo version
  command -v node &> /dev/null && echo "Node.js: $(node --version)" || true

  git config --global core.quotepath false

  if [[ $(git rev-parse --is-shallow-repository 2>/dev/null || echo false) == true ]]; then
    echo "Aduc tot istoricul Git..."
    git fetch --unshallow
  fi

  if [[ -f package-lock.json ]]; then
    echo "Instalez dependențele Node.js..."
    npm ci
  fi

  echo "Construiesc site-ul..."
  hugo build --gc --minify
}

main "$@"
