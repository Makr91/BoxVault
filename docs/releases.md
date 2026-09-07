---
title: Releases
layout: default
nav_order: 5
permalink: /releases/
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

<!-- markdownlint-disable MD033 -->
<div id="latest-release-content">
  <p><em>Loading latest release information...</em></p>
</div>
<!-- markdownlint-enable MD033 -->

## Release History

For a complete list of releases, changes, and download links, visit the [BoxVault Releases page](https://github.com/Makr91/BoxVault/releases) on GitHub.

## Release Notes

Detailed release notes and changelogs are available in the [Changelog](../changelog/) section.

## Installation

### Packages

Every release carries one Debian package, `boxvault_<version>_amd64.deb`, built by the production workflow and attached to the [GitHub release](https://github.com/Makr91/BoxVault/releases). There is no npm package, Docker image or tarball. Each push to `main` between releases also publishes a draft `v<version>-dev` release with `boxvault-dev_<version>_amd64.deb`, a development build that conflicts with the `boxvault` package.

```bash
sudo gdebi -n boxvault_VERSION_amd64.deb
sudo systemctl enable --now boxvault
```

An OmniOS IPS package, `application/management/boxvault`, is built by hand with `packaging/omnios/build.sh`.

### Source Installation

Run from a checkout for development:

```bash
git clone https://github.com/Makr91/BoxVault.git
cd BoxVault/backend
npm install
UI_VERSION=$(node -p "require('./package.json').startcloudUiVersion")
mkdir -p ui
curl -fsSL "https://github.com/STARTcloud/startcloud-ui/releases/download/v${UI_VERSION}/startcloud-ui-${UI_VERSION}.tar.gz" | tar -xz -C ui
npm start
```

The development configuration is read from `backend/app/config/<name>.dev.config.yaml`.

## Upgrade Guide

Install the new package over the old one; `postinst` migrates `/etc/boxvault/*.config.yaml` in place, keeps the previous copies as `.bak`, and preserves the database and the setup token:

```bash
sudo gdebi -n boxvault_VERSION_amd64.deb
sudo systemctl restart boxvault
```

A value that no longer passes the new release's schema stops the service at boot with its pointer in the journal; fix the file and restart.

## Support

For installation issues or questions:

- Check the [Installation Guide](../guides/installation/)
- Review [Common Issues](../guides/installation/#troubleshooting)
- Open an issue on [GitHub](https://github.com/Makr91/BoxVault/issues)
