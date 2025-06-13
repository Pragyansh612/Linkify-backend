# Linkify API Documentation

## Base URL
```
Local: http://localhost:3001
```

## User Management Endpoints

### GET /api/users
Get all users with follower/following counts and calculated age.

**Response:**
```json
[
  {
    "id": "uuid",
    "name": "John Doe",
    "email": "john@example.com",
    "phone": "+1234567890",
    "date_of_birth": "1990-05-15",
    "profile_image_url": "https://example.com/image.jpg",
    "created_at": "2024-01-01T00:00:00Z",
    "updated_at": "2024-01-01T00:00:00Z",
    "age": 34,
    "followers_count": 5,
    "following_count": 3
  }
]
```

### GET /api/users/:id
Get specific user details by ID.

**Parameters:**
- `id` (UUID): User ID

**Response:**
```json
{
  "id": "uuid",
  "name": "John Doe",
  "email": "john@example.com",
  "phone": "+1234567890",
  "date_of_birth": "1990-05-15",
  "profile_image_url": "https://example.com/image.jpg",
  "created_at": "2024-01-01T00:00:00Z",
  "updated_at": "2024-01-01T00:00:00Z",
  "age": 34,
  "followers_count": 5,
  "following_count": 3
}
```

**Error Responses:**
- `400`: Invalid user ID format
- `404`: User not found

### POST /api/users
Create a new user.

**Request Body:**
```json
{
  "name": "John Doe",
  "email": "john@example.com",
  "phone": "+1234567890",
  "date_of_birth": "1990-05-15",
  "profile_image_url": "https://example.com/image.jpg"
}
```

**Required Fields:**
- `name` (string): User's full name
- `email` (string): Valid email address
- `phone` (string): Phone number
- `date_of_birth` (string): Date in YYYY-MM-DD format

**Optional Fields:**
- `profile_image_url` (string): URL to profile image

**Response:**
```json
{
  "id": "uuid",
  "name": "John Doe",
  "email": "john@example.com",
  "phone": "+1234567890",
  "date_of_birth": "1990-05-15",
  "profile_image_url": "https://example.com/image.jpg",
  "created_at": "2024-01-01T00:00:00Z",
  "updated_at": "2024-01-01T00:00:00Z",
  "age": 34,
  "followers_count": 0,
  "following_count": 0
}
```

**Error Responses:**
- `400`: Validation errors or email already exists

### PUT /api/users/:id
Update user details.

**Parameters:**
- `id` (UUID): User ID

**Request Body (all fields optional):**
```json
{
  "name": "Updated Name",
  "email": "newemail@example.com",
  "phone": "+9876543210",
  "date_of_birth": "1990-05-15",
  "profile_image_url": "https://example.com/newimage.jpg"
}
```

**Response:**
```json
{
  "id": "uuid",
  "name": "Updated Name",
  "email": "newemail@example.com",
  "phone": "+9876543210",
  "date_of_birth": "1990-05-15",
  "profile_image_url": "https://example.com/newimage.jpg",
  "created_at": "2024-01-01T00:00:00Z",
  "updated_at": "2024-01-02T00:00:00Z",
  "age": 34,
  "followers_count": 5,
  "following_count": 3
}
```

**Error Responses:**
- `400`: Validation errors or email already in use
- `404`: User not found

### DELETE /api/users/:id
Delete a user and all related follow relationships.

**Parameters:**
- `id` (UUID): User ID

**Response:**
```json
{
  "message": "User deleted successfully"
}
```

**Error Responses:**
- `400`: Invalid user ID format
- `404`: User not found

## Follow System Endpoints

### POST /api/users/:id/follow
Follow another user.

**Parameters:**
- `id` (UUID): Follower's user ID

**Request Body:**
```json
{
  "followingId": "uuid-of-user-to-follow"
}
```

**Response:**
```json
{
  "message": "Successfully followed user",
  "follow": {
    "id": "uuid",
    "follower_id": "uuid",
    "following_id": "uuid",
    "created_at": "2024-01-01T00:00:00Z"
  }
}
```

**Error Responses:**
- `400`: Cannot follow yourself, already following, or validation errors
- `404`: One or both users not found

### DELETE /api/users/:id/unfollow/:followingId
Unfollow a user.

**Parameters:**
- `id` (UUID): Follower's user ID
- `followingId` (UUID): User ID to unfollow

**Response:**
```json
{
  "message": "Successfully unfollowed user"
}
```

**Error Responses:**
- `400`: Invalid user ID format
- `404`: Follow relationship not found

### GET /api/users/:id/followers
Get list of users following the specified user.

**Parameters:**
- `id` (UUID): User ID

**Response:**
```json
[
  {
    "id": "uuid",
    "name": "Follower Name",
    "email": "follower@example.com",
    "profile_image_url": "https://example.com/image.jpg",
    "followed_at": "2024-01-01T00:00:00Z"
  }
]
```

### GET /api/users/:id/following
Get list of users that the specified user is following.

**Parameters:**
- `id` (UUID): User ID

**Response:**
```json
[
  {
    "id": "uuid",
    "name": "Following Name",
    "email": "following@example.com",
    "profile_image_url": "https://example.com/image.jpg",
    "followed_at": "2024-01-01T00:00:00Z"
  }
]
```

## File Upload Endpoint

### POST /api/upload/profile-image
Upload a profile image to Supabase Storage.

**Request:**
- Method: POST
- Content-Type: multipart/form-data
- Body: Form data with 'image' field containing the file

**Example with curl:**
```bash
curl -X POST \
  http://localhost:3001/api/upload/profile-image \
  -F "image=@/path/to/image.jpg"
```

**Response:**
```json
{
  "url": "https://your-project-id.supabase.co/storage/v1/object/public/user-uploads/profile-images/timestamp-randomid.jpg"
}
```

**Error Responses:**
- `400`: No file uploaded
- `500`: Upload failed

## Error Response Format

All error responses follow this format:
```json
{
  "error": "Error message",
  "details": [
    {
      "field": "fieldName",
      "message": "Specific validation error"
    }
  ]
}
```

## HTTP Status Codes

- `200`: Success
- `201`: Created
- `400`: Bad Request (validation errors)
- `404`: Not Found
- `500`: Internal Server Error