# Common API Patterns

## 1. Bulk Operations

```
POST /api/v1/users/bulk
{
  "operations": [
    {
      "method": "create",
      "data": {"username": "user1", ...}
    },
    {
      "method": "update",
      "id": "user_123",
      "data": {"email": "new@example.com"}
    },
    {
      "method": "delete",
      "id": "user_456"
    }
  ]
}

Response:
{
  "results": [
    {"operation": 0, "status": "success", "data": {...}},
    {"operation": 1, "status": "success", "data": {...}},
    {"operation": 2, "status": "error", "error": {"code": 404, "message": "Not found"}}
  ]
}
```

## 2. Async Operations

```
POST /api/v1/reports/generate
{
  "type": "annual",
  "year": 2025
}

Response:
HTTP 202 Accepted
{
  "job_id": "job_abc123",
  "status": "pending",
  "status_url": "/api/v1/jobs/job_abc123"
}

Check status:
GET /api/v1/jobs/job_abc123
{
  "job_id": "job_abc123",
  "status": "completed",
  "result_url": "/api/v1/reports/report_xyz789"
}
```

## 3. Webhooks

```
Register webhook:
POST /api/v1/webhooks
{
  "url": "https://client.example.com/webhook",
  "events": ["user.created", "user.updated"],
  "secret": "webhook_secret_123"
}

Webhook payload:
POST https://client.example.com/webhook
X-Webhook-Signature: sha256=abc123...
{
  "event": "user.created",
  "timestamp": "2025-01-01T00:00:00Z",
  "data": {
    "id": "user_123",
    "username": "john_doe"
  }
}
```
