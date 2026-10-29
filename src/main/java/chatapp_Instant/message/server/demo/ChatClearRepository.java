package chatapp_Instant.message.server.demo;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.time.LocalDateTime;
import java.util.Optional;

@Repository
public interface ChatClearRepository extends JpaRepository<ChatClear, Long> {

    Optional<ChatClear> findByUserIdAndChatTypeAndChatId(Long userId, String chatType, Long chatId);

    /** Messages sent after this moment are visible to the user. */
    default LocalDateTime visibleSince(Long userId, String chatType, Long chatId) {
        return findByUserIdAndChatTypeAndChatId(userId, chatType, chatId)
                .map(ChatClear::getClearedAt)
                .orElse(LocalDateTime.of(1970, 1, 1, 0, 0));
    }

    /** Hides everything sent up to now in this chat, for this user only. */
    default void markCleared(Long userId, String chatType, Long chatId) {
        ChatClear clear = findByUserIdAndChatTypeAndChatId(userId, chatType, chatId)
                .orElseGet(() -> {
                    ChatClear c = new ChatClear();
                    c.setUserId(userId);
                    c.setChatType(chatType);
                    c.setChatId(chatId);
                    return c;
                });
        clear.setClearedAt(LocalDateTime.now());
        save(clear);
    }
}
