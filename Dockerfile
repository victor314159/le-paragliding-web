# syntax=docker/dockerfile:1
# LEpara-web — everything runs in Docker (nothing on the host).
#
# Release build (what CI deploys):
#   docker build --output dist .
#   wasm -> oracle-check -> site -> dist/ (the static site). Any failing step
#   (WASM build, WASM vs native oracle, lint, Angular build) stops the build.
#
# npm package (what CI publishes on engine-v* tags):
#   docker build --target engine-pkg --output pkg .
#   wasm -> oracle-check -> engine-pack -> pkg/<name>-<version>.tgz
#
# Development images (docker-compose.yml), the repository bind-mounted at /work:
#   flang  : Fortran -> WASM toolchain
#   oracle : native gfortran oracle + WASM-in-Node check
#   web    : Angular dev + Playwright/Chromium

# --- flang: flang 21.1.8 + emscripten 5.0.7 + libFortranRuntime -------------
# r-wasm/flang-wasm, pinned by digest; amd64 image, emulated on arm64.
FROM --platform=linux/amd64 ghcr.io/r-wasm/flang-wasm@sha256:370eeca4ab025cb85716b53099259bd3541202aa3cec3b6eddaaac3b4e5fc923 AS flang
# Java: emcc --closure 1. The native closure compiler segfaults under amd64
# emulation (Apple Silicon); emcc then falls back to the Java one.
RUN apt-get update && DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
      default-jre-headless \
    && rm -rf /var/lib/apt/lists/*
# The image's libFortranRuntime.a is built at -O0: rebuild it with -O3.
COPY scripts/build-flang-runtime.sh /tmp/
RUN /tmp/build-flang-runtime.sh /opt/flang/wasm/lib/libFortranRuntime.a \
    && rm /tmp/build-flang-runtime.sh
WORKDIR /work

# --- base: Node + certificates ----------------------------------------------
# Debian 13 "trixie" (glibc): required by Playwright's --with-deps install.
FROM node:24.20.0-trixie-slim AS base

ARG DEBIAN_FRONTEND=noninteractive

RUN apt-get update && apt-get install -y --no-install-recommends \
      ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /work
CMD ["bash"]

# --- oracle: gfortran 14.2.0 + scripts/make-patched.sh tools ----------------
# Produces oracle/reference/ (run-oracle.ts). Must not change when the
# front-end does.
FROM base AS oracle

RUN apt-get update && apt-get install -y --no-install-recommends \
      gfortran \
      patch \
      unzip \
    && rm -rf /var/lib/apt/lists/*

# --- web: Angular + Playwright ----------------------------------------------
# Angular is a devDependency of the project (package.json, npm ci), not a
# global install. Playwright is installed globally only to fetch Chromium and
# its system dependencies into PLAYWRIGHT_BROWSERS_PATH; the project's
# @playwright/test must use the same version.
FROM base AS web

ARG PLAYWRIGHT_VERSION=1.64.1
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright

RUN apt-get update && apt-get install -y --no-install-recommends \
      git \
    && rm -rf /var/lib/apt/lists/*

RUN npm install -g "playwright@${PLAYWRIGHT_VERSION}" \
    && playwright install --with-deps chromium \
    && npm cache clean --force \
    && rm -rf /var/lib/apt/lists/*

# --- release: wasm -> oracle-check -> site -> dist ---------------------------
FROM flang AS wasm
COPY fortran/engine fortran/engine
COPY scripts/make-patched.sh scripts/build-flang-wasm.sh scripts/closure-externs.js scripts/
RUN scripts/build-flang-wasm.sh

# The project's dependencies: tsc for the engine package, then the site.
FROM base AS deps
COPY package.json package-lock.json .npmrc ./
RUN npm ci

# Every WASM output byte-identical to the committed native references, run
# through the npm package (build/engine/).
FROM deps AS oracle-check
COPY oracle oracle
COPY scripts scripts
COPY LICENSE ./
COPY packages/engine packages/engine
COPY --from=wasm /work/build/wasm build/wasm
RUN node scripts/check-wasm-oracle.ts && touch /oracle-ok

# --- npm package: oracle-check -> engine-pack -> engine-pkg -------------------
# The package the oracle check ran, packed and checked as installed by a user.
FROM oracle-check AS engine-pack
RUN scripts/pack-engine.sh

FROM scratch AS engine-pkg
COPY --from=engine-pack /work/build/pkg/ /

# --- site (the default target: keep it last) ---------------------------------
FROM deps AS site
COPY . .
COPY --from=wasm /work/build/wasm build/wasm
# Only the site is kept: this COPY makes the oracle check a required step.
COPY --from=oracle-check /oracle-ok /tmp/
RUN npm run check && npm run build

FROM scratch AS dist
COPY --from=site /work/build/web/browser /
