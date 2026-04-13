### API Documentation Template

````markdown
# API Documentation

## Overview
Briefly describe the purpose and functionality of the API

## Basic Information
- **Base URL**: `https://api.example.com/v1`
- **Authentication**: Bearer Token
- **Data Format**: JSON
- **Character Encoding**: UTF-8

## Authentication

### Get Token
```http
POST /auth/token
Content-Type: application/json

{
  "username": "user@example.com",
  "password": "password"
}
```

**Response**:
```json
{
  "access_token": "eyJhbGciOiJIUzI1NiIs...",
  "token_type": "Bearer",
  "expires_in": 3600
}
```

## API Endpoints

### User Management

#### Create User

**Request**:
```http
POST /users
Authorization: Bearer {token}
Content-Type: application/json

{
  "email": "user@example.com",
  "name": "John Doe",
  "role": "user"
}
```

**Request Parameters**:

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| email | string | Yes | User email, must be unique |
| name | string | Yes | User name |
| role | string | No | User role, defaults to 'user' |

**Response**: `201 Created`
```json
{
  "id": 123,
  "email": "user@example.com",
  "name": "John Doe",
  "role": "user",
  "created_at": "2024-12-16T10:00:00Z"
}
```

**Error Responses**:
- `400 Bad Request` - Invalid parameters
- `401 Unauthorized` - Not authenticated
- `409 Conflict` - Email already exists

```json
{
  "error": {
    "code": "EMAIL_EXISTS",
    "message": "Email already registered",
    "field": "email"
  }
}
```

## Error Codes

| Error Code | HTTP Status | Description |
|------------|-------------|-------------|
| EMAIL_EXISTS | 409 | Email already registered |
| INVALID_TOKEN | 401 | Invalid token |
| RATE_LIMIT_EXCEEDED | 429 | Too many requests |

## Rate Limiting
- 100 requests/minute per user
- Returns 429 status code when exceeded

## Changelog

### v1.1.0 (2024-12-16)
- Added user role management endpoints
- Improved token expiration mechanism

### v1.0.0 (2024-12-01)
- Initial release
````
