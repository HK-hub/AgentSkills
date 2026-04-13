# OpenAPI Specification Template

A complete OpenAPI 3.0 specification example for the Blog API:

```yaml
openapi: 3.0.0
info:
  title: Blog API
  version: 1.0.0
  description: RESTful API for blog platform

servers:
  - url: https://api.example.com/v1
    description: Production server

paths:
  /users:
    get:
      summary: List users
      parameters:
        - name: page
          in: query
          schema:
            type: integer
            default: 1
        - name: size
          in: query
          schema:
            type: integer
            default: 20
      responses:
        '200':
          description: Success
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/UserListResponse'
    post:
      summary: Create user
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/CreateUserRequest'
      responses:
        '201':
          description: Created
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/UserResponse'

components:
  schemas:
    User:
      type: object
      properties:
        id:
          type: string
        username:
          type: string
        email:
          type: string
        created_at:
          type: string
          format: date-time
    CreateUserRequest:
      type: object
      required: [username, email, password]
      properties:
        username:
          type: string
        email:
          type: string
          format: email
        password:
          type: string
          minLength: 8
    UserResponse:
      type: object
      properties:
        code:
          type: integer
        message:
          type: string
        data:
          $ref: '#/components/schemas/User'
        request_id:
          type: string
  securitySchemes:
    BearerAuth:
      type: http
      scheme: bearer
      bearerFormat: JWT
```
