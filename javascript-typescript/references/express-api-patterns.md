# Express API with TypeScript

#### Model (TypeScript Interface)

```typescript
// src/models/user.model.ts
export interface User {
  id: string;
  email: string;
  name: string;
  role: 'user' | 'admin';
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateUserDto {
  email: string;
  name: string;
  password: string;
}

export interface UpdateUserDto {
  name?: string;
  email?: string;
  active?: boolean;
}

export interface UserResponse {
  id: string;
  email: string;
  name: string;
  role: string;
  active: boolean;
  createdAt: string;
}
```

#### Repository Pattern

```typescript
// src/repositories/user.repository.ts
import { User, CreateUserDto, UpdateUserDto } from '../models/user.model';
import { prisma } from '../config/database';

export class UserRepository {
  async create(data: CreateUserDto): Promise<User> {
    return await prisma.user.create({
      data: {
        ...data,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    });
  }

  async findById(id: string): Promise<User | null> {
    return await prisma.user.findUnique({
      where: { id },
    });
  }

  async findByEmail(email: string): Promise<User | null> {
    return await prisma.user.findUnique({
      where: { email },
    });
  }

  async update(id: string, data: UpdateUserDto): Promise<User> {
    return await prisma.user.update({
      where: { id },
      data: {
        ...data,
        updatedAt: new Date(),
      },
    });
  }

  async delete(id: string): Promise<void> {
    await prisma.user.delete({
      where: { id },
    });
  }

  async findAll(skip: number = 0, take: number = 20): Promise<User[]> {
    return await prisma.user.findMany({
      skip,
      take,
      orderBy: { createdAt: 'desc' },
    });
  }

  async existsByEmail(email: string): Promise<boolean> {
    const count = await prisma.user.count({
      where: { email },
    });
    return count > 0;
  }
}
```

#### Service Layer

```typescript
// src/services/user.service.ts
import { User, CreateUserDto, UpdateUserDto, UserResponse } from '../models/user.model';
import { UserRepository } from '../repositories/user.repository';
import { hashPassword } from '../utils/password';
import { AppError } from '../middleware/error.middleware';
import { logger } from '../config/logger';

export class UserService {
  constructor(private userRepository: UserRepository) {}

  async createUser(data: CreateUserDto): Promise<UserResponse> {
    // Validate input
    this.validateCreateUserDto(data);

    // Check if email exists
    const exists = await this.userRepository.existsByEmail(data.email);
    if (exists) {
      throw new AppError('Email already registered', 409);
    }

    // Hash password
    const hashedPassword = await hashPassword(data.password);

    // Create user
    const user = await this.userRepository.create({
      ...data,
      password: hashedPassword,
    });

    logger.info(`User created: ${user.id}`);

    return this.toUserResponse(user);
  }

  async getUserById(id: string): Promise<UserResponse> {
    const user = await this.userRepository.findById(id);
    if (!user) {
      throw new AppError('User not found', 404);
    }
    return this.toUserResponse(user);
  }

  async updateUser(id: string, data: UpdateUserDto): Promise<UserResponse> {
    const user = await this.userRepository.findById(id);
    if (!user) {
      throw new AppError('User not found', 404);
    }

    const updatedUser = await this.userRepository.update(id, data);
    logger.info(`User updated: ${id}`);

    return this.toUserResponse(updatedUser);
  }

  async deleteUser(id: string): Promise<void> {
    const user = await this.userRepository.findById(id);
    if (!user) {
      throw new AppError('User not found', 404);
    }

    await this.userRepository.delete(id);
    logger.info(`User deleted: ${id}`);
  }

  async listUsers(page: number = 1, pageSize: number = 20): Promise<{
    users: UserResponse[];
    total: number;
    page: number;
    pageSize: number;
  }> {
    const skip = (page - 1) * pageSize;
    const users = await this.userRepository.findAll(skip, pageSize);
    const total = users.length;

    return {
      users: users.map(u => this.toUserResponse(u)),
      total,
      page,
      pageSize,
    };
  }

  private validateCreateUserDto(data: CreateUserDto): void {
    if (!data.email || !this.isValidEmail(data.email)) {
      throw new AppError('Invalid email address', 400);
    }
    if (!data.name || data.name.length < 2) {
      throw new AppError('Name must be at least 2 characters', 400);
    }
    if (!data.password || data.password.length < 8) {
      throw new AppError('Password must be at least 8 characters', 400);
    }
  }

  private isValidEmail(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }

  private toUserResponse(user: User): UserResponse {
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      active: user.active,
      createdAt: user.createdAt.toISOString(),
    };
  }
}
```

