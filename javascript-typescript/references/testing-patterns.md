# Testing

#### Jest Configuration

```javascript
// jest.config.js
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src', '<rootDir>/tests'],
  testMatch: ['**/__tests__/**/*.ts', '**/?(*.)+(spec|test).ts'],
  transform: {
    '^.+\\.ts$': 'ts-jest',
  },
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.d.ts',
    '!src/**/*.interface.ts',
  ],
  coverageThreshold: {
    global: {
      branches: 80,
      functions: 80,
      lines: 80,
      statements: 80,
    },
  },
};
```

#### Unit Test

```typescript
// tests/unit/services/user.service.test.ts
import { UserService } from '../../../src/services/user.service';
import { UserRepository } from '../../../src/repositories/user.repository';
import { AppError } from '../../../src/middleware/error.middleware';

// Mock the repository
jest.mock('../../../src/repositories/user.repository');

describe('UserService', () => {
  let userService: UserService;
  let userRepository: jest.Mocked<UserRepository>;

  beforeEach(() => {
    userRepository = new UserRepository() as jest.Mocked<UserRepository>;
    userService = new UserService(userRepository);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('createUser', () => {
    it('should create a user successfully', async () => {
      const mockUser = {
        id: '1',
        email: 'test@example.com',
        name: 'Test User',
        password: 'hashedPassword',
        role: 'user' as const,
        active: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      userRepository.existsByEmail.mockResolvedValue(false);
      userRepository.create.mockResolvedValue(mockUser);

      const result = await userService.createUser({
        email: 'test@example.com',
        name: 'Test User',
        password: 'password123',
      });

      expect(result).toEqual({
        id: '1',
        email: 'test@example.com',
        name: 'Test User',
        role: 'user',
        active: true,
        createdAt: mockUser.createdAt.toISOString(),
      });
      expect(userRepository.existsByEmail).toHaveBeenCalledWith('test@example.com');
      expect(userRepository.create).toHaveBeenCalled();
    });

    it('should throw error if email already exists', async () => {
      userRepository.existsByEmail.mockResolvedValue(true);

      await expect(
        userService.createUser({
          email: 'test@example.com',
          name: 'Test User',
          password: 'password123',
        })
      ).rejects.toThrow(AppError);
    });

    it('should throw error for invalid email', async () => {
      await expect(
        userService.createUser({
          email: 'invalid-email',
          name: 'Test User',
          password: 'password123',
        })
      ).rejects.toThrow('Invalid email address');
    });
  });

  describe('getUserById', () => {
    it('should return user if found', async () => {
      const mockUser = {
        id: '1',
        email: 'test@example.com',
        name: 'Test User',
        password: 'hashedPassword',
        role: 'user' as const,
        active: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      userRepository.findById.mockResolvedValue(mockUser);

      const result = await userService.getUserById('1');

      expect(result.id).toBe('1');
      expect(userRepository.findById).toHaveBeenCalledWith('1');
    });

    it('should throw error if user not found', async () => {
      userRepository.findById.mockResolvedValue(null);

      await expect(userService.getUserById('999')).rejects.toThrow('User not found');
    });
  });
});
```

#### Integration Test

```typescript
// tests/integration/user.test.ts
import request from 'supertest';
import app from '../../src/app';
import { prisma } from '../../src/config/database';

describe('User API Integration Tests', () => {
  beforeAll(async () => {
    // Setup test database
    await prisma.$connect();
  });

  afterAll(async () => {
    // Cleanup
    await prisma.user.deleteMany();
    await prisma.$disconnect();
  });

  afterEach(async () => {
    // Clear data after each test
    await prisma.user.deleteMany();
  });

  describe('POST /api/v1/users', () => {
    it('should create a new user', async () => {
      const response = await request(app)
        .post('/api/v1/users')
        .send({
          email: 'test@example.com',
          name: 'Test User',
          password: 'password123',
        })
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('id');
      expect(response.body.data.email).toBe('test@example.com');
    });

    it('should return 409 if email already exists', async () => {
      await request(app)
        .post('/api/v1/users')
        .send({
          email: 'test@example.com',
          name: 'Test User',
          password: 'password123',
        });

      const response = await request(app)
        .post('/api/v1/users')
        .send({
          email: 'test@example.com',
          name: 'Another User',
          password: 'password456',
        })
        .expect(409);

      expect(response.body.success).toBe(false);
    });
  });
});
```
