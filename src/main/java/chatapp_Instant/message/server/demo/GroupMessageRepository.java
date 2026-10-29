package chatapp_Instant.message.server.demo;

import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.time.LocalDateTime;
import java.util.List;

@Repository
public interface GroupMessageRepository extends JpaRepository<GroupMessage, Long> {

    // Newest first, so page 0 is the latest messages. Callers reverse a page
    // before showing it. Only messages after `since` (the user's last clear).
    @Query("""
            SELECT m FROM GroupMessage m
            WHERE m.group.id = :groupId
              AND m.deleted = false
              AND m.timestamp > :since
            ORDER BY m.timestamp DESC, m.id DESC
            """)
    List<GroupMessage> findRecent(
            @Param("groupId") Long groupId,
            @Param("since") LocalDateTime since,
            Pageable pageable);
}