#### Controller

```typescript
// src/controllers/user.controller.ts
import { Request, Response, NextFunction } from 'express';
import { UserService } from '../services/user.service';
import { CreateUserDto, UpdateUserDto } from '../models/user.model';

export class UserController {
  constructor(private userService: UserService) {}

  /**
   * @route   POST /api/v1/users
   * @desc    Create a new user
   * @access  Public
   */
  createUser = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const data: CreateUserDto = req.body;
      const user = await this.userService.createUser(data);

      res.status(201).json({
        success: true,
        data: user,
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * @route   GET /api/v1/users/:id
   * @desc    Get user by ID
   * @access  Private
   */
  getUserById = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = req.params;
      const user = await this.userService.getUserById(id);

      res.status(200).json({
        success: true,
        data: user,
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * @route   PUT /api/v1/users/:id
   * @desc    Update user
   * @access  Private
   */
  updateUser = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = req.params;
      const data: UpdateUserDto = req.body;
      const user = await this.userService.updateUser(id, data);

      res.status(200).json({
        success: true,
        data: user,
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * @route   DELETE /api/v1/users/:id
   * @desc    Delete user
   * @access  Private
   */
  deleteUser = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = req.params;
      await this.userService.deleteUser(id);

      res.status(204).send();
    } catch (error) {
      next(error);
    }
  };

  /**
   * @route   GET /api/v1/users
   * @desc    List users with pagination
   * @access  Private
   */
  listUsers = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const page = parseInt(req.query.page as string) || 1;
      const pageSize = parseInt(req.query.pageSize as string) || 20;

      const result = await this.userService.listUsers(page, pageSize);

      res.status(200).json({
        success: true,
        data: result.users,
        pagination: {
          page: result.page,
          pageSize: result.pageSize,
          total: result.total,
        },
      });
    } catch (error) {
      next(error);
    }
  };
}
```

#### Routes

```typescript
// src/routes/user.routes.ts
import { Router } from 'express';
import { UserController } from '../controllers/user.controller';
import { UserService } from '../services/user.service';
import { UserRepository } from '../repositories/user.repository';
import { authenticate } from '../middleware/auth.middleware';
import { validate } from '../middleware/validation.middleware';
import { createUserSchema, updateUserSchema } from '../validators/user.validator';

const router = Router();

// Initialize dependencies
const userRepository = new UserRepository();
const userService = new UserService(userRepository);
const userController = new UserController(userService);

// Public routes
router.post('/', validate(createUserSchema), userController.createUser);

// Protected routes
router.get('/:id', authenticate, userController.getUserById);
router.put('/:id', authenticate, validate(updateUserSchema), userController.updateUser);
router.delete('/:id', authenticate, userController.deleteUser);
router.get('/', authenticate, userController.listUsers);

export default router;
```

#### Middleware

```typescript
// src/middleware/error.middleware.ts
import { Request, Response, NextFunction } from 'express';
import { logger } from '../config/logger';

export class AppError extends Error {
  constructor(
    public message: string,
    public statusCode: number = 500,
    public isOperational: boolean = true
  ) {
    super(message);
    Object.setPrototypeOf(this, AppError.prototype);
  }
}

export const errorHandler = (
  err: Error,
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  if (err instanceof AppError) {
    logger.error(`${err.statusCode} - ${err.message} - ${req.originalUrl} - ${req.method}`);

    res.status(err.statusCode).json({
      success: false,
      error: {
        message: err.message,
        statusCode: err.statusCode,
      },
    });
    return;
  }

  // Unknown error
  logger.error(`500 - ${err.message} - ${req.originalUrl} - ${req.method}`);
  logger.error(err.stack);

  res.status(500).json({
    success: false,
    error: {
      message: 'Internal server error',
      statusCode: 500,
    },
  });
};

// src/middleware/auth.middleware.ts
import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { AppError } from './error.middleware';

interface JwtPayload {
  userId: string;
  email: string;
}

declare global {
  namespace Express {
    interface Request {
      user?: JwtPayload;
    }
  }
}

export const authenticate = (req: Request, res: Response, next: NextFunction): void => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');

    if (!token) {
      throw new AppError('No token provided', 401);
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET!) as JwtPayload;
    req.user = decoded;

    next();
  } catch (error) {
    next(new AppError('Invalid token', 401));
  }
};
```
