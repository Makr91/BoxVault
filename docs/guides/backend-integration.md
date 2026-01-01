---
title: Backend Integration
layout: default
parent: Guides
nav_order: 4
permalink: /docs/guides/backend-integration/
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

BoxVault provides comprehensive APIs for integrating with existing development workflows, CI/CD pipelines, and infrastructure automation tools.

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
          BOXVAULT_CLIENT_ID: ${{ secrets.BOXVAULT_CLIENT_ID }}
          BOXVAULT_CLIENT_SECRET: ${{ secrets.BOXVAULT_CLIENT_SECRET }}
        run: |
          # Get authentication token
          TOKEN=$(curl -s -X POST $BOXVAULT_URL/api/auth/service-account \
            -H "Content-Type: application/json" \
            -d "{\"clientId\":\"$BOXVAULT_CLIENT_ID\",\"clientSecret\":\"$BOXVAULT_CLIENT_SECRET\"}" \
            | jq -r '.accessToken')

          # Extract version from tag
          VERSION=${GITHUB_REF#refs/tags/v}

          # Upload box file
          curl -X POST $BOXVAULT_URL/api/organization/myorg/box/ubuntu-20.04/version/$VERSION/provider/virtualbox/architecture/amd64/file \
            -H "x-access-token: $TOKEN" \
            -F "file=@ubuntu-20.04.box"
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
      TOKEN=$(curl -s -X POST $BOXVAULT_URL/api/auth/service-account \
        -H "Content-Type: application/json" \
        -d "{\"clientId\":\"$BOXVAULT_CLIENT_ID\",\"clientSecret\":\"$BOXVAULT_CLIENT_SECRET\"}" \
        | jq -r '.accessToken')

      curl -X POST $BOXVAULT_URL/api/organization/myorg/box/ubuntu-20.04/version/$CI_COMMIT_TAG/provider/virtualbox/architecture/amd64/file \
        -H "x-access-token: $TOKEN" \
        -F "file=@ubuntu-20.04.box"
  only:
    - tags
```

### Jenkins Pipeline

```groovy
pipeline {
    agent any

    environment {
        BOXVAULT_URL = credentials('boxvault-url')
        BOXVAULT_CLIENT_ID = credentials('boxvault-client-id')
        BOXVAULT_CLIENT_SECRET = credentials('boxvault-client-secret')
    }

    stages {
        stage('Build') {
            steps {
                sh 'packer build ubuntu.pkr.hcl'
            }
        }

        stage('Upload') {
            steps {
                script {
                    def token = sh(
                        script: """
                            curl -s -X POST \$BOXVAULT_URL/api/auth/service-account \
                                -H "Content-Type: application/json" \
                                -d '{"clientId":"'\$BOXVAULT_CLIENT_ID'","clientSecret":"'\$BOXVAULT_CLIENT_SECRET'"}' \
                                | jq -r '.accessToken'
                        """,
                        returnStdout: true
                    ).trim()

                    sh """
                        curl -X POST \$BOXVAULT_URL/api/organization/myorg/box/ubuntu-20.04/version/${env.BUILD_NUMBER}/provider/virtualbox/architecture/amd64/file \
                            -H "x-access-token: ${token}" \
                            -F "file=@ubuntu-20.04.box"
                    """
                }
            }
        }
    }
}
```

## Infrastructure as Code

### Terraform Integration

```hcl
# Configure BoxVault provider (hypothetical)
terraform {
  required_providers {
    boxvault = {
      source = "boxvault/boxvault"
      version = "~> 1.0"
    }
  }
}

provider "boxvault" {
  endpoint = var.boxvault_url
  token    = var.boxvault_token
}

# Create organization
resource "boxvault_organization" "example" {
  name        = "example-org"
  description = "Example organization"
  is_public   = false
}

# Create box
resource "boxvault_box" "ubuntu" {
  organization = boxvault_organization.example.name
  name         = "ubuntu-20.04"
  description  = "Ubuntu 20.04 LTS"
  is_public    = true
}
```

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
    - name: Get authentication token
      uri:
        url: "{{ boxvault_url }}/api/auth/service-account"
        method: POST
        body_format: json
        body:
          clientId: "{{ boxvault_client_id }}"
          clientSecret: "{{ boxvault_client_secret }}"
      register: auth_response

    - name: Upload box file
      uri:
        url: "{{ boxvault_url }}/api/organization/{{ organization }}/box/{{ box_name }}/version/{{ version }}/provider/virtualbox/architecture/amd64/file"
        method: POST
        headers:
          x-access-token: "{{ auth_response.json.accessToken }}"
        body_format: form-multipart
        body:
          file:
            filename: "{{ box_name }}.box"
            content: "{{ lookup('file', box_name + '.box') | b64encode }}"
            mime_type: application/octet-stream
```

## API Integration Examples

### Python SDK

```python
import requests
import os

class BoxVaultClient:
    def __init__(self, base_url, client_id=None, client_secret=None):
        self.base_url = base_url.rstrip('/')
        self.token = None

        if client_id and client_secret:
            self.authenticate_service_account(client_id, client_secret)

    def authenticate_service_account(self, client_id, client_secret):
        response = requests.post(
            f"{self.base_url}/api/auth/service-account",
            json={"clientId": client_id, "clientSecret": client_secret}
        )
        response.raise_for_status()
        self.token = response.json()["accessToken"]

    def upload_box(self, org, box, version, provider, arch, file_path):
        with open(file_path, 'rb') as f:
            response = requests.post(
                f"{self.base_url}/api/organization/{org}/box/{box}/version/{version}/provider/{provider}/architecture/{arch}/file",
                headers={"x-access-token": self.token},
                files={"file": f}
            )
        response.raise_for_status()
        return response.json()

    def list_boxes(self, org):
        response = requests.get(
            f"{self.base_url}/api/organization/{org}/box",
            headers={"x-access-token": self.token}
        )
        response.raise_for_status()
        return response.json()

# Usage
client = BoxVaultClient(
    "https://boxvault.example.com",
    os.environ["BOXVAULT_CLIENT_ID"],
    os.environ["BOXVAULT_CLIENT_SECRET"]
)

# Upload a box
client.upload_box("myorg", "ubuntu-20.04", "1.0.0", "virtualbox", "amd64", "ubuntu.box")

# List boxes
boxes = client.list_boxes("myorg")
print(f"Found {len(boxes)} boxes")
```

### Node.js SDK

```javascript
const axios = require("axios");
const FormData = require("form-data");
const fs = require("fs");

class BoxVaultClient {
  constructor(baseUrl, clientId, clientSecret) {
    this.baseUrl = baseUrl.replace(/\/$/, "");
    this.token = null;

    if (clientId && clientSecret) {
      this.authenticateServiceAccount(clientId, clientSecret);
    }
  }

  async authenticateServiceAccount(clientId, clientSecret) {
    const response = await axios.post(
      `${this.baseUrl}/api/auth/service-account`,
      {
        clientId,
        clientSecret,
      },
    );
    this.token = response.data.accessToken;
  }

  async uploadBox(org, box, version, provider, arch, filePath) {
    const form = new FormData();
    form.append("file", fs.createReadStream(filePath));

    const response = await axios.post(
      `${this.baseUrl}/api/organization/${org}/box/${box}/version/${version}/provider/${provider}/architecture/${arch}/file`,
      form,
      {
        headers: {
          "x-access-token": this.token,
          ...form.getHeaders(),
        },
      },
    );
    return response.data;
  }

  async listBoxes(org) {
    const response = await axios.get(
      `${this.baseUrl}/api/organization/${org}/box`,
      {
        headers: { "x-access-token": this.token },
      },
    );
    return response.data;
  }
}

// Usage
const client = new BoxVaultClient(
  "https://boxvault.example.com",
  process.env.BOXVAULT_CLIENT_ID,
  process.env.BOXVAULT_CLIENT_SECRET,
);

// Upload a box
await client.uploadBox(
  "myorg",
  "ubuntu-20.04",
  "1.0.0",
  "virtualbox",
  "amd64",
  "ubuntu.box",
);

// List boxes
const boxes = await client.listBoxes("myorg");
console.log(`Found ${boxes.length} boxes`);
```

## Webhook Integration

### Setting up Webhooks

BoxVault can send webhooks for various events:

```bash
# Create webhook
curl -X POST http://localhost:3000/api/admin/webhooks \
  -H "x-access-token: ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://your-app.com/webhooks/boxvault",
    "events": ["box.uploaded", "box.deleted", "user.created"],
    "secret": "webhook-secret"
  }'
```

### Webhook Handler Example

```javascript
const express = require("express");
const crypto = require("crypto");

const app = express();
app.use(express.json());

app.post("/webhooks/boxvault", (req, res) => {
  const signature = req.headers["x-boxvault-signature"];
  const payload = JSON.stringify(req.body);
  const secret = process.env.WEBHOOK_SECRET;

  // Verify signature
  const expectedSignature = crypto
    .createHmac("sha256", secret)
    .update(payload)
    .digest("hex");

  if (signature !== `sha256=${expectedSignature}`) {
    return res.status(401).send("Invalid signature");
  }

  // Handle event
  const { event, data } = req.body;

  switch (event) {
    case "box.uploaded":
      console.log(
        `Box uploaded: ${data.organization}/${data.box} v${data.version}`,
      );
      // Trigger deployment, notifications, etc.
      break;

    case "box.deleted":
      console.log(`Box deleted: ${data.organization}/${data.box}`);
      // Clean up references, notify teams, etc.
      break;

    case "user.created":
      console.log(`New user: ${data.username}`);
      // Send welcome email, setup permissions, etc.
      break;
  }

  res.status(200).send("OK");
});
```

## Monitoring and Observability

### Health Checks

```bash
# Basic health check
curl http://localhost:3000/health

# Detailed status
curl http://localhost:3000/api/status
```

### Metrics Integration

```yaml
# Prometheus configuration
scrape_configs:
  - job_name: "boxvault"
    static_configs:
      - targets: ["localhost:3000"]
    metrics_path: "/metrics"
    scrape_interval: 30s
```

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
- Validate webhook signatures

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
