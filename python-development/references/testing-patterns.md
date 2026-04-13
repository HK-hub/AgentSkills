# Testing

#### pytest Configuration

```python
# pyproject.toml
[tool.pytest.ini_options]
testpaths = ["tests"]
python_files = ["test_*.py", "*_test.py"]
python_classes = ["Test*"]
python_functions = ["test_*"]
addopts = [
    "-v",
    "--strict-markers",
    "--cov=app",
    "--cov-report=term-missing",
    "--cov-report=html",
    "--cov-fail-under=80"
]
asyncio_mode = "auto"
markers = [
    "unit: Unit tests",
    "integration: Integration tests",
    "slow: Slow running tests"
]
```

#### Unit Tests

```python
# tests/unit/test_user_service.py
import pytest
from unittest.mock import AsyncMock, MagicMock
from fastapi import HTTPException
from app.services.user import UserService
from app.schemas.user import UserCreate, UserUpdate
from app.models.user import User


@pytest.fixture
def mock_session():
    """Mock database session."""
    return AsyncMock()


@pytest.fixture
def user_service(mock_session):
    """Create user service with mocked session."""
    return UserService(mock_session)


@pytest.fixture
def sample_user():
    """Sample user for testing."""
    return User(
        id=1,
        email="test@example.com",
        name="Test User",
        hashed_password="hashedpassword",
        is_active=True
    )


class TestUserService:
    """Test cases for UserService."""

    @pytest.mark.asyncio
    async def test_create_user_success(self, user_service, sample_user):
        """Test successful user creation."""
        # Arrange
        user_data = UserCreate(
            email="test@example.com",
            name="Test User",
            password="password123"
        )
        user_service.repository.exists_by_email = AsyncMock(return_value=False)
        user_service.repository.create = AsyncMock(return_value=sample_user)

        # Act
        result = await user_service.create_user(user_data)

        # Assert
        assert result.email == "test@example.com"
        assert result.name == "Test User"
        user_service.repository.exists_by_email.assert_awaited_once_with("test@example.com")
        user_service.repository.create.assert_awaited_once()

    @pytest.mark.asyncio
    async def test_create_user_email_exists(self, user_service):
        """Test user creation with existing email."""
        # Arrange
        user_data = UserCreate(
            email="test@example.com",
            name="Test User",
            password="password123"
        )
        user_service.repository.exists_by_email = AsyncMock(return_value=True)

        # Act & Assert
        with pytest.raises(HTTPException) as exc_info:
            await user_service.create_user(user_data)

        assert exc_info.value.status_code == 409
        assert "Email already registered" in exc_info.value.detail

    @pytest.mark.asyncio
    async def test_get_user_not_found(self, user_service):
        """Test getting non-existent user."""
        # Arrange
        user_service.repository.get_by_id = AsyncMock(return_value=None)

        # Act & Assert
        with pytest.raises(HTTPException) as exc_info:
            await user_service.get_user(999)

        assert exc_info.value.status_code == 404
        assert "User not found" in exc_info.value.detail

    @pytest.mark.asyncio
    async def test_update_user_success(self, user_service, sample_user):
        """Test successful user update."""
        # Arrange
        user_data = UserUpdate(name="Updated Name")
        updated_user = User(**sample_user.__dict__)
        updated_user.name = "Updated Name"

        user_service.repository.get_by_id = AsyncMock(return_value=sample_user)
        user_service.repository.update = AsyncMock(return_value=updated_user)

        # Act
        result = await user_service.update_user(1, user_data)

        # Assert
        assert result.name == "Updated Name"
        user_service.repository.update.assert_awaited_once()
```

#### Integration Tests

```python
# tests/integration/test_user_api.py
import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker
from app.main import app
from app.core.database import Base, get_db
from app.models.user import User


# Test database URL
TEST_DATABASE_URL = "sqlite+aiosqlite:///:memory:"

# Create test engine
test_engine = create_async_engine(TEST_DATABASE_URL, echo=False)
TestSessionLocal = sessionmaker(
    test_engine, class_=AsyncSession, expire_on_commit=False
)


async def override_get_db():
    """Override database dependency for testing."""
    async with TestSessionLocal() as session:
        yield session


app.dependency_overrides[get_db] = override_get_db


@pytest.fixture(autouse=True)
async def setup_database():
    """Setup test database before each test."""
    async with test_engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield
    async with test_engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)


@pytest.mark.integration
class TestUserAPI:
    """Integration tests for User API."""

    @pytest.mark.asyncio
    async def test_create_user(self):
        """Test creating a user via API."""
        async with AsyncClient(app=app, base_url="http://test") as client:
            response = await client.post(
                "/api/v1/users/",
                json={
                    "email": "test@example.com",
                    "name": "Test User",
                    "password": "password123"
                }
            )

        assert response.status_code == 201
        data = response.json()
        assert data["email"] == "test@example.com"
        assert data["name"] == "Test User"
        assert "id" in data

    @pytest.mark.asyncio
    async def test_create_user_duplicate_email(self):
        """Test creating user with duplicate email."""
        user_data = {
            "email": "test@example.com",
            "name": "Test User",
            "password": "password123"
        }

        async with AsyncClient(app=app, base_url="http://test") as client:
            # Create first user
            await client.post("/api/v1/users/", json=user_data)

            # Try to create duplicate
            response = await client.post("/api/v1/users/", json=user_data)

        assert response.status_code == 409
        assert "Email already registered" in response.json()["detail"]

    @pytest.mark.asyncio
    async def test_get_user(self):
        """Test getting a user by ID."""
        async with AsyncClient(app=app, base_url="http://test") as client:
            # Create user
            create_response = await client.post(
                "/api/v1/users/",
                json={
                    "email": "test@example.com",
                    "name": "Test User",
                    "password": "password123"
                }
            )
            user_id = create_response.json()["id"]

            # Get user (assuming authentication is bypassed in tests)
            response = await client.get(f"/api/v1/users/{user_id}")

        assert response.status_code == 200
        data = response.json()
        assert data["id"] == user_id
        assert data["email"] == "test@example.com"
```
