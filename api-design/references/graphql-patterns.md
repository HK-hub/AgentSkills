# GraphQL Design Patterns

## Schema Design

```graphql
# Types
type User {
  id: ID!
  username: String!
  email: String!
  posts(first: Int, after: String): PostConnection!
  createdAt: DateTime!
}

type Post {
  id: ID!
  title: String!
  content: String!
  author: User!
  comments: [Comment!]!
  publishedAt: DateTime
}

# Queries
type Query {
  user(id: ID!): User
  users(first: Int, after: String, filter: UserFilter): UserConnection!
  post(id: ID!): Post
  posts(first: Int, after: String): PostConnection!
}

# Mutations
type Mutation {
  createUser(input: CreateUserInput!): CreateUserPayload!
  updateUser(id: ID!, input: UpdateUserInput!): UpdateUserPayload!
  deleteUser(id: ID!): DeleteUserPayload!
}

# Subscriptions
type Subscription {
  postCreated(authorId: ID): Post!
  commentAdded(postId: ID!): Comment!
}

# Input types
input CreateUserInput {
  username: String!
  email: String!
  password: String!
}

# Payload types
type CreateUserPayload {
  user: User
  errors: [Error!]
}

# Connection types (Relay spec)
type UserConnection {
  edges: [UserEdge!]!
  pageInfo: PageInfo!
  totalCount: Int!
}

type UserEdge {
  node: User!
  cursor: String!
}

type PageInfo {
  hasNextPage: Boolean!
  hasPreviousPage: Boolean!
  startCursor: String
  endCursor: String
}
```

## Resolver Patterns

```javascript
// DataLoader for batching (solve N+1 problem)
const userLoader = new DataLoader(async (userIds) => {
  const users = await db.users.findMany({
    where: { id: { in: userIds } }
  });
  return userIds.map(id => users.find(u => u.id === id));
});

const resolvers = {
  Query: {
    user: (_, { id }, context) => {
      return context.loaders.user.load(id);
    },
    users: async (_, { first, after, filter }) => {
      // Cursor-based pagination
      const results = await db.users.findMany({
        where: filter,
        take: first + 1,
        cursor: after ? { id: after } : undefined,
      });

      const hasNextPage = results.length > first;
      const edges = results.slice(0, first).map(node => ({
        node,
        cursor: node.id,
      }));

      return {
        edges,
        pageInfo: {
          hasNextPage,
          endCursor: edges[edges.length - 1]?.cursor,
        },
      };
    },
  },

  User: {
    posts: (user, args, context) => {
      // Use DataLoader to batch load posts
      return context.loaders.postsByUser.load(user.id);
    },
  },

  Mutation: {
    createUser: async (_, { input }, context) => {
      // Validate input
      const errors = validateUserInput(input);
      if (errors.length > 0) {
        return { user: null, errors };
      }

      // Create user
      const user = await db.users.create({ data: input });

      return { user, errors: [] };
    },
  },
};
```
