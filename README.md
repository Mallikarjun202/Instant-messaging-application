# 💬 Chat App — Spring Boot + WebSocket

A real-time chat application built with Spring Boot, STOMP over WebSocket, and a vanilla JS frontend.

---

## 🚀 Quick Start (Dev — no setup required)

> Works out of the box with a local PostgreSQL database.

**Prerequisites:** Java 17+, PostgreSQL running locally

```bash
# 1. Clone
git clone https://github.com/your-username/chat-app.git
cd chat-app

# 2. Create the dev database
psql -U postgres -c "CREATE DATABASE chatdb_dev;"

# 3. Run
./mvnw spring-boot:run
```

Open [http://localhost:8080](http://localhost:8080)

The app runs with **all routes open** and a simple dev DB config. No credentials needed.

---

## 🔒 Enable Security (Production)

The app ships with a second security config that only activates on the `secure` profile.

```bash
# 1. Copy the example config
cp src/main/resources/application-secure.properties.example \
   src/main/resources/application-secure.properties

# 2. Fill in your real values
#    DB_URL, DB_USERNAME, DB_PASSWORD, JWT_SECRET

# 3. Run with the secure profile
./mvnw spring-boot:run --spring.profiles.active=secure
```

> ⚠️ `application-secure.properties` is in `.gitignore` — it will never be committed.

---

## 🗺️ Project Structure

```
src/main/java/.../
├── MessagingAppApplication.java   # Entry point
├── Message.java                   # Message entity (@PrePersist timestamp)
├── MessageController.java         # WebSocket handler (/app/chat)
├── MessageRepository.java         # JPA repo — messages are persisted
├── User.java                      # User entity (BCrypt-ready)
├── UserRepository.java            # JPA repo
├── SecurityConfig.java            # Dev profile — permits all
├── SecureSecurityConfig.java      # Secure profile — form login + auth
└── WebSocketConfig.java           # STOMP broker config

src/main/resources/
├── application.properties                     # Safe to commit, dev defaults
├── application-secure.properties.example      # Template for prod secrets
└── static/
    ├── index.html
    ├── css/chat.css
    └── js/app.js
```

---

## 💬 Usage

Send messages between two users by passing the receiver's ID as a URL param:

```
http://localhost:8080?to=2   # send to user with id=2
```

Messages are **persisted to the database** and routed to the receiver's private WebSocket queue in real time.

---

## 🛠️ Tech Stack

| Layer | Technology |
|---|---|
| Backend | Spring Boot 2.x, Spring Security, Spring Data JPA |
| Realtime | Spring WebSocket, STOMP, SockJS |
| Database | PostgreSQL |
| Frontend | Vanilla JS, SockJS client, STOMP.js |

---

## 🔐 Security Notes

- Passwords are hashed with **BCrypt** — never stored in plaintext
- Real credentials go in `application-secure.properties` (gitignored)
- CSRF is disabled for WebSocket compatibility — add a token strategy for production
- In production, replace `setAllowedOriginPatterns("*")` with your actual domain
