---
title: Backend Integration
layout: default
parent: Guides
nav_order: 4
permalink: /guides/backend-integration/
---

## Backend Integration Guide

{: .no_toc }

Integrate BoxVault with your existing infrastructure and CI/CD pipelines.

## Table of contents

{: .no_toc .text-delta }

1. TOC
   {:toc}

---

## Overview

BoxVault provides comprehensive APIs for integrating with existing development workflows, CI/CD pipelines, and infrastructure automation tools. Automation authenticates with a raw service-account token on `Authorization: Bearer`; the box, version, provider and architecture must exist before a file is uploaded, and the upload is the raw request body with `Content-Type: application/octet-stream` and an optional `X-Checksum` and `X-Checksum-Type` pair.

## CI/CD Integration

### GitHub Actions

```yaml
name: Build and Upload Vagrant Box

on:
  push:
    tags:
      - "v*"

jobs:
  build-and-upload:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3

      - name: Build Vagrant Box
        run: |
          packer build ubuntu.pkr.hcl

      - name: Upload to BoxVault
        env:
          BOXVAULT_URL: ${{ secrets.BOXVAULT_URL }}
          BOXVAULT_TOKEN: ${{ secrets.BOXVAULT_TOKEN }}
        run: |
          VERSION=${GITHUB_REF#refs/tags/v}

          curl --fail -X POST "$BOXVAULT_URL/api/organization/myorg/box/ubuntu-20.04/version/$VERSION/provider/virtualbox/architecture/amd64/file/upload" \
            -H "Authorization: Bearer $BOXVAULT_TOKEN" \
            -H "Content-Type: application/octet-stream" \
            -H "X-File-Name: ubuntu-20.04.box" \
            --upload-file ubuntu-20.04.box
```

### GitLab CI

```yaml
stages:
  - build
  - upload

build-box:
  stage: build
  script:
    - packer build ubuntu.pkr.hcl
  artifacts:
    paths:
      - "*.box"

upload-box:
  stage: upload
  script:
    - |
      curl --fail -X POST "$BOXVAULT_URL/api/organization/myorg/box/ubuntu-20.04/version/$CI_COMMIT_TAG/provider/virtualbox/architecture/amd64/file/upload" \
        -H "Authorization: Bearer $BOXVAULT_TOKEN" \
        -H "Content-Type: application/octet-stream" \
        -H "X-File-Name: ubuntu-20.04.box" \
        --upload-file ubuntu-20.04.box
  only:
    - tags
```

### Jenkins Pipeline

```groovy
pipeline {
    agent any

    environment {
        BOXVAULT_URL = credentials('boxvault-url')
        BOXVAULT_TOKEN = credentials('boxvault-token')
    }

    stages {
        stage('Build') {
            steps {
                sh 'packer build ubuntu.pkr.hcl'
            }
        }

        stage('Upload') {
            steps {
                sh """
                    curl --fail -X POST \$BOXVAULT_URL/api/organization/myorg/box/ubuntu-20.04/version/${env.BUILD_NUMBER}/provider/virtualbox/architecture/amd64/file/upload \
                        -H "Authorization: Bearer \$BOXVAULT_TOKEN" \
                        -H "Content-Type: application/octet-stream" \
                        -H "X-File-Name: ubuntu-20.04.box" \
                        --upload-file ubuntu-20.04.box
                """
            }
        }
    }
}
```

## Infrastructure as Code

### Ansible Integration

```yaml
---
- name: Upload Vagrant Box to BoxVault
  hosts: localhost
  vars:
    boxvault_url: "https://boxvault.example.com"
    organization: "myorg"
    box_name: "ubuntu-20.04"
    version: "1.0.0"

  tasks:
    - name: Upload box file
      uri:
        url: "{{ boxvault_url }}/api/organization/{{ organization }}/box/{{ box_name }}/version/{{ version }}/provider/virtualbox/architecture/amd64/file/upload"
        method: POST
        headers:
          Authorization: "Bearer {{ boxvault_token }}"
          Content-Type: application/octet-stream
          X-File-Name: "{{ box_name }}.box"
        src: "{{ box_name }}.box"
```

