#!/usr/bin/env python
"""
Helper script to add new users to the MarkoAI analytics database.
Usage:
    python add_user.py --email user@company.com --password mysecurepass --client-id my-new-workspace
"""
import sys
import argparse
import hashlib
import secrets
from analytics_agent.db.repo import get_session
from analytics_agent.db.models import User

def hash_password(password: str) -> str:
    salt = secrets.token_hex(16)
    hashed = hashlib.sha256((password + salt).encode('utf-8')).hexdigest()
    return f"{salt}:{hashed}"

def main():
    parser = argparse.ArgumentParser(description="Add a new user to MarkoAI database and allot a workspace.")
    parser.add_argument("--email", required=True, help="User's email (serves as login username)")
    parser.add_argument("--password", required=True, help="User's plain password")
    parser.add_argument("--client-id", required=True, help="Workspace/Client ID to allot to the user (e.g. client-abc)")

    args = parser.parse_args()
    email = args.email.strip().lower()
    password = args.password
    client_id = args.client_id.strip()

    if not email or not password or not client_id:
        print("Error: Email, password, and client-id cannot be empty.")
        sys.exit(1)

    session = get_session()
    try:
        # Check if user already exists
        existing_user = session.query(User).filter(User.email == email).first()
        if existing_user:
            print(f"Error: User with email '{email}' already exists. (Workspace: {existing_user.client_id})")
            sys.exit(1)

        # Create new user
        password_hash = hash_password(password)
        new_user = User(
            email=email,
            password_hash=password_hash,
            client_id=client_id
        )
        session.add(new_user)
        session.commit()
        print(f"Success: Created user '{email}' and allotted workspace '{client_id}'.")
    except Exception as e:
        session.rollback()
        print(f"Database error: {e}")
        sys.exit(1)
    finally:
        session.close()

if __name__ == "__main__":
    main()
