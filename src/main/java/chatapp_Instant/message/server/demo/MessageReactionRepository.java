package chatapp_Instant.message.server.demo;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface MessageReactionRepository extends JpaRepository<MessageReaction, Long> {

    List<MessageReaction> findByMessageId(Long messageId);

    Optional<MessageReaction> findByMessageIdAndUserIdAndEmoji(Long messageId, Long userId, String emoji);

    void deleteByMessageIdAndUserIdAndEmoji(Long messageId, Long userId, String emoji);

    @Query("SELECT r FROM MessageReaction r WHERE r.message.id IN :messageIds")
    List<MessageReaction> findByMessageIds(@Param("messageIds") List<Long> messageIds);
}