package chatapp_Instant.message.server.demo;

import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface GroupMessageRepository extends JpaRepository<GroupMessage, Long> {

    // Excludes soft-deleted messages
    @Query("""
            SELECT m FROM GroupMessage m
            WHERE m.group.id = :groupId
              AND m.deleted = false
            ORDER BY m.timestamp ASC
            """)
    List<GroupMessage> findByGroupIdOrderByTimestampAsc(
            @Param("groupId") Long groupId,
            Pageable pageable);
}