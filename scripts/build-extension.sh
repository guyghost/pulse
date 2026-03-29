#!/bin/bash
#
# build-extension.sh - Build MissionPulse Chrome extension for production
#
# Usage:
#   ./scripts/build-extension.sh [version]
#
# Arguments:
#   version - Optional version to set (e.g., "1.0.0")
#
# Environment:
#   NODE_ENV - Set to "production" by default
#
# Exit codes:
#   0 - Success
#   1 - Build failed
#   2 - Invalid arguments
#

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Default values
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
VERSION="${1:-}"
NODE_ENV="${NODE_ENV:-production}"

# Logging functions
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check required tools
check_dependencies() {
    log_info "Checking dependencies..."

    if ! command -v pnpm &> /dev/null; then
        log_error "pnpm is not installed. Please install it first."
        exit 1
    fi

    if ! command -v node &> /dev/null; then
        log_error "Node.js is not installed. Please install it first."
        exit 1
    fi

    log_success "All dependencies available"
}

# Clean previous build
clean_build() {
    log_info "Cleaning previous build..."
    rm -rf "$PROJECT_ROOT/dist"
    log_success "Build directory cleaned"
}

# Bump version if provided
bump_version() {
    if [[ -n "$VERSION" ]]; then
        if [[ ! "$VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+(-[a-zA-Z0-9.]+)?$ ]]; then
            log_error "Invalid version format: $VERSION"
            log_info "Expected format: X.Y.Z or X.Y.Z-prerelease"
            exit 2
        fi

        log_info "Bumping version to $VERSION..."
        pnpm tsx "$SCRIPT_DIR/bump-version.ts" "$VERSION"
        log_success "Version bumped to $VERSION"
    else
        log_info "Using existing version from package.json"
    fi
}

# Verify manifest.json
verify_manifest() {
    log_info "Verifying manifest.json..."
    pnpm tsx "$SCRIPT_DIR/verify-manifest.ts"
    log_success "manifest.json is valid"
}

# Install dependencies
install_deps() {
    log_info "Installing dependencies..."
    pnpm install --frozen-lockfile
    log_success "Dependencies installed"
}

# Run build
run_build() {
    log_info "Building extension (NODE_ENV=$NODE_ENV)..."
    NODE_ENV="$NODE_ENV" pnpm build
    log_success "Extension built successfully"
}

# Create distribution ZIP
create_zip() {
    local version
    version=$(node -p "require('$PROJECT_ROOT/package.json').version")
    local zip_name="missionpulse-${version}.zip"

    log_info "Creating distribution ZIP: $zip_name..."

    cd "$PROJECT_ROOT/dist"
    zip -r "../$zip_name" .
    cd "$PROJECT_ROOT"

    local zip_size
    zip_size=$(du -h "$zip_name" | cut -f1)

    log_success "Created $zip_name ($zip_size)"
    log_info "Location: $PROJECT_ROOT/$zip_name"
}

# Print build summary
print_summary() {
    local version
    version=$(node -p "require('$PROJECT_ROOT/package.json').version")

    echo ""
    echo "======================================"
    echo "  Build Summary"
    echo "======================================"
    echo "  Version:    $version"
    echo "  Env:        $NODE_ENV"
    echo "  Output:     $PROJECT_ROOT/dist/"
    echo "  ZIP:        $PROJECT_ROOT/missionpulse-${version}.zip"
    echo "======================================"
    echo ""
}

# Main execution
main() {
    echo ""
    echo "╔══════════════════════════════════════╗"
    echo "║   MissionPulse Build Script          ║"
    echo "╚══════════════════════════════════════╝"
    echo ""

    cd "$PROJECT_ROOT"

    check_dependencies
    clean_build
    install_deps

    if [[ -n "$VERSION" ]]; then
        bump_version
    fi

    verify_manifest
    run_build
    create_zip
    print_summary

    log_success "Build completed successfully! 🚀"
}

# Run main function
main "$@"
