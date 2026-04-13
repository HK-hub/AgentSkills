## Core Competencies

### 1. Creational Patterns

**Singleton Pattern**
- Ensure a class has only one instance
- Provide global access point
- Use for configuration managers, connection pools, logging

```java
public class DatabaseConnection {
    private static volatile DatabaseConnection instance;
    private DatabaseConnection() {}
    
    public static DatabaseConnection getInstance() {
        if (instance == null) {
            synchronized (DatabaseConnection.class) {
                if (instance == null) {
                    instance = new DatabaseConnection();
                }
            }
        }
        return instance;
    }
}
```

**Factory Method Pattern**
- Define interface for creating objects
- Let subclasses decide which class to instantiate
- Use when exact types aren't known until runtime

```typescript
interface Product {
    operation(): string;
}

abstract class Creator {
    abstract factoryMethod(): Product;
    
    someOperation(): string {
        const product = this.factoryMethod();
        return product.operation();
    }
}
```

**Builder Pattern**
- Construct complex objects step by step
- Separate construction from representation
- Use for objects with many optional parameters

```python
class User:
    def __init__(self):
        self.name = None
        self.email = None
        self.age = None
        
class UserBuilder:
    def __init__(self):
        self.user = User()
    
    def with_name(self, name):
        self.user.name = name
        return self
    
    def with_email(self, email):
        self.user.email = email
        return self
    
    def build(self):
        return self.user
```

**Prototype Pattern**
- Clone existing objects without coupling to their classes
- Use when object creation is expensive

**Abstract Factory Pattern**
- Provide interface for creating families of related objects
- Use when system should be independent of how objects are created

### 2. Structural Patterns

**Adapter Pattern**
- Convert interface of a class into another interface
- Allow incompatible interfaces to work together

```go
type LegacyPrinter interface {
    PrintOld(text string)
}

type ModernPrinter interface {
    Print(text string)
}

type PrinterAdapter struct {
    legacy LegacyPrinter
}

func (a *PrinterAdapter) Print(text string) {
    a.legacy.PrintOld(text)
}
```

**Decorator Pattern**
- Attach additional responsibilities to objects dynamically
- Provide flexible alternative to subclassing

```typescript
interface Component {
    operation(): string;
}

class ConcreteComponent implements Component {
    operation(): string {
        return "ConcreteComponent";
    }
}

class Decorator implements Component {
    protected component: Component;
    
    constructor(component: Component) {
        this.component = component;
    }
    
    operation(): string {
        return this.component.operation();
    }
}

class ConcreteDecorator extends Decorator {
    operation(): string {
        return `ConcreteDecorator(${super.operation()})`;
    }
}
```

**Facade Pattern**
- Provide unified interface to a set of interfaces
- Simplify complex subsystem

**Proxy Pattern**
- Provide placeholder for another object
- Control access, lazy initialization, logging

**Composite Pattern**
- Compose objects into tree structures
- Treat individual objects and compositions uniformly

**Bridge Pattern**
- Decouple abstraction from implementation
- Both can vary independently

**Flyweight Pattern**
- Share common state between multiple objects
- Reduce memory footprint

### 3. Behavioral Patterns

**Strategy Pattern**
- Define family of algorithms
- Make them interchangeable
- Use when you need different variants of an algorithm

```java
interface PaymentStrategy {
    void pay(int amount);
}

class CreditCardStrategy implements PaymentStrategy {
    public void pay(int amount) {
        System.out.println("Paid " + amount + " using Credit Card");
    }
}

class PayPalStrategy implements PaymentStrategy {
    public void pay(int amount) {
        System.out.println("Paid " + amount + " using PayPal");
    }
}

class ShoppingCart {
    private PaymentStrategy paymentStrategy;
    
    public void setPaymentStrategy(PaymentStrategy strategy) {
        this.paymentStrategy = strategy;
    }
    
    public void checkout(int amount) {
        paymentStrategy.pay(amount);
    }
}
```

**Observer Pattern**
- Define one-to-many dependency
- When one object changes, notify dependents
- Use for event handling systems

```python
class Subject:
    def __init__(self):
        self._observers = []
    
    def attach(self, observer):
        self._observers.append(observer)
    
    def notify(self, event):
        for observer in self._observers:
            observer.update(event)

class Observer:
    def update(self, event):
        pass
```

**Command Pattern**
- Encapsulate request as an object
- Parameterize clients with different requests
- Support undo/redo operations

**State Pattern**
- Allow object to alter behavior when internal state changes
- Object appears to change its class

**Template Method Pattern**
- Define skeleton of algorithm in base class
- Let subclasses override specific steps

**Iterator Pattern**
- Access elements of aggregate sequentially
- Without exposing underlying representation

**Mediator Pattern**
- Define object that encapsulates how objects interact
- Reduce coupling between components

**Memento Pattern**
- Capture and externalize object's internal state
- Allow object restoration later

**Chain of Responsibility Pattern**
- Pass request along chain of handlers
- Each handler decides to process or pass on

**Visitor Pattern**
- Separate algorithm from object structure
- Add new operations without modifying objects

### 4. Architectural Patterns

**Model-View-Controller (MVC)**
- Separate concerns: data (Model), presentation (View), logic (Controller)
- Use for web applications, desktop applications

**Model-View-ViewModel (MVVM)**
- Separate UI from business logic
- Use data binding between View and ViewModel
- Popular in WPF, Angular, Vue.js

**Clean Architecture**
- Dependency rule: dependencies point inward
- Entities → Use Cases → Interface Adapters → Frameworks
- Independent of frameworks, UI, database

**Hexagonal Architecture (Ports and Adapters)**
- Application core isolated from external concerns
- Ports define interfaces, Adapters implement them
- Easy to test, swap implementations

**Repository Pattern**
- Mediate between domain and data mapping layers
- Provides collection-like interface for accessing domain objects

```typescript
interface UserRepository {
    findById(id: string): Promise<User>;
    save(user: User): Promise<void>;
    delete(id: string): Promise<void>;
}

class UserRepositoryImpl implements UserRepository {
    async findById(id: string): Promise<User> {
        // Database access logic
    }
    
    async save(user: User): Promise<void> {
        // Save logic
    }
}
```

**CQRS (Command Query Responsibility Segregation)**
- Separate read and write operations
- Different models for updates and queries
- Improves scalability and performance

**Event Sourcing**
- Store state as sequence of events
- Rebuild current state by replaying events
- Provides audit trail, time travel

### 5. Modern Patterns

**Dependency Injection**
- Inversion of Control principle
- Dependencies provided from outside
- Improves testability, flexibility

```java
public class UserService {
    private final UserRepository repository;
    
    // Constructor injection
    public UserService(UserRepository repository) {
        this.repository = repository;
    }
}
```

**Service Locator**
- Central registry for obtaining services
- Alternative to Dependency Injection

**Null Object Pattern**
- Provide default object instead of null
- Eliminates null checks

```python
class User:
    def get_name(self):
        pass

class RealUser(User):
    def __init__(self, name):
        self.name = name
    
    def get_name(self):
        return self.name

class NullUser(User):
    def get_name(self):
        return "Guest"
```

**Object Pool Pattern**
- Reuse expensive-to-create objects
- Manage pool of reusable objects

**Circuit Breaker Pattern**
- Prevent cascading failures
- Fail fast when service is unavailable
