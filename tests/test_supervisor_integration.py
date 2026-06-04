from fastapi.testclient import TestClient
from analytics_agent.api.app import app
from analytics_agent.config import settings

def test_execute_endpoint_unauthorized():
    # Call execute endpoint without token or with invalid token
    payload = {
        "trace_id": "test_trace",
        "run_id": "test_run",
        "session_id": "test_session",
        "agent_name": "performance-marketer",
        "user_input": "Optimize ROAS",
        "client_id": "test_client",
        "task": {
            "type": "optimize",
            "instruction": "Optimize ROAS"
        }
    }
    with TestClient(app) as client:
        # No header
        response = client.post("/execute", json=payload)
        assert response.status_code == 401
        assert response.json()["status"] == "failed"
        assert "Unauthorized" in response.json()["error"]["message"]

        # Invalid header
        response = client.post("/execute", json=payload, headers={"X-Supervisor-Token": "invalid_token"})
        assert response.status_code == 401
        assert response.json()["status"] == "failed"
        assert "Unauthorized" in response.json()["error"]["message"]


def test_execute_endpoint_authorized_success():
    payload = {
        "trace_id": "test_trace",
        "run_id": "test_run",
        "session_id": "test_session",
        "agent_name": "performance-marketer",
        "user_input": "Optimize ROAS",
        "client_id": "test_client",
        "task": {
            "type": "optimize",
            "instruction": "Optimize ROAS"
        }
    }
    with TestClient(app) as client:
        # Valid header
        headers = {"X-Supervisor-Token": settings.SUPERVISOR_TOKEN}
        response = client.post("/execute", json=payload, headers=headers)
        
        # Verify response structure and status code
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "ok"
        assert data["agent_name"] == "performance-marketer"
        assert "insights" in data
        assert "opportunities" in data
        assert data["error"] is None


def test_custom_credentials_login_flow():
    with TestClient(app) as client:
        # 1. Invalid login attempt
        response = client.post("/api/auth/login", json={"email": "wrong@wrong.com", "password": "badpassword"})
        assert response.status_code == 401
        
        # 2. Valid seeded login attempt (seeded in startup hook)
        response = client.post("/api/auth/login", json={"email": "demo@gmail.com", "password": "password123"})
        assert response.status_code == 200
        data = response.json()
        assert data["success"] is True
        assert data["client_id"] == "local-client"
        assert "access_token" in data
        assert data["user"]["email"] == "demo@gmail.com"
