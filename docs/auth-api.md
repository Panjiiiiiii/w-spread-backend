# Authentication API

Base URL:

```text
http://localhost:5000/api/v1
```

GET responses use this envelope:

```json
{
  "success": true,
  "message": "Success",
  "data": {},
  "meta": null
}
```

All error responses use this envelope:

```json
{
  "success": false,
  "message": "Error message",
  "errors": null
}
```

## Register

### JSON request without a new image

```http
POST /auth/register
Content-Type: application/json
```

```json
{
  "email": "user@example.com",
  "password": "password123",
  "name": "John Doe"
}
```

`password` must contain at least 8 characters. `name` is optional.

An existing image URL can be supplied instead:

```json
{
  "email": "user@example.com",
  "password": "password123",
  "name": "John Doe",
  "imageUrl": "https://example.com/avatar.jpg"
}
```

### Multipart request with image upload

```http
POST /auth/register
Content-Type: multipart/form-data
```

Form fields:

| Field | Type | Required | Description |
|---|---|---:|---|
| `email` | string | Yes | User email |
| `password` | string | Yes | Minimum 8 characters |
| `name` | string | No | Display name |
| `image` | file | No | JPEG, PNG, or WebP; maximum 5 MB |

The image is uploaded to the configured Supabase Storage bucket under:

```text
users/{userId}/{generated-file-name}
```

### Expected response

Status: `201 Created`

```json
{
  "success": true,
  "message": "Registration successful",
  "meta": null
}
```

The session token is returned in the `Authorization` response header:

```http
Authorization: Bearer <session-token>
```

## Login

```http
POST /auth/login
Content-Type: application/json
```

```json
{
  "email": "user@example.com",
  "password": "password123"
}
```

### Expected response

Status: `200 OK`

```json
{
  "success": true,
  "message": "Login successful",
  "meta": null
}
```

The session token is returned in the `Authorization` response header:

```http
Authorization: Bearer <session-token>
```

## Google Login

The frontend obtains a Google ID token using Google Identity Services, then sends that token to the backend. Do not send the Google access token in this endpoint.

```http
POST /auth/google
Content-Type: application/json
```

```json
{
  "idToken": "google-id-token-from-the-frontend"
}
```

### Expected response

Status: `200 OK`

The response has the same shape as the login response:

```json
{
  "success": true,
  "message": "Google login successful",
  "meta": null
}
```

The session token is returned in the `Authorization` response header:

```http
Authorization: Bearer <session-token>
```

Google users are matched by their verified email address and linked through `AuthAccount`.

## Existing User Endpoints

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/users` | List users |
| `GET` | `/users/:id` | Get one user |
| `POST` | `/users` | Create a user record |
| `DELETE` | `/users/:id` | Delete a user |

The existing user endpoints currently do not require a session token. Authentication middleware should be added before exposing user administration publicly.

## Update Profile Image

```http
PATCH /auth/me/avatar
Authorization: Bearer <session-token>
Content-Type: multipart/form-data
```

Form fields:

| Field | Type | Required | Description |
|---|---|---:|---|
| `image` | file | Yes | JPEG, PNG, or WebP; maximum 5 MB |

The image is uploaded to Supabase Storage and saved as the authenticated user's
`imageUrl`. The response returns the updated user in `data`.

## Common errors

### Missing or invalid credentials

Status: `400 Bad Request`

```json
{
  "success": false,
  "message": "email and password are required",
  "errors": null
}
```

### Invalid password

Status: `401 Unauthorized`

```json
{
  "success": false,
  "message": "Invalid email or password",
  "errors": null
}
```

### Duplicate email

Status: `400 Bad Request`

```json
{
  "success": false,
  "message": "Email is already registered",
  "errors": null
}
```

### Invalid image

Status: `400 Bad Request`

```json
{
  "success": false,
  "message": "Image must be JPEG, PNG, or WebP",
  "errors": null
}
```

### Image too large

Status: `400 Bad Request`

```json
{
  "success": false,
  "message": "Image must be 5 MB or smaller",
  "errors": null
}
```

## Frontend integration notes

1. Store the `Authorization` response header securely; do not store passwords.
2. The current API returns the session token but protected-route middleware is not implemented yet.
3. For avatar upload, use `FormData` and do not manually set the `Content-Type` header; the browser adds the multipart boundary.
4. The Supabase service role key must remain backend-only.
