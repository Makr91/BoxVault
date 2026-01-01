---
title: Releases
layout: default
nav_order: 5
permalink: /docs/releases/
---

## Releases

{: .no_toc }

BoxVault release information and download links.

## Table of contents

{: .no_toc .text-delta }

1. TOC
   {:toc}

---

## Latest Release

<div id="latest-release-content">
  <p><em>Loading latest release information...</em></p>
</div>

## Release History

For a complete list of releases, changes, and download links, visit the [BoxVault Releases page](https://github.com/Makr91/BoxVault/releases) on GitHub.

## Release Notes

Detailed release notes and changelogs are available in the [Changelog](changelog/) section.

## Installation

### Package Managers

BoxVault is available through various package managers:

#### npm

```bash
npm install -g boxvault
```

#### Docker

```bash
docker pull boxvault/boxvault:latest
```

### Manual Installation

Download the latest release for your platform:

- **Linux (x64)**: `boxvault-linux-x64.tar.gz`
- **Linux (ARM64)**: `boxvault-linux-arm64.tar.gz`
- **macOS (x64)**: `boxvault-macos-x64.tar.gz`
- **macOS (ARM64)**: `boxvault-macos-arm64.tar.gz`
- **Windows (x64)**: `boxvault-windows-x64.zip`

### Source Installation

Build from source:

```bash
git clone https://github.com/Makr91/BoxVault.git
cd BoxVault
npm install
npm run build
npm start
```

## Upgrade Guide

### From v1.x to v2.x

Major version upgrades may require configuration changes or database migrations. See the [upgrade guide](guides/upgrade/) for detailed instructions.

### Minor Updates

Minor version updates typically require only:

```bash
npm update boxvault
# or
docker pull boxvault/boxvault:latest
```

## Support

For installation issues or questions:

- Check the [Installation Guide](guides/installation/)
- Review [Common Issues](guides/troubleshooting/)
- Open an issue on [GitHub](https://github.com/Makr91/BoxVault/issues)