## API Integration Examples

### Python SDK

```python
import os
import requests

class BoxVaultClient:
    def __init__(self, base_url, token):
        self.base_url = base_url.rstrip('/')
        self.headers = {"Authorization": f"Bearer {token}"}

    def upload_box(self, org, box, version, provider, arch, file_path):
        with open(file_path, 'rb') as f:
            response = requests.post(
                f"{self.base_url}/api/organization/{org}/box/{box}/version/{version}/provider/{provider}/architecture/{arch}/file/upload",
                headers={
                    **self.headers,
                    "Content-Type": "application/octet-stream",
                    "X-File-Name": os.path.basename(file_path),
                },
                data=f
            )
        response.raise_for_status()
        return response.json()

    def list_boxes(self, org):
        response = requests.get(
            f"{self.base_url}/api/organization/{org}/box",
            headers=self.headers
        )
        response.raise_for_status()
        return response.json()

client = BoxVaultClient(
    "https://boxvault.example.com",
    os.environ["BOXVAULT_TOKEN"]
)

client.upload_box("myorg", "ubuntu-20.04", "1.0.0", "virtualbox", "amd64", "ubuntu.box")

boxes = client.list_boxes("myorg")
print(f"Found {len(boxes)} boxes")
```

### Node.js SDK

```javascript
const axios = require("axios");
const fs = require("fs");
const path = require("path");

class BoxVaultClient {
  constructor(baseUrl, token) {
    this.baseUrl = baseUrl.replace(/\/$/, "");
    this.headers = { Authorization: `Bearer ${token}` };
  }

  async uploadBox(org, box, version, provider, arch, filePath) {
    const response = await axios.post(
      `${this.baseUrl}/api/organization/${org}/box/${box}/version/${version}/provider/${provider}/architecture/${arch}/file/upload`,
      fs.createReadStream(filePath),
      {
        headers: {
          ...this.headers,
          "Content-Type": "application/octet-stream",
          "Content-Length": fs.statSync(filePath).size,
          "X-File-Name": path.basename(filePath),
        },
        maxBodyLength: Infinity,
      },
    );
    return response.data;
  }

  async listBoxes(org) {
    const response = await axios.get(
      `${this.baseUrl}/api/organization/${org}/box`,
      { headers: this.headers },
    );
    return response.data;
  }
}

const client = new BoxVaultClient(
  "https://boxvault.example.com",
  process.env.BOXVAULT_TOKEN,
);

await client.uploadBox(
  "myorg",
  "ubuntu-20.04",
  "1.0.0",
  "virtualbox",
  "amd64",
  "ubuntu.box",
);

const boxes = await client.listBoxes("myorg");
console.log(`Found ${boxes.length} boxes`);
```

## Monitoring and Observability

### Health Checks

```bash
curl https://boxvault.example.com/api/health

curl https://boxvault.example.com/api/status
```

`GET /api/health` answers `{ status, timestamp, version, environment, supported_languages, default_language, frontend_logging, services }` without authentication; `status` is `ok`, `warning` or `error`.

### Log Aggregation

```yaml
# Fluentd configuration
<source>
@type tail
path /var/log/boxvault/boxvault.log
pos_file /var/log/fluentd/boxvault.log.pos
tag boxvault
format json
</source>

<match boxvault>
@type elasticsearch
host elasticsearch.example.com
port 9200
index_name boxvault
</match>
```

## Best Practices

### Error Handling

- Implement exponential backoff for API calls
- Handle rate limiting gracefully
- Log all API interactions for debugging
- Use circuit breakers for external dependencies

### Security

- Store credentials securely (environment variables, secrets management)
- Use service accounts for automation
- Implement proper token rotation

### Performance

- Use connection pooling for HTTP clients
- Implement caching where appropriate
- Monitor API response times
- Set appropriate timeouts

### Reliability

- Implement retry logic with backoff
- Use health checks in load balancers
- Monitor disk space for box storage
- Set up alerting for critical failures
