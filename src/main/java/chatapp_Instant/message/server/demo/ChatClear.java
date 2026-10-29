package chatapp_Instant.message.server.demo;

import jakarta.persistence.*;
import java.time.LocalDateTime;

/**
 * Records when one user cleared one chat.
 *
 * Clearing is per user: messages stay in the database and the other people in
 * the chat still see them. When a user loads a chat, only messages sent after
 * their clearedAt are returned.
 */
@Entity
@Table(name = "chat_clears",
        uniqueConstraints = @UniqueConstraint(columnNames = { "user_id", "chat_type", "chat_id" }))
public class ChatClear {

    public static final String DM = "dm";
    public static final String GROUP = "group";

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "user_id", nullable = false)
    private Long userId;

    // "dm" (chatId = the other user's id) or "group" (chatId = the group's id)
    @Column(name = "chat_type", nullable = false, length = 5)
    private String chatType;

    @Column(name = "chat_id", nullable = false)
    private Long chatId;

    @Column(name = "cleared_at", nullable = false)
    private LocalDateTime clearedAt;

    public Long getId() {
        return id;
    }

    public Long getUserId() {
        return userId;
    }

    public void setUserId(Long userId) {
        this.userId = userId;
    }

    public String getChatType() {
        return chatType;
    }

    public void setChatType(String chatType) {
        this.chatType = chatType;
    }

    public Long getChatId() {
        return chatId;
    }

    public void setChatId(Long chatId) {
        this.chatId = chatId;
    }

    public LocalDateTime getClearedAt() {
        return clearedAt;
    }

    public void setClearedAt(LocalDateTime clearedAt) {
        this.clearedAt = clearedAt;
    }
}
