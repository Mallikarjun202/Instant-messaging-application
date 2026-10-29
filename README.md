# Instant Messaging Application

![build](https://github.com/Mallikarjun202/Instant-messaging-application/actions/workflows/build.yml/badge.svg)

A real-time chat app with direct messages and group chats, built with Spring Boot, WebSocket (STOMP over SockJS) and PostgreSQL.

**Live demo:** https://messaging-application-6u6c.onrender.com

It runs on Render's free tier, so the first request after a quiet spell can take up to a minute while the server wakes up. Register two accounts in two browser windows to try it.

## What it does

- Register and log in (passwords hashed with BCrypt, session-based login with Spring Security)
- Direct messages and group chats, delivered live over WebSocket
- Read receipts, typing indicators, reactions and replies
- Pin and mute conversations, search messages
- Clear a chat for yourself without deleting it for the other person
- Dark and light themes, works on mobile

## Tech stack

| Layer | Technology |
|---|---|
| Backend | Java 21, Spring Boot 3.4.5 |
| Security | Spring Security, BCrypt |
| Real-time | WebSocket, STOMP, SockJS |
| Database | PostgreSQL (Supabase in production) |
| ORM | Spring Data JPA, Hibernate |
| Frontend | HTML, CSS, plain JavaScript |
| Deployment | Docker on Render |

## How it's secured

- Every REST and WebSocket handler takes the user from the logged-in session, never from the request body, so you can't send messages or typing events as someone else.
- You can only read conversations you're part of. Group history, group messages and group typing events check membership. Reactions check that you're one of the two people in that conversation.
- CORS and the WebSocket endpoint accept only the app's own origin (`ALLOWED_ORIGIN`).
- The session cookie is `SameSite=Lax` and `HttpOnly`. CSRF tokens are turned off because of the SockJS setup, so `SameSite` is what stops cross-site form posts.
- Credentials come from environment variables. `.gitignore` keeps the local properties files out of the repo.

## Running locally

You need Java 21, Maven and PostgreSQL.

```bash
git clone https://github.com/Mallikarjun202/Instant-messaging-application.git
cd Instant-messaging-application
psql -U postgres -c "CREATE DATABASE chatdb_dev;"
cp src/main/resources/application-local.properties.example src/main/resources/application-local.properties
# put your database password in application-local.properties
SPRING_PROFILES_ACTIVE=secure,local mvn spring-boot:run
```

On Windows PowerShell, run `$env:SPRING_PROFILES_ACTIVE="secure,local"` first, then `mvn spring-boot:run`.

Open http://localhost:8080. `secure` turns on login; `local` reads the database settings from `application-local.properties`. With `local` alone there's no login, so the chat API returns 401 for everything.

## Deploying (Render)

The Dockerfile builds the JAR with Maven and runs it on a Java 21 JRE. Set these environment variables on the service:

| Variable | Value |
|---|---|
| `SPRING_PROFILES_ACTIVE` | `secure` |
| `SPRING_DATASOURCE_URL` | your Postgres JDBC URL |
| `SPRING_DATASOURCE_USERNAME` | database user |
| `SPRING_DATASOURCE_PASSWORD` | database password |
| `ALLOWED_ORIGIN` | the app's URL, e.g. `https://messaging-application-6u6c.onrender.com` (no trailing slash) |

## Bugs I found and fixed

Reviewing the code after the first deploy turned up these:

- **Chat previews showed the oldest message, not the newest.** History queries sorted oldest first, so "page 0, size 1" returned the first message ever sent. The same bug meant that once a chat passed 50 messages, opening it showed the first 50 and never the new ones. Queries now return newest first and the server flips each page before sending it.
- **Clearing a chat deleted it for everyone.** The clear button soft-deleted the shared message rows, so the other person (or every group member) lost their history too. Clearing is now per user: a `chat_clears` table stores when you cleared a chat, and you only see messages after that.
- **Group typing indicators never fired.** With `open-in-view` off, the typing handler had no database session, so loading the group's members threw an exception. The handler is now transactional and checks membership.
- **Anyone logged in could react to any message** by guessing its id. Reactions now check that you're in that conversation.
- **CORS and WebSocket trusted every `*.onrender.com` site.** Anyone can host a site there for free. Both now accept only the app's own URL.
- **Passwords were trimmed at sign-up but not at login**, so a password with a leading or trailing space could never log in. It's no longer trimmed.

## Known limitations

- There are no automated tests yet. CI only checks that the project compiles and packages.
- The in-memory STOMP broker only works with one server instance. Running more than one would need an external broker such as RabbitMQ.
- Users are listed with a cap of 100, and there's no user search on the server.

## Project layout

```
src/main/java/chatapp_Instant/message/server/demo/
  MessagingAppApplication.java   entry point
  AuthController.java            register, current user
  MessageController.java         direct messages, reactions, read receipts, clear
  GroupController.java           groups, members, group messages, clear
  TypingController.java          typing indicators
  ChatClear.java                 per-user "cleared at" record
  SecurityConfig.java            local profile (no login)
  SecureSecurityConfig.java      secure profile (form login)
  WebSocketConfig.java           STOMP endpoint and broker
  *Repository.java, User, Message, ChatGroup, GroupMessage, MessageReaction
src/main/resources/
  application.properties
  application-local.properties.example
  application-secure.properties.example
  static/   index.html, login.html, register.html, css/chat.css, js/app.js
```
