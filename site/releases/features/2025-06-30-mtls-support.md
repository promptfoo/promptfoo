---
slug: /features/mtls-support
title: mTLS support - Enterprise database security
description: Learn how to use mTLS support for secure database connections with mutual TLS authentication
authors: [promptfoo_team]
tags: [mtls-support, enterprise, database, security, ssl, v0.115.0, june-2025]
keywords: [mTLS, mutual TLS, database security, SSL, enterprise, authentication]
date: 2025-06-30T23:59
---

# mTLS support

mTLS support for production databases:

```yaml
database:
  ssl:
    enabled: true
    mtls: true
    ca: '/path/to/ca.pem'
    cert: '/path/to/client-cert.pem'
    key: '/path/to/client-key.pem'
```

---

**Back to**: [Release notes index](/releases/) 