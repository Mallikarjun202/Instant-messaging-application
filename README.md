# 💬 Instant Messaging Application

A full-stack real-time chat application built with Spring Boot and WebSocket.

🔗 **Live Demo:** https://messaging-application-6u6c.onrender.com

---

## ✨ Features

- 🔐 Secure user registration & login
- 💬 Real-time direct messaging via WebSocket
- 👥 Group chat support
- ✅ Read receipts
- ⌨️ Typing indicators
- 😀 Message reactions
- ↩️ Reply to messages
- 📌 Pin & mute conversations
- 🔍 Search messages
- 🗑️ Clear chat
- 🌙 Dark / Light theme
- 📱 Mobile responsive

---

## 🛠️ Tech Stack

| Layer | Technology |
|-------|-----------|
| Backend | Java 21, Spring Boot 3.4.5 |
| Security | Spring Security (BCrypt) |
| Real-time | WebSocket, STOMP, SockJS |
| Database | PostgreSQL (Supabase) |
| ORM | Spring Data JPA, Hibernate |
| Frontend | HTML, CSS, Vanilla JavaScript |
| Deployment | Render (app), Supabase (DB) |

---

## 🚀 Running Locally

### Prerequisites
- Java 21+
- PostgreSQL running locally
- Maven

### Steps

1. Clone the repo:
```bash
git clone https://github.com/Mallikarjun202/Instant-messaging-application.git
cd Instant-messaging-application
```

2. Create the local database:
```bash
psql -U postgres -c "CREATE DATABASE chatdb_dev;"
```

3. Create `src/main/resources/application-local.properties`:
```properties
spring.datasource.url=jdbc:postgresql://localhost:5432/chatdb_dev
spring.datasource.username=postgres
spring.datasource.password=your_password
```

4. Run:
```bash
mvn spring-boot:run
```

5. Open `http://localhost:8080`

---

## 🔒 Security

- Passwords hashed with **BCrypt**
- Credentials stored in environment variables — never committed
- Profile-based security config (`dev` vs `secure`)
- WebSocket origin restricted in production

---

## 📁 Project Structure
├── src/main/java/
└── chatapp_Instant/message/server/demo/
├── MessagingAppApplication.java
├── AuthController.java
├── MessageController.java
├── GroupController.java
├── TypingController.java
├── WebSocketConfig.java
├── SecurityConfig.java
├── SecureSecurityConfig.java
├── User.java / Message.java / ChatGroup.java
└── *Repository.java

src/main/resources/
├── application.properties
├── application-secure.properties.example
└── static/
├── index.html / login.html / register.html
├── css/chat.css
└── js/app.js
---
