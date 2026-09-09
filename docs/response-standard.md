# API Response Standard

This document defines the response convention for all W-Spread API endpoints.

## GET endpoints

GET endpoints return:

- HTTP status code
- `success`
- `message`
- `data`
- optional `meta`

Example:

```http
GET /api/v1/users/2c8c0c6e-7e32-4a24-9e14-5a4f5b1c7a11
```

```json
{
  "success": true,
  "message": "User retrieved successfully",
  "data": {
    "id": "2c8c0c6e-7e32-4a24-9e14-5a4f5b1c7a11",
    "email": "user@example.com",
    "name": "John Doe",
    "imageUrl": null,
    "role": "USER",
    "createdAt": "2026-09-09T13:00:00.000Z",
    "updatedAt": "2026-09-09T13:00:00.000Z"
  },
  "meta": null
}
```

## Non-GET endpoints

POST, PUT, PATCH, and DELETE endpoints return only:

- HTTP status code
- `success`
- `message`

They do not return a `data` property in successful responses.

Example:

```http
POST /api/v1/users
```

```json
{
  "success": true,
  "message": "User created successfully"
}
```

Delete example:

```json
{
  "success": true,
  "message": "User deleted successfully"
}
```

## Authentication responses

Authentication endpoints are POST endpoints, so they follow the non-GET rule:

```json
{
  "success": true,
  "message": "Login successful"
}
```

The session token is returned in the response header instead of the response body:

```http
Authorization: Bearer <session-token>
```

Affected endpoints:

- `POST /api/v1/auth/register`
- `POST /api/v1/auth/login`
- `POST /api/v1/auth/google`

The frontend should read and securely store the `Authorization` response header value, then send it on protected requests:

```http
Authorization: Bearer <session-token>
```

## Error responses

Errors keep the existing standard regardless of HTTP method:

```json
{
  "success": false,
  "message": "Invalid email or password",
  "errors": null
}
```

The HTTP status code remains the source of the response status:

- `200`: successful GET or action
- `201`: successful creation/register
- `400`: invalid request
- `401`: unauthenticated or invalid credentials
- `403`: forbidden
- `404`: resource not found
- `500`: unexpected server error